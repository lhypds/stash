// Entry point for the source layer: URL→store routing, an SSRF guard, and the
// analyze/search dispatchers. Per-store logic lives in ./stores/
// (apps.js, videos.js, posts.js, chats.js, pages.js); this file just wires
// them together and re-exports what the server consumes.
import crypto from "node:crypto";
import { isAppHost, analyzeAppUrl, searchApps } from "./stores/apps.js";
import { postPlatformFor, analyzePost } from "./stores/posts.js";
import { videoPlatformFor, analyzeVideo } from "./stores/videos.js";
import { chatPlatformFor, analyzeChat } from "./stores/chats.js";
import { analyzePage } from "./stores/pages.js";

export { UA } from "./utils/html.js";
export { appItemId } from "./stores/apps.js";
export { sourceDisallowsThumbnail } from "./stores/videos.js";

// Every content bucket the app understands, and how new items reach it: a
// "url" store is filled by analyzing a pasted link; a "search" store by
// keyword search.
export const STORES = {
  pages: { type: "url" },
  posts: { type: "url" },
  videos: { type: "url" },
  channels: { type: "url" },
  chats: { type: "url" },
  apps: { type: "search" },
};

// Stores whose items get a background page screenshot after stashing.
export const SHOT_STORES = new Set(["pages", "chats"]);

// A stored itemId: a leading alphanumeric then up to 220 more of [A-Za-z0-9._-].
// Guards against path traversal and keeps ids filesystem-safe.
export const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,220}$/;

// Which store a pasted URL belongs to, by host. App stores and the recognized
// chat / social / video platforms are matched explicitly; anything else is a
// page. An unparseable URL also falls back to a page.
export function urlStoreFor(href) {
  let host;
  try {
    host = new URL(href).hostname.replace(/^www\.|^m\./, "");
  } catch {
    return "pages";
  }
  if (isAppHost(host)) return "apps";
  if (chatPlatformFor(host)) return "chats";
  if (postPlatformFor(host)) return "posts";
  if (videoPlatformFor(host)) return "videos";
  return "pages";
}

// SSRF guard: reject loopback, link-local, and private/RFC-1918 ranges so a
// pasted URL can't make the server fetch internal hosts.
export function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// Analyze one URL into a stashable item. Video/channel URLs settle their final
// store from what the page turns out to be; every other store is kept as-is.
export async function analyzeSource(href, store, country) {
  if (store === "apps") return { store, ...(await analyzeAppUrl(href, country)) };
  const isVideoStore = store === "videos" || store === "channels";
  const analyzed = isVideoStore
    ? await analyzeVideo(href, store)
    : store === "posts"
      ? await analyzePost(href)
      : store === "chats"
        ? await analyzeChat(href)
        : await analyzePage(href);
  const finalStore = isVideoStore
    ? analyzed.kind === "channel"
      ? "channels"
      : analyzed.kind === "page"
        ? "pages"
        : "videos"
    : store;
  const itemId = crypto.createHash("sha1").update(href).digest("hex").slice(0, 16);
  return { store: finalStore, itemId, ...analyzed };
}

// Keyword search across a store. Only the apps store supports it today.
export async function searchSources(store, term, country) {
  if (store !== "apps") throw new Error("unsupported search store");
  return searchApps(term, country);
}
