import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";
import { captureFullPage } from "./screenshot.js";
import {
  STORES,
  SHOT_STORES,
  ITEM_ID_RE,
  UA,
  urlStoreFor,
  isBlockedHost,
  searchSources,
  analyzeSource,
} from "./sources/index.js";
import { ensureSettings, writeSettings, passwordsMatch } from "./settings.js";

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
    iconUrl: record.iconFile ? `${base}/${record.iconFile}` : null,
    screenshotUrl: record.screenshotFile ? `${base}/${record.screenshotFile}` : null,
  };
}

// Fire-and-forget: stashing responds immediately, the screenshot lands later
function captureInBackground(username, store, itemId, url) {
  const dir = itemDir(username, store, itemId);
  const file = "screenshot.jpg";
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

  try {
    res.json({ results: await searchSources(store, term, country) });
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
      if (record) items.push(withIconUrl(username, record));
    }
  }
  items.sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  res.json({ username, items });
});

app.post("/api/users/:username/items", requireUnlockedOwner, async (req, res) => {
  const { username } = req.params;
  const { store, itemId, kind, name, byline, icon, url } = req.body || {};
  if (!STORES[store]) return res.status(400).json({ error: "invalid store" });
  if (!ITEM_ID_RE.test(itemId || "")) return res.status(400).json({ error: "invalid itemId" });

  const dir = itemDir(username, store, itemId);
  const jsonFile = path.join(dir, "item.json");
  if (await readJson(jsonFile, null)) return res.status(409).json({ error: "already stashed" });

  await fs.mkdir(dir, { recursive: true });
  await ensureSettings(username);

  const kindValue = String(kind || "app");
  const imageBase = kindValue === "app" ? "icon" : "thumbnail";
  let iconFile = null;
  if (typeof icon === "string" && /^https?:\/\//.test(icon)) {
    try {
      // Some CDNs (e.g. one of Pornhub's two image edges) 403 hotlinked
      // fetches unless the Referer matches the site the image belongs to
      const headers = { "User-Agent": UA };
      if (typeof url === "string" && /^https?:\/\//.test(url)) headers.Referer = new URL(url).origin + "/";
      const r = await fetch(icon, { headers });
      if (r.ok) {
        const type = r.headers.get("content-type") || "";
        const ext = type.includes("png")
          ? "png"
          : type.includes("webp")
            ? "webp"
            : type.includes("gif")
              ? "gif"
              : type.includes("svg")
                ? "svg"
                : type.includes("icon")
                  ? "ico"
                  : "jpg";
        iconFile = `${imageBase}.${ext}`;
        await fs.writeFile(path.join(dir, iconFile), Buffer.from(await r.arrayBuffer()));
      }
    } catch (err) {
      console.error("icon download failed:", err.message);
    }
  }

  const record = {
    store,
    itemId,
    kind: kindValue,
    name: String(name || itemId),
    byline: String(byline || ""),
    url: typeof url === "string" ? url : "",
    iconFile,
    note: "",
    stashedAt: new Date().toISOString(),
  };
  await writeJson(jsonFile, record);
  if (SHOT_STORES.has(store) && record.url) captureInBackground(username, store, itemId, record.url);
  res.status(201).json({ item: withIconUrl(username, record) });
});

app.patch("/api/users/:username/items/:store/:itemId", requireUnlockedOwner, async (req, res) => {
  const { username, store, itemId } = req.params;
  const jsonFile = path.join(itemDir(username, store, itemId), "item.json");
  const record = await readJson(jsonFile, null);
  if (!record) return res.status(404).json({ error: "not found" });

  const { note } = req.body || {};
  if (typeof note === "string") record.note = note;
  await writeJson(jsonFile, record);
  res.json({ item: withIconUrl(username, record) });
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

app.use(express.static(DIST_DIR));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, (err) => {
  if (err) {
    console.error(
      err.code === "EADDRINUSE" ? `port ${PORT} is already in use — is another dev server running?` : err.message,
    );
    process.exit(1);
  }
  console.log(`stash server listening on http://localhost:${PORT}`);
});
