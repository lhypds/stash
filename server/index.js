import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";
import sharp from "sharp";
import { captureFullPage } from "./utils/screenshot.js";
import {
  STORES,
  SHOT_STORES,
  ITEM_ID_RE,
  UA,
  urlStoreFor,
  isBlockedHost,
  isNsfwUrl,
  searchSources,
  analyzeSource,
  backfillSkillMeta,
  noteTitle,
  saveNoteImage,
} from "./stores.js";
import { ensureSettings, writeSettings, passwordsMatch, userExists } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DIST_DIR = path.join(ROOT, "dist");

// Load .env (KEY=value lines); variables already set in the environment win
try {
  for (const line of (await fs.readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch { }

const PORT = process.env.PORT || 3001;
const DEV = process.env.NODE_ENV !== "production";

const USERNAME_RE =
  /^[a-z0-9_\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}-]{1,32}$/u;

const userDir = (username) => path.join(DATA_DIR, "users", username);
const storeDir = (username, store) => path.join(userDir(username), "stores", store);
const itemDir = (username, store, itemId) => path.join(storeDir(username, store), itemId);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

function withIconUrl(username, record) {
  const base = `/data/users/${encodeURIComponent(username)}/stores/${record.store}/${record.itemId}`;
  return {
    ...record,
    // A note's image keeps the name it was attached with (see noteImageName),
    // which can hold spaces or non-ASCII; every other store's is generated and
    // encodes to itself.
    iconUrl: record.iconFile ? `${base}/${encodeURIComponent(record.iconFile)}` : null,
    screenshotUrl: record.screenshotFile ? `${base}/${encodeURIComponent(record.screenshotFile)}` : null,
  };
}

// Downloads a source-supplied icon/thumbnail URL into the item's own
// directory, named by content-type. Some CDNs (e.g. one of Pornhub's two
// image edges) 403 hotlinked fetches unless the Referer matches the site the
// image belongs to, so it's sent when the source URL's origin is known.
async function downloadIcon(dir, imageBase, iconUrl, sourceUrl) {
  try {
    const headers = { "User-Agent": UA };
    if (typeof sourceUrl === "string" && /^https?:\/\//.test(sourceUrl)) headers.Referer = new URL(sourceUrl).origin + "/";
    const r = await fetch(iconUrl, { headers });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());

    // Vector/favicon formats don't benefit from raster re-encoding; keep as-is
    if (type.includes("svg") || type.includes("icon")) {
      const file = `${imageBase}.${type.includes("svg") ? "svg" : "ico"}`;
      await fs.writeFile(path.join(dir, file), buf);
      return file;
    }

    try {
      const file = `${imageBase}.webp`;
      await sharp(buf, { animated: true }).webp({ quality: 80 }).toFile(path.join(dir, file));
      return file;
    } catch {
      // Not a decodable raster image (or an unsupported format): keep the original bytes
      const ext = type.includes("png") ? "png" : type.includes("gif") ? "gif" : "jpg";
      const file = `${imageBase}.${ext}`;
      await fs.writeFile(path.join(dir, file), buf);
      return file;
    }
  } catch (err) {
    console.error("icon download failed:", err.message);
    return null;
  }
}

// Fire-and-forget: stashing responds immediately, the screenshot lands later
function captureInBackground(username, store, itemId, url) {
  const dir = itemDir(username, store, itemId);
  const file = "screenshot.webp";
  captureFullPage(url, path.join(dir, file))
    .then(async () => {
      const jsonFile = path.join(dir, "item.json");
      const record = await readJson(jsonFile, null);
      // record is null if the item was deleted mid-capture
      if (record) await writeJson(jsonFile, { ...record, screenshotFile: file });
    })
    .catch((err) => console.error("screenshot failed:", err.message));
}

/* ---------- app ---------- */

const app = express();
// A written note can carry an inlined image (a data: URL, since there's no
// multipart parser here), so its own route gets a much larger body limit.
// Registered first: the general parser below skips a body already parsed.
app.use("/api/users/:username/notes", express.json({ limit: "12mb" }), (err, req, res, next) => {
  // Keep a rejected body an API-shaped error rather than express's HTML page,
  // so the client can tell the user what actually went wrong.
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "image too large", code: "IMAGE_TOO_LARGE" });
  next(err);
});
app.use(express.json());
app.set("trust proxy", true);

