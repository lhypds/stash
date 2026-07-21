import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import gplay from "google-play-scraper";
import { ZipArchive } from "archiver";
import { captureFullPage } from "./screenshot.js";

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
} catch {}

const PORT = process.env.PORT || 3001;

// type "search": term-based store search; type "url": analyze a pasted URL
const STORES = {
  pages: { type: "url" },
  posts: { type: "url" },
  videos: { type: "url" },
  channels: { type: "url" },
  "ios-apps": { type: "search" },
  "android-apps": { type: "search" },
};

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
// Most post platforms render Open Graph tags (incl. post images) only for
// crawler UAs — but each has its own idea of which crawler is welcome
const BOT_UA = "Mozilla/5.0 (compatible; Twitterbot/1.0)";
const META_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

// Platforms the "posts" store understands. Hosts match exactly or by
// subdomain; `ua` is the identity that makes the platform serve OG tags
// (Meta properties only answer facebookexternalhit, rednote blocks known
// crawlers but serves a plain browser). Unknown hosts still get the
// generic OG fallback in analyzePost.
const POST_PLATFORMS = [
  { label: "X", hosts: ["x.com", "twitter.com"], ua: BOT_UA, oembed: true },
  { label: "Threads", hosts: ["threads.net", "threads.com"], ua: BOT_UA },
  { label: "Instagram", hosts: ["instagram.com", "instagr.am"], ua: META_UA },
  // rednote's og:title is the note itself rather than an author line
  { label: "RedNote", hosts: ["xiaohongshu.com", "xhslink.com"], ua: UA, postInTitle: true },
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.watch"], ua: META_UA },
  { label: "Bluesky", hosts: ["bsky.app"], ua: BOT_UA },
  { label: "Mastodon", hosts: ["mastodon.social"], ua: BOT_UA },
];

const platformFor = (host) =>
  POST_PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));

// Platforms the "videos"/"channels" stores understand. Hosts match exactly
// or by subdomain. `channel` recognizes channel/profile URLs by shape;
// `oembed` builds the platform's oEmbed endpoint, which answers only for
// videos — so a failed lookup on an oEmbed platform means the URL is a
// channel (or other non-video) page. Unknown hosts still get the generic
// OG fallback, typed by whichever store the URL was pasted into.
const VIDEO_PLATFORMS = [
  {
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    oembed: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    channel: (u) => /^\/(@|channel\/|c\/|user\/)/.test(u.pathname),
  },
  {
    // bilibili.tv is the international site; spaces live on a subdomain
    // (space.bilibili.com) or under /<locale>/space/<id> on .tv.
    // og:image is the real cover, but bilibili's CDN appends a resize/crop
    // transform (e.g. "...jpg@100w_100h_1c.png"); strip it for full size.
    // Its CDN also 403s hotlinked fetches that carry a foreign Referer, but
    // allows them with none, so the browser preview must drop the Referer
    label: "bilibili",
    hosts: ["bilibili.com", "b23.tv", "bilibili.tv"],
    channel: (u) => u.hostname.startsWith("space.") || u.pathname.includes("/space/"),
    cleanIcon: (icon) => icon.replace(/^(.*\.(?:jpe?g|png|webp))@.*$/i, "$1"),
    iconReferrerPolicy: "no-referrer",
  },
  {
    label: "TikTok",
    hosts: ["tiktok.com"],
    ua: BOT_UA,
    oembed: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    channel: (u) => /^\/@[^/]+\/?$/.test(u.pathname),
  },
  {
    label: "Vimeo",
    hosts: ["vimeo.com"],
    oembed: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    channel: (u) => /^\/(channels\/[^/]+|[a-zA-Z][\w.-]*)\/?$/.test(u.pathname),
  },
  {
    label: "Twitch",
    hosts: ["twitch.tv"],
    channel: (u) => /^\/[a-zA-Z0-9_]+\/?$/.test(u.pathname),
  },
  {
    label: "niconico",
    hosts: ["nicovideo.jp", "nico.ms"],
    channel: (u) => u.hostname.startsWith("ch.") || /^\/user\//.test(u.pathname),
  },
  {
    label: "Pornhub",
    hosts: ["pornhub.com"],
    channel: (u) => /^\/(model|pornstar|channels|users)\//.test(u.pathname),
  },
];

