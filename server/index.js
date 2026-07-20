import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import gplay from "google-play-scraper";
import { ZipArchive } from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DIST_DIR = path.join(ROOT, "dist");
const PORT = process.env.PORT || 3001;

const PLATFORMS = ["ios", "android"];
const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;
const BUNDLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

const userDir = (username) => path.join(DATA_DIR, "users", username);
const settingsFile = (username) => path.join(userDir(username), "settings.json");
const platformDir = (username, platform) => path.join(userDir(username), "platforms", platform);
const appDir = (username, platform, bundleId) => path.join(platformDir(username, platform), bundleId);

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

const DEFAULT_SETTINGS = {};

async function ensureSettings(username) {
  const file = settingsFile(username);
  const existing = await readJson(file, null);
  if (existing !== null) return existing;
  await writeJson(file, DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

function withIconUrl(username, record) {
  return {
    ...record,
    iconUrl: record.iconFile
      ? `/data/users/${username}/platforms/${record.platform}/${record.bundleId}/${record.iconFile}`
      : null,
  };
}

const app = express();
app.use(express.json());

app.param("username", (req, res, next, username) => {
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "invalid username" });
  next();
});
app.param("platform", (req, res, next, platform) => {
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: "invalid platform" });
  next();
});
app.param("bundleId", (req, res, next, bundleId) => {
  if (!BUNDLE_ID_RE.test(bundleId)) return res.status(400).json({ error: "invalid bundleId" });
  next();
});

app.get("/api/search", async (req, res) => {
  const term = String(req.query.term || "").trim();
  const platform = req.query.platform;
  const country = /^[a-z]{2}$/.test(req.query.country || "") ? req.query.country : "us";
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: "invalid platform" });
  if (!term) return res.json({ results: [] });

  try {
    let results;
    if (platform === "ios") {
      const url =
        `https://itunes.apple.com/search?media=software&limit=24` +
        `&country=${country}&term=${encodeURIComponent(term)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`itunes ${r.status}`);
      const json = await r.json();
      results = (json.results || [])
        .filter((a) => a.bundleId && BUNDLE_ID_RE.test(a.bundleId))
        .map((a) => ({
          platform: "ios",
          bundleId: a.bundleId,
          name: a.trackName,
          developer: a.artistName,
          icon: a.artworkUrl512 || a.artworkUrl100,
          storeUrl: a.trackViewUrl,
        }));
    } else {
      const found = await gplay.search({ term, num: 24, country });
      results = found
        .filter((a) => BUNDLE_ID_RE.test(a.appId))
        .map((a) => ({
          platform: "android",
          bundleId: a.appId,
          name: a.title,
          developer: a.developer,
          icon: a.icon,
          storeUrl: a.url,
        }));
    }
    res.json({ results });
  } catch (err) {
    console.error("search failed:", err.message);
    res.status(502).json({ error: "search failed" });
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
  const apps = [];
  for (const platform of PLATFORMS) {
    let entries = [];
    try {
      entries = await fs.readdir(platformDir(username, platform), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await readJson(path.join(appDir(username, platform, entry.name), "app.json"), null);
      if (record) apps.push(withIconUrl(username, record));
    }
  }
  apps.sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  res.json({ username, apps });
});

app.post("/api/users/:username/apps", async (req, res) => {
  const { username } = req.params;
  const { platform, bundleId, name, developer, icon, storeUrl } = req.body || {};
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: "invalid platform" });
  if (!BUNDLE_ID_RE.test(bundleId || "")) return res.status(400).json({ error: "invalid bundleId" });

  const dir = appDir(username, platform, bundleId);
  const jsonFile = path.join(dir, "app.json");
  if (await readJson(jsonFile, null)) return res.status(409).json({ error: "already stashed" });

  await fs.mkdir(dir, { recursive: true });
  await ensureSettings(username);

  let iconFile = null;
  if (typeof icon === "string" && /^https?:\/\//.test(icon)) {
    try {
      const r = await fetch(icon);
      if (r.ok) {
        const type = r.headers.get("content-type") || "";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
        iconFile = `icon.${ext}`;
        await fs.writeFile(path.join(dir, iconFile), Buffer.from(await r.arrayBuffer()));
      }
    } catch (err) {
      console.error("icon download failed:", err.message);
    }
  }

  const record = {
    platform,
    bundleId,
    name: String(name || bundleId),
    developer: String(developer || ""),
    storeUrl: typeof storeUrl === "string" ? storeUrl : "",
    iconFile,
    note: "",
    stashedAt: new Date().toISOString(),
  };
  await writeJson(jsonFile, record);
  res.status(201).json({ app: withIconUrl(username, record) });
});

app.patch("/api/users/:username/apps/:platform/:bundleId", async (req, res) => {
  const { username, platform, bundleId } = req.params;
  const jsonFile = path.join(appDir(username, platform, bundleId), "app.json");
  const record = await readJson(jsonFile, null);
  if (!record) return res.status(404).json({ error: "not found" });

  const { note } = req.body || {};
  if (typeof note === "string") record.note = note;
  await writeJson(jsonFile, record);
  res.json({ app: withIconUrl(username, record) });
});

app.delete("/api/users/:username/apps/:platform/:bundleId", async (req, res) => {
  const { username, platform, bundleId } = req.params;
  const dir = appDir(username, platform, bundleId);
  const record = await readJson(path.join(dir, "app.json"), null);
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

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="stash-${username}.zip"`);

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