// Login sessions are deliberately kept server-side so the password never has
// to live in localStorage. A restart signs everyone out; the client quietly
// restores passwordless accounts and asks locked accounts to log in again.
const SESSION_COOKIE = "stash_session";
const SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map();

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
}

function currentSession(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function startSession(username, unlocked, req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { username, unlocked, expiresAt: Date.now() + SESSION_AGE_MS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_AGE_MS,
    path: "/",
  });
}

function clearSession(req, res) {
  const session = currentSession(req);
  if (session) sessions.delete(session.token);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" });
}

function requireOwner(req, res, next) {
  const session = currentSession(req);
  if (!session || session.username !== req.params.username) {
    return res.status(401).json({ error: "login required", code: "LOGIN_REQUIRED" });
  }
  req.session = session;
  next();
}

async function requireUnlockedOwner(req, res, next) {
  const session = currentSession(req);
  if (!session || session.username !== req.params.username) {
    return res.status(401).json({ error: "login required", code: "LOGIN_REQUIRED" });
  }
  const settings = await ensureSettings(req.params.username);
  if (settings.isLocked && !session.unlocked) {
    return res.status(423).json({ error: "stash locked", code: "STASH_LOCKED" });
  }
  req.session = session;
  next();
}

// Coarse per-IP fixed-window limiter for the outbound-fetch endpoints. Sized so
// a single paste (up to MAX_URLS analyze calls at once) is fine, but a script
// hammering them isn't. In-memory, so it resets on restart and is per-process.
const rateHits = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || "?";
    const rec = rateHits.get(ip);
    if (!rec || now - rec.start >= windowMs) {
      rateHits.set(ip, { start: now, count: 1 });
    } else if (rec.count >= max) {
      return res.status(429).json({ error: "too many requests" });
    } else {
      rec.count++;
    }
    // Opportunistic cleanup so the map can't grow without bound
    if (rateHits.size > 5000) {
      for (const [k, v] of rateHits) if (now - v.start >= windowMs) rateHits.delete(k);
    }
    next();
  };
}
const analyzeLimiter = rateLimit(60000, 120);

app.param("username", (req, res, next, username) => {
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "invalid username" });
  next();
});
app.param("store", (req, res, next, store) => {
  if (!STORES[store]) return res.status(400).json({ error: "invalid store" });
  next();
});
app.param("itemId", (req, res, next, itemId) => {
  if (!ITEM_ID_RE.test(itemId)) return res.status(400).json({ error: "invalid itemId" });
  next();
});

app.get("/api/search", analyzeLimiter, async (req, res) => {
  const term = String(req.query.term || "").trim();
  const store = req.query.store;
  const country = /^[a-z]{2}$/.test(req.query.country || "") ? req.query.country : "us";
  if (STORES[store]?.type !== "search") return res.status(400).json({ error: "invalid store" });
  if (!term) return res.json({ results: [] });

  // Search is usable while logged out, so an anonymous caller just gets every
  // engine on; a logged-in searcher's own settings.json trims theirs down.
  const session = currentSession(req);
  const searchSettings = session ? (await ensureSettings(session.username)).search : undefined;

  try {
    res.json({ results: await searchSources(store, term, country, searchSettings) });
  } catch (err) {
    console.error("search failed:", err.message);
    res.status(502).json({ error: "search failed" });
  }
});