const videoPlatformFor = (host) =>
  VIDEO_PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));

const userDir = (username) => path.join(DATA_DIR, "users", username);
const settingsFile = (username) => path.join(userDir(username), "settings.json");
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

const DEFAULT_SETTINGS = {
  stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, true])),
};

async function ensureSettings(username) {
  const file = settingsFile(username);
  const existing = await readJson(file, null);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(existing || {}),
    // keep only known store keys so renamed/removed stores don't linger
    stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, existing?.stores?.[s] ?? true])),
  };
  if (JSON.stringify(merged) !== JSON.stringify(existing)) await writeJson(file, merged);
  return merged;
}

function withIconUrl(username, record) {
  const base = `/data/users/${username}/stores/${record.store}/${record.itemId}`;
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

// Move a whole store to a new name, rewriting each item's `store` field
async function renameStore(username, from, to) {
  const oldDir = storeDir(username, from);
  let entries = null;
  try {
    entries = await fs.readdir(oldDir, { withFileTypes: true });
  } catch {
    return;
  }
  const newDir = storeDir(username, to);
  try {
    await fs.rename(oldDir, newDir);
  } catch {
    // destination already exists → move the entries individually
    await fs.mkdir(newDir, { recursive: true });
    for (const e of entries) {
      await fs.rename(path.join(oldDir, e.name), path.join(newDir, e.name)).catch(() => {});
    }
    await fs.rm(oldDir, { recursive: true, force: true });
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const f = path.join(newDir, e.name, "item.json");
    const rec = await readJson(f, null);
    if (rec) await writeJson(f, { ...rec, store: to });
  }
}

// One-time move of the pre-store layout (platforms/<platform>/<bundleId>/app.json)
// into stores/<store>/<itemId>/item.json.
async function migrateLegacy() {
  let users = [];
  try {
    users = await fs.readdir(path.join(DATA_DIR, "users"), { withFileTypes: true });
  } catch {
    return;
  }
  const map = { ios: "ios-apps", android: "android-apps" };
  for (const u of users) {
    if (!u.isDirectory()) continue;
    const legacyRoot = path.join(userDir(u.name), "platforms");
    for (const [platform, store] of Object.entries(map)) {
      let entries = [];
      try {
        entries = await fs.readdir(path.join(legacyRoot, platform), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dst = itemDir(u.name, store, entry.name);
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.rename(path.join(legacyRoot, platform, entry.name), dst);
        const legacy = await readJson(path.join(dst, "app.json"), null);
        if (!legacy) continue;
        await writeJson(path.join(dst, "item.json"), {
          store,
          itemId: legacy.bundleId || entry.name,
          kind: "app",
          name: legacy.name || entry.name,
          byline: legacy.developer || "",
          url: legacy.storeUrl || "",
          iconFile: legacy.iconFile || null,
          note: legacy.note || "",
          stashedAt: legacy.stashedAt || new Date().toISOString(),
        });
        await fs.rm(path.join(dst, "app.json"), { force: true });
      }
    }
    await fs.rm(legacyRoot, { recursive: true, force: true });

    // The "twitter" store became "tweets" and is now "posts"
    await renameStore(u.name, "twitter", "posts");
    await renameStore(u.name, "tweets", "posts");

    // Items stashed as "tweet" are now "post"
    for (const e of await fs.readdir(storeDir(u.name, "posts"), { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory()) continue;
      const f = path.join(itemDir(u.name, "posts", e.name), "item.json");
      const rec = await readJson(f, null);
      if (rec?.kind === "tweet") await writeJson(f, { ...rec, kind: "post" });
    }

    // The "youtube" store was split into "videos" and "channels"
    const oldYoutube = storeDir(u.name, "youtube");
    let ytEntries = [];
    try {
      ytEntries = await fs.readdir(oldYoutube, { withFileTypes: true });
    } catch {
      ytEntries = [];
    }
    for (const e of ytEntries) {
      if (!e.isDirectory()) continue;
      const src = path.join(oldYoutube, e.name);
      const rec = await readJson(path.join(src, "item.json"), null);
      const store = rec?.kind === "channel" ? "channels" : "videos";
      const dst = itemDir(u.name, store, e.name);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst).catch(() => {});
      if (rec) await writeJson(path.join(dst, "item.json"), { ...rec, store });
    }
    if (ytEntries.length) await fs.rm(oldYoutube, { recursive: true, force: true });

    // The YouTube-only stores went multi-platform: "youtube-videos" became
    // "videos" and "youtube-channels" became "channels"
    await renameStore(u.name, "youtube-videos", "videos");
    await renameStore(u.name, "youtube-channels", "channels");

    // Carry store visibility settings across the renames above
    const settings = await readJson(settingsFile(u.name), null);
    if (settings?.stores) {
      const stores = { ...settings.stores };
      for (const [from, ...to] of [
        ["twitter", "posts"],
        ["tweets", "posts"],
        ["youtube", "videos", "channels"],
        ["youtube-videos", "videos"],
        ["youtube-channels", "channels"],
      ]) {
        if (stores[from] === undefined) continue;
        for (const key of to) stores[key] = stores[from];
        delete stores[from];
      }
      if (JSON.stringify(stores) !== JSON.stringify(settings.stores)) {
        await writeJson(settingsFile(u.name), { ...settings, stores });
      }
    }

    // Non-app images were previously saved as icon.*; they are thumbnails.
    // Also drop any thumbnail already downloaded for a platform that has
    // since been marked noThumbnail
    for (const store of Object.keys(STORES)) {
      let entries = [];
      try {
        entries = await fs.readdir(storeDir(u.name, store), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = itemDir(u.name, store, entry.name);
        const f = path.join(dir, "item.json");
        const rec = await readJson(f, null);
        if (!rec) continue;

        let platform = null;
        try {
          platform = videoPlatformFor(new URL(rec.url).hostname.replace(/^www\.|^m\./, ""));
        } catch {}
        if (rec.iconFile && platform?.noThumbnail) {
          await fs.rm(path.join(dir, rec.iconFile), { force: true }).catch(() => {});
          await writeJson(f, { ...rec, iconFile: null });
          continue;
        }

        if (!rec.iconFile?.startsWith("icon.") || rec.kind === "app") continue;
        const renamed = rec.iconFile.replace(/^icon\./, "thumbnail.");
        try {
          await fs.rename(path.join(dir, rec.iconFile), path.join(dir, renamed));
          await writeJson(f, { ...rec, iconFile: renamed });
        } catch (err) {
          console.error("thumbnail rename failed:", err.message);
        }
      }
    }
  }
}

/* ---------- URL analysis ---------- */

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&(?:rsquo|lsquo);/g, "'")
    .replace(/&(?:rdquo|ldquo);/g, '"')
    .replace(/&middot;/g, "·");

const stripTags = (s) =>
  decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function metaContent(html, prop) {
  // Some sites (e.g. rednote) emit generic site-wide tags before the real
  // per-post ones, so the last non-empty occurrence wins
  const tags = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "gi")) || [];
  for (const tag of tags.reverse()) {
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decodeEntities(content).trim();
  }
  return null;
}

