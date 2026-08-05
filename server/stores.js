// Entry point for the source layer: URL→store routing, an SSRF guard, and the
// analyze/search dispatchers. Per-store logic lives in ./stores/
// (apps.js, videos.js, posts.js, chats.js, pages.js, skills.js); this file
// just wires them together and re-exports what the server consumes.
import crypto from "node:crypto";
import { isAppHost, analyzeAppUrl, searchApps } from "./stores/apps.js";
import { postPlatformFor, analyzePost } from "./stores/posts.js";
import { videoPlatformFor, analyzeVideo } from "./stores/videos.js";
import { chatPlatformFor, analyzeChat } from "./stores/chats.js";
import { analyzePage } from "./stores/pages.js";
import { isSkillHost, analyzeSkillUrl, searchSkills, fetchSkillMeta } from "./stores/skills.js";

export { UA } from "./utils/html.js";
export { appItemId } from "./stores/apps.js";
export { sourceDisallowsThumbnail, isNsfwUrl } from "./stores/videos.js";
export { noteTitle, noteImageName, saveNoteImage } from "./stores/notes.js";

// Every content bucket the app understands, and how new items reach it: a
// "url" store is filled by analyzing a pasted link; a "search" store by
// keyword search; a "write" store by the user typing the item themselves.
export const STORES = {
  notes: { type: "write" },
  pages: { type: "url" },
  posts: { type: "url" },
  publishers: { type: "url" },
  videos: { type: "url" },
  channels: { type: "url" },
  chats: { type: "url" },
  apps: { type: "search" },
  skills: { type: "search" },
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
  if (isSkillHost(host)) return "skills";
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

// Analyze one URL into a stashable item. Video/channel and post/publisher URLs
// settle their final store from what the page turns out to be (a social post
// that carries a clip and no caption of its own is a video, not a post); every
// other store is kept as-is.
export async function analyzeSource(href, store, country) {
  if (store === "apps") return { store, ...(await analyzeAppUrl(href, country)) };
  if (store === "skills") return { store, ...(await analyzeSkillUrl(href)) };
  // Which analyzer runs follows the host's own family rather than the store the
  // caller named, because the two don't always agree: a caption-less clip is
  // filed under videos even though Instagram is a post platform (see finalStore
  // below), and a refresh passes that stored store straight back in. Within a
  // family the caller's store still decides — on a host no platform claims it's
  // the only thing that tells a publisher from a post, or a channel from a video.
  const hostStore = urlStoreFor(href);
  const unclaimed = hostStore === "pages";
  const isVideoStore = hostStore === "videos" || (unclaimed && (store === "videos" || store === "channels"));
  const isPostStore = hostStore === "posts" || (unclaimed && (store === "posts" || store === "publishers"));
  const analyzed = isVideoStore
    ? await analyzeVideo(href, store)
    : isPostStore
      ? await analyzePost(href, store)
      : hostStore === "chats" || store === "chats"
        ? await analyzeChat(href)
        : await analyzePage(href);
  const finalStore = isVideoStore
    ? analyzed.kind === "channel"
      ? "channels"
      : analyzed.kind === "page"
        ? "pages"
        : "videos"
    : isPostStore
      ? analyzed.kind === "publisher"
        ? "publishers"
        : analyzed.kind === "video"
          ? "videos"
          : "posts"
      : store;
  const itemId = crypto.createHash("sha1").update(href).digest("hex").slice(0, 16);
  const { related, ...rest } = analyzed;
  const result = { store: finalStore, itemId, ...rest };
  // A video's channel or a post's publisher (see analyzeVideo's author_url
  // handling and analyzePost's profile surfacing) rides along as its own
  // fully-formed, independently stashable item.
  if (related) {
    const relatedStore = related.kind === "channel" ? "channels" : related.kind === "publisher" ? "publishers" : finalStore;
    result.related = {
      store: relatedStore,
      itemId: crypto.createHash("sha1").update(related.url).digest("hex").slice(0, 16),
      ...related,
    };
  }
  return result;
}

// Keyword search across a store. `searchSettings` is the caller's
// settings.json `search` object, gating which engine(s) within the store run.
export async function searchSources(store, term, country, searchSettings) {
  if (store === "apps") return searchApps(term, country, searchSettings);
  if (store === "skills") return searchSkills(term, searchSettings);
  throw new Error("unsupported search store");
}

// Best-effort description + install-command backfill for a skill reaching
// the stash without them — e.g. one picked straight off a search result,
// whose listing carries neither (unlike a directly pasted skill URL, which
// already fetched both during analysis). A no-op for every other store.
export async function backfillSkillMeta(store, url) {
  if (store !== "skills" || !url) return null;
  return fetchSkillMeta(url);
}