app.get("/api/analyze", analyzeLimiter, async (req, res) => {
  const raw = String(req.query.url || "").trim();
  const country = /^[a-z]{2}$/.test(req.query.country || "") ? req.query.country : "us";
  let url;
  try {
    url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  if (isBlockedHost(url.hostname)) return res.status(400).json({ error: "invalid url" });

  // The universal analyser sends store=auto (or nothing) and lets the host
  // decide; an explicit store still pins the analyzer for direct callers
  let store = req.query.store;
  if (!store || store === "auto") store = urlStoreFor(url.href);
  const type = STORES[store]?.type;
  if (type !== "url" && type !== "search") return res.status(400).json({ error: "invalid store" });

  try {
    res.json({ result: await analyzeSource(url.href, store, country) });
  } catch (err) {
    console.error("analyze failed:", err.message);
    res.status(502).json({ error: "analyze failed" });
  }
});

// The only hosts we currently ever hand back as a post's `video` (see
// analyzePost's X and Instagram handling) — kept as an allowlist so this
// can't turn into an open fetch-anything proxy. Instagram's CDN hostname
// varies by edge node (e.g. scontent-itm1-1.cdninstagram.com), so it's
// matched by domain suffix rather than an exact set like twimg.com's is.
const VIDEO_PROXY_HOSTS = new Set(["video.twimg.com"]);
const VIDEO_PROXY_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];
const isAllowedVideoProxyHost = (hostname) =>
  VIDEO_PROXY_HOSTS.has(hostname) || VIDEO_PROXY_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

// video.twimg.com 403s a request whose Referer isn't twitter.com/x.com; a
// <video> tag always sends the page's own Referer and (unlike <img>) has no
// referrerpolicy attribute a browser will honor. Proxying through our own
// origin sidesteps that — this server's fetch sends no Referer at all.
app.get("/api/video-proxy", analyzeLimiter, async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url || ""));
  } catch {
    return res.status(400).end();
  }
  if (target.protocol !== "https:" || !isAllowedVideoProxyHost(target.hostname)) {
    return res.status(400).end();
  }
  try {
    const headers = { "User-Agent": UA };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target, { headers });
    if (!upstream.ok && upstream.status !== 206) throw new Error(`fetch ${upstream.status}`);
    res.status(upstream.status);
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (err) {
    console.error("video proxy failed:", err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

app.post("/api/users/:username", async (req, res) => {
  await ensureSettings(req.params.username);
  res.json({ ok: true });
});

app.post("/api/users/:username/login", async (req, res) => {
  const { username } = req.params;
  const settings = await ensureSettings(username);
  startSession(username, !settings.isLocked, req, res);
  res.json({ ok: true, username, hasLock: settings.isLocked, locked: settings.isLocked });
});

app.get("/api/session", async (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ error: "login required", code: "LOGIN_REQUIRED" });
  const settings = await ensureSettings(session.username);
  res.json({
    username: session.username,
    hasLock: settings.isLocked,
    locked: settings.isLocked && !session.unlocked,
  });
});

app.delete("/api/session", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get("/api/users/:username/lock", requireOwner, async (req, res) => {
  const settings = await ensureSettings(req.params.username);
  res.json({ hasLock: settings.isLocked, locked: settings.isLocked && !req.session.unlocked });
});

app.put("/api/users/:username/lock", requireOwner, async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) return res.status(400).json({ error: "password required", code: "PASSWORD_REQUIRED" });
  const settings = await ensureSettings(req.params.username);
  if (settings.isLocked && !req.session.unlocked) {
    return res.status(423).json({ error: "stash locked", code: "STASH_LOCKED" });
  }
  const next = { ...settings, isLocked: true, password };
  await writeSettings(req.params.username, next);
  const live = sessions.get(req.session.token);
  if (live) live.unlocked = false;
  res.json({ hasLock: true, locked: true });
});