async function fetchHtml(url, ua = UA, limit = 500000) {
  const r = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html,*/*" }, redirect: "follow" });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return { html: (await r.text()).slice(0, limit), finalUrl: r.url || url };
}

async function analyzePage(url, limit, ua = UA) {
  const { html, finalUrl } = await fetchHtml(url, ua, limit);
  const loc = new URL(finalUrl);
  const title =
    metaContent(html, "og:title") || stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const image = metaContent(html, "og:image");
  return {
    kind: "page",
    name: title || finalUrl,
    byline: metaContent(html, "og:site_name") || loc.hostname,
    icon: image ? new URL(image, finalUrl).href : `${loc.origin}/favicon.ico`,
    url: finalUrl,
  };
}

async function analyzeVideo(url, store) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const platform = videoPlatformFor(host);
  const isChannelUrl = platform ? !!platform.channel?.(u) : store === "channels";

  if (platform?.oembed && !isChannelUrl) {
    const r = await fetch(platform.oembed(url), { headers: { "User-Agent": UA } });
    if (r.ok) {
      const j = await r.json();
      return {
        kind: "video",
        name: j.title || url,
        byline: j.author_name || platform.label,
        icon: platform.noThumbnail ? null : j.thumbnail_url || null,
        url,
      };
    }
  }

  // Open Graph fallback. Platforms with oEmbed only land here for channel
  // (or other non-video) pages; some inline hundreds of KB of scripts
  // before <head> metadata, so read a larger slice
  const page = await analyzePage(url, 2000000, platform?.ua);
  const kind = isChannelUrl || platform?.oembed ? "channel" : "video";
  const icon = platform?.noThumbnail
    ? null
    : page.icon && platform?.cleanIcon
      ? platform.cleanIcon(page.icon)
      : page.icon;
  return {
    ...page,
    kind,
    byline: platform?.label || page.byline,
    icon,
    iconReferrerPolicy: platform?.iconReferrerPolicy,
  };
}

async function analyzePost(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platform = platformFor(host);

  let text = null;
  let byline = null;
  if (platform?.oembed) {
    try {
      const normalized = url.replace(/^https?:\/\/(www\.)?x\.com/i, "https://twitter.com");
      const r = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalized)}&omit_script=1`,
        { headers: { "User-Agent": UA } },
      );
      if (r.ok) {
        const j = await r.json();
        text = stripTags(j.html || "") || null;
        byline = j.author_name || null;
      }
    } catch (err) {
      console.error("post oembed failed:", err.message);
    }
  }

  // First image of the post (og:image, served to the platform's crawler UA);
  // also the text source for platforms without oEmbed. rednote inlines
  // ~850KB of scripts before its meta tags, so read a larger slice
  let icon = null;
  try {
    const { html, finalUrl } = await fetchHtml(url, platform?.ua || BOT_UA, 2000000);
    const image = metaContent(html, "og:image");
    icon = image ? new URL(image, finalUrl).href : null;
    const title = metaContent(html, "og:title");
    const desc = metaContent(html, "og:description");
    if (!text) text = platform?.postInTitle ? title || desc : desc || title;
    if (!byline) {
      // og:title doubles as the author line, but Meta appends the caption
      // ('Author on Instagram: "caption…"') — keep only the author part.
      // Where og:title is the post itself, fall back to the site name.
      byline = platform?.postInTitle
        ? metaContent(html, "og:site_name") || platform?.label || host
        : title?.split(/:\s*["“]/)[0].trim() || platform?.label || host;
    }
  } catch (err) {
    console.error("post page fetch failed:", err.message);
  }

  if (!text) throw new Error("no post content");
  return {
    kind: "post",
    name: text.length > 140 ? `${text.slice(0, 140)}…` : text,
    byline: byline || platform?.label || host,
    icon,
    url,
  };
}

/* ---------- app ---------- */

const app = express();
app.use(express.json());

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

app.get("/api/search", async (req, res) => {
  const term = String(req.query.term || "").trim();
  const store = req.query.store;
  const country = /^[a-z]{2}$/.test(req.query.country || "") ? req.query.country : "us";
  if (STORES[store]?.type !== "search") return res.status(400).json({ error: "invalid store" });
  if (!term) return res.json({ results: [] });

  try {
    let results;
    if (store === "ios-apps") {
      const url =
        `https://itunes.apple.com/search?media=software&limit=24` +
        `&country=${country}&term=${encodeURIComponent(term)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`itunes ${r.status}`);
      const json = await r.json();
      results = (json.results || [])
        .filter((a) => a.bundleId && ITEM_ID_RE.test(a.bundleId))
        .map((a) => ({
          store,
          itemId: a.bundleId,
          kind: "app",
          name: a.trackName,
          byline: a.artistName,
          icon: a.artworkUrl512 || a.artworkUrl100,
          url: a.trackViewUrl,
        }));
    } else {
      const found = await gplay.search({ term, num: 24, country });
      results = found
        .filter((a) => ITEM_ID_RE.test(a.appId))
        .map((a) => ({
          store,
          itemId: a.appId,
          kind: "app",
          name: a.title,
          byline: a.developer,
          icon: a.icon,
          url: a.url,
        }));
    }
    res.json({ results });
  } catch (err) {
    console.error("search failed:", err.message);
    res.status(502).json({ error: "search failed" });
  }
});

app.get("/api/analyze", async (req, res) => {
  const store = req.query.store;
  const raw = String(req.query.url || "").trim();
  if (STORES[store]?.type !== "url") return res.status(400).json({ error: "invalid store" });
  let url;
  try {
    url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }

  try {
    const isVideoStore = store === "videos" || store === "channels";
    const analyzed = isVideoStore
      ? await analyzeVideo(url.href, store)
      : store === "posts"
        ? await analyzePost(url.href)
        : await analyzePage(url.href);
    // A video-platform URL lands in the store matching what it actually is,
    // regardless of which of the two stores it was analyzed from
    const finalStore = isVideoStore ? (analyzed.kind === "channel" ? "channels" : "videos") : store;
    const itemId = crypto.createHash("sha1").update(url.href).digest("hex").slice(0, 16);
    res.json({ result: { store: finalStore, itemId, ...analyzed } });
  } catch (err) {
    console.error("analyze failed:", err.message);
    res.status(502).json({ error: "analyze failed" });
  }
});

app.post("/api/users/:username", async (req, res) => {
  await ensureSettings(req.params.username);
  res.json({ ok: true });
});

app.get("/api/users/:username/settings", async (req, res) => {
  res.json({ settings: await ensureSettings(req.params.username) });
});

app.put("/api/users/:username/settings", async (req, res) => {
  const { settings } = req.body || {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return res.status(400).json({ error: "invalid settings" });
  }
  await writeJson(settingsFile(req.params.username), settings);
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

app.post("/api/users/:username/items", async (req, res) => {
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
  if (store === "pages" && record.url) captureInBackground(username, store, itemId, record.url);
  res.status(201).json({ item: withIconUrl(username, record) });
});

app.patch("/api/users/:username/items/:store/:itemId", async (req, res) => {
  const { username, store, itemId } = req.params;
  const jsonFile = path.join(itemDir(username, store, itemId), "item.json");
  const record = await readJson(jsonFile, null);
  if (!record) return res.status(404).json({ error: "not found" });

  const { note } = req.body || {};
  if (typeof note === "string") record.note = note;
  await writeJson(jsonFile, record);
  res.json({ item: withIconUrl(username, record) });
});

app.delete("/api/users/:username/items/:store/:itemId", async (req, res) => {
  const { username, store, itemId } = req.params;
  const dir = itemDir(username, store, itemId);
  const record = await readJson(path.join(dir, "item.json"), null);
  if (!record) return res.status(404).json({ error: "not found" });
  await fs.rm(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

app.get("/api/users/:username/export.zip", async (req, res) => {
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
  res.setHeader("Content-Disposition", `attachment; filename="stash-${username}-${stamp}.zip"`);

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

await migrateLegacy();

app.listen(PORT, (err) => {
  if (err) {
    console.error(
      err.code === "EADDRINUSE" ? `port ${PORT} is already in use — is another dev server running?` : err.message,
    );
    process.exit(1);
  }
  console.log(`stash server listening on http://localhost:${PORT}`);
});