app.post("/api/users/:username/unlock", requireOwner, async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const settings = await ensureSettings(req.params.username);
  if (!settings.isLocked) {
    const live = sessions.get(req.session.token);
    if (live) live.unlocked = true;
    return res.json({ hasLock: false, locked: false });
  }
  if (!password || !passwordsMatch(password, settings.password)) {
    return res.status(401).json({ error: "incorrect password", code: "INVALID_PASSWORD" });
  }
  await writeSettings(req.params.username, { ...settings, isLocked: false, password: "" });
  const live = sessions.get(req.session.token);
  if (live) live.unlocked = true;
  res.json({ hasLock: false, locked: false });
});

app.post("/api/users/:username/relock", requireOwner, async (req, res) => {
  const settings = await ensureSettings(req.params.username);
  const live = sessions.get(req.session.token);
  if (live) live.unlocked = !settings.isLocked;
  res.json({ hasLock: settings.isLocked, locked: settings.isLocked });
});

app.get("/api/users/:username/settings", requireUnlockedOwner, async (req, res) => {
  res.json({ settings: await ensureSettings(req.params.username) });
});

app.put("/api/users/:username/settings", requireUnlockedOwner, async (req, res) => {
  const { settings } = req.body || {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return res.status(400).json({ error: "invalid settings" });
  }
  if (settings.isLocked === true && (typeof settings.password !== "string" || !settings.password)) {
    return res.status(400).json({ error: "password required", code: "PASSWORD_REQUIRED" });
  }
  await writeSettings(req.params.username, settings);
  res.json({ settings });
});

app.get("/api/users/:username/stash", async (req, res) => {
  const { username } = req.params;
  if (!(await userExists(username))) return res.status(404).json({ error: "user not found", code: "USER_NOT_FOUND" });
  const settings = await ensureSettings(username);
  const items = [];
  for (const store of Object.keys(STORES)) {
    let entries = [];
    try {
      entries = await fs.readdir(storeDir(username, store), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await readJson(path.join(itemDir(username, store, entry.name), "item.json"), null);
      // settings.nsfw === false hides nsfw items (e.g. Pornhub) from the listing
      // without touching the underlying stash — they're still there if re-enabled.
      if (record && (settings.nsfw || !isNsfwUrl(record.url))) items.push(withIconUrl(username, record));
    }
  }
  items.sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  res.json({ username, items });
});

app.post("/api/users/:username/items", requireUnlockedOwner, async (req, res) => {
  const { username } = req.params;
  const { store, itemId, kind, name, byline, icon, url, preview, installCommand, video } = req.body || {};
  if (!STORES[store]) return res.status(400).json({ error: "invalid store" });
  // A "write" store's items are authored, not analyzed — they have their own
  // endpoint (see POST .../notes) so their byline can't be spoofed here.
  if (STORES[store].type === "write") return res.status(400).json({ error: "invalid store" });
  if (!ITEM_ID_RE.test(itemId || "")) return res.status(400).json({ error: "invalid itemId" });

  const dir = itemDir(username, store, itemId);
  const jsonFile = path.join(dir, "item.json");
  if (await readJson(jsonFile, null)) return res.status(409).json({ error: "already stashed" });

  await fs.mkdir(dir, { recursive: true });
  await ensureSettings(username);

  const kindValue = String(kind || "app");
  const imageBase = kindValue === "app" ? "icon" : "thumbnail";
  const iconFile = typeof icon === "string" && /^https?:\/\//.test(icon) ? await downloadIcon(dir, imageBase, icon, url) : null;

  const resolvedUrl = typeof url === "string" ? url : "";
  const hasPreview = typeof preview === "string";
  const hasInstall = typeof installCommand === "string";
  const backfilled = hasPreview && hasInstall ? null : await backfillSkillMeta(store, resolvedUrl);
  const record = {
    store,
    itemId,
    kind: kindValue,
    name: String(name || itemId),
    byline: String(byline || ""),
    url: resolvedUrl,
    iconFile,
    preview: hasPreview ? preview : (backfilled?.preview ?? null),
    installCommand: hasInstall ? installCommand : (backfilled?.installCommand ?? null),
    video: typeof video === "string" && /^https:\/\//.test(video) ? video : null,
    note: "",
    stashedAt: new Date().toISOString(),
  };
  await writeJson(jsonFile, record);
  if (SHOT_STORES.has(store) && record.url) captureInBackground(username, store, itemId, record.url);
  res.status(201).json({ item: withIconUrl(username, record) });
});

// A note is written rather than analyzed: its text is the item's body, the
// first line doubles as its name (see noteTitle), and its byline is the author.
// Two notes can legitimately hold the same text, so the itemId is random
// instead of a content hash like the analyzed stores use.
app.post("/api/users/:username/notes", requireUnlockedOwner, async (req, res) => {
  const { username } = req.params;
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  const hasImage = typeof req.body?.image === "string" && req.body.image !== "";
  // An image on its own is a whole note. It has no first line to name it, so it
  // is stored nameless and the client labels it (see itemTitle) — only a note
  // with neither text nor image is nothing at all.
  const name = noteTitle(text);
  if (!name && !hasImage) return res.status(400).json({ error: "note is empty", code: "NOTE_EMPTY" });

  const store = "notes";
  const itemId = crypto.randomBytes(8).toString("hex");
  const dir = itemDir(username, store, itemId);
  await fs.mkdir(dir, { recursive: true });
  await ensureSettings(username);

  const iconFile = hasImage ? await saveNoteImage(dir, req.body.image, req.body.imageName) : null;
  if (hasImage && !iconFile) {
    await fs.rm(dir, { recursive: true, force: true });
    return res.status(400).json({ error: "invalid image", code: "INVALID_IMAGE" });
  }

  const record = {
    store,
    itemId,
    kind: "note",
    name,
    byline: `@${username}`,
    url: "",
    iconFile,
    preview: null,
    installCommand: null,
    video: null,
    note: text,
    stashedAt: new Date().toISOString(),
  };
  await writeJson(path.join(dir, "item.json"), record);
  res.status(201).json({ item: withIconUrl(username, record) });
});

// Copies another user's item (item.json, note, and any icon/screenshot files)
// into the caller's own stash. The itemId is a deterministic hash of the
// content (see analyzeSource), so it lines up across users and the existing
// "already stashed" 409 below doubles as dedup against a copy of a copy.
app.post("/api/users/:username/items/:store/:itemId/copy", requireUnlockedOwner, async (req, res) => {
  const { username, store, itemId } = req.params;
  const from = String(req.body?.from || "");
  if (!USERNAME_RE.test(from)) return res.status(400).json({ error: "invalid source username" });
  if (from === username) return res.status(400).json({ error: "cannot copy your own item" });

  const sourceDir = itemDir(from, store, itemId);
  const sourceRecord = await readJson(path.join(sourceDir, "item.json"), null);
  if (!sourceRecord) return res.status(404).json({ error: "not found" });

  const destDir = itemDir(username, store, itemId);
  const destFile = path.join(destDir, "item.json");
  if (await readJson(destFile, null)) return res.status(409).json({ error: "already stashed" });

  await ensureSettings(username);
  await fs.cp(sourceDir, destDir, { recursive: true });

  const record = { ...sourceRecord, stashedAt: new Date().toISOString() };
  await writeJson(destFile, record);
  res.status(201).json({ item: withIconUrl(username, record) });
});

app.patch("/api/users/:username/items/:store/:itemId", requireUnlockedOwner, async (req, res) => {
  const { username, store, itemId } = req.params;
  const jsonFile = path.join(itemDir(username, store, itemId), "item.json");
  const record = await readJson(jsonFile, null);
  if (!record) return res.status(404).json({ error: "not found" });

  const { note } = req.body || {};
  if (typeof note === "string") {
    record.note = note;
    // A note's text *is* the item, so editing it re-derives the title the card
    // shows. Emptying the text of one with an image drops it back to nameless —
    // the same state it would have been stashed in as an image on its own. With
    // no image to fall back on, the previous name is kept instead of leaving
    // the item with nothing to show.
    if (record.kind === "note") record.name = noteTitle(note) || (record.iconFile ? "" : record.name);
  }
  await writeJson(jsonFile, record);
  res.json({ item: withIconUrl(username, record) });
});

// Re-runs analysis on the item's own stored URL and overwrites its metadata
// with whatever comes back — a way to pick up a page that's changed since it
// was first stashed. store/itemId/note/stashedAt are left untouched; the
// store never gets re-routed even if the URL would now classify differently
// (e.g. a video reclassified as a channel), since that would mean moving it
// to a different store directory.
app.post("/api/users/:username/items/:store/:itemId/refresh", analyzeLimiter, requireUnlockedOwner, async (req, res) => {
  const { username, store, itemId } = req.params;
  const country = /^[a-z]{2}$/.test(req.query.country || "") ? req.query.country : "us";
  const dir = itemDir(username, store, itemId);
  const jsonFile = path.join(dir, "item.json");
  const record = await readJson(jsonFile, null);
  if (!record) return res.status(404).json({ error: "not found" });
  if (!record.url) return res.status(400).json({ error: "nothing to refresh from" });

  let analyzed;
  try {
    analyzed = await analyzeSource(record.url, store, country);
  } catch (err) {
    console.error("refresh failed:", err.message);
    return res.status(502).json({ error: "refresh failed" });
  }

  const imageBase = record.kind === "app" ? "icon" : "thumbnail";
  const iconFile = analyzed.icon ? await downloadIcon(dir, imageBase, analyzed.icon, record.url) : record.iconFile;
  const updated = {
    ...record,
    kind: analyzed.kind || record.kind,
    name: analyzed.name || record.name,
    byline: analyzed.byline ?? record.byline,
    preview: analyzed.preview ?? record.preview,
    installCommand: analyzed.installCommand ?? record.installCommand,
    video: analyzed.video ?? record.video,
    iconFile,
  };
  await writeJson(jsonFile, updated);
  if (SHOT_STORES.has(store)) captureInBackground(username, store, itemId, record.url);
  res.json({ item: withIconUrl(username, updated) });
});

app.delete("/api/users/:username/items/:store/:itemId", requireUnlockedOwner, async (req, res) => {
  const { username, store, itemId } = req.params;
  const dir = itemDir(username, store, itemId);
  const record = await readJson(path.join(dir, "item.json"), null);
  if (!record) return res.status(404).json({ error: "not found" });
  await fs.rm(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

app.get("/api/users/:username/export.zip", requireUnlockedOwner, async (req, res) => {
  const { username } = req.params;
  const dir = userDir(username);
  try {
    await fs.access(dir);
  } catch {
    return res.status(404).json({ error: "not found" });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  res.setHeader("Content-Type", "application/zip");
  const filename = `stash-${username}-${stamp}.zip`;
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="stash-export-${stamp}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("export failed:", err.message);
    res.destroy(err);
  });
  archive.pipe(res);
  archive.directory(dir, username);
  archive.finalize();
});

app.use("/data", express.static(DATA_DIR, { fallthrough: false }));

// Dev: Vite runs as middleware in this same process, so the app and API
// share one port. Prod: the frontend is a prebuilt dist/ served as static files.
if (DEV) {
  const { createServer } = await import("vite");
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom" });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    try {
      const template = await fs.readFile(path.join(ROOT, "index.html"), "utf-8");
      res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, template));
    } catch (err) {
      vite.ssrFixStacktrace(err);
      next(err);
    }
  });
} else {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
      if (err) next();
    });
  });
}

app.listen(PORT, (err) => {
  if (err) {
    console.error(
      err.code === "EADDRINUSE" ? `port ${PORT} is already in use — is another dev server running?` : err.message,
    );
    process.exit(1);
  }
  console.log(`stash server listening on http://localhost:${PORT}`);
});
