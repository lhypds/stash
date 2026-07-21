import crypto from "node:crypto";
import gplay from "google-play-scraper";

export const STORES = {
  pages: { type: "url" },
  posts: { type: "url" },
  videos: { type: "url" },
  channels: { type: "url" },
  chats: { type: "url" },
  apps: { type: "search" },
};

export const SHOT_STORES = new Set(["pages", "chats"]);
export const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,220}$/;
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const BOT_UA = "Mozilla/5.0 (compatible; Twitterbot/1.0)";
const META_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const matchesHost = (platform, host) => platform.hosts.some((h) => host === h || host.endsWith(`.${h}`));

const POST_PLATFORMS = [
  { label: "X", hosts: ["x.com", "twitter.com"], ua: BOT_UA, oembed: true },
  { label: "Threads", hosts: ["threads.net", "threads.com"], ua: BOT_UA },
  { label: "Instagram", hosts: ["instagram.com", "instagr.am"], ua: META_UA },
  { label: "RedNote", hosts: ["xiaohongshu.com", "xhslink.com"], ua: UA, postInTitle: true },
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.watch"], ua: META_UA },
  { label: "Bluesky", hosts: ["bsky.app"], ua: BOT_UA },
  { label: "Mastodon", hosts: ["mastodon.social"], ua: BOT_UA },
];

const postPlatformFor = (host) => POST_PLATFORMS.find((platform) => matchesHost(platform, host));

const VIDEO_PLATFORMS = [
  {
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    oembed: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    channel: (u) => /^\/(@|channel\/|c\/|user\/)/.test(u.pathname),
  },
  {
    label: "bilibili",
    hosts: ["bilibili.com", "b23.tv", "bilibili.tv"],
    channel: (u) => u.hostname.startsWith("space.") || u.pathname.includes("/space/"),
    cleanIcon: (icon) => icon.replace(/^(.*\.(?:jpe?g|png|webp))@.*$/i, "$1"),
    iconReferrerPolicy: "no-referrer",
    channelInfo: async (u) => {
      const mid = u.hostname.startsWith("space.")
        ? u.pathname.match(/^\/(\d+)/)?.[1]
        : u.pathname.match(/\/space\/(\d+)/)?.[1];
      if (!mid) return null;
      const r = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=false`, {
        headers: { "User-Agent": UA, Referer: "https://space.bilibili.com/" },
      });
      if (!r.ok) return null;
      const card = (await r.json())?.data?.card;
      return card ? { name: card.name || null, icon: card.face || null } : null;
    },
  },
  {
    label: "TikTok",
    hosts: ["tiktok.com"],
    ua: BOT_UA,
    oembed: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    channel: (u) => /^\/@[^/]+\/?$/.test(u.pathname),
  },
  {
    label: "WeChat",
    hosts: ["channels.weixin.qq.com"],
    iconReferrerPolicy: "no-referrer",
    videoInfo: async (u) => {
      if (u.pathname !== "/finder-preview/pages/sph") return null;
      const shortUri = u.searchParams.get("id");
      if (!shortUri) return null;
      const endpoint = new URL("/finder-preview/api/feed/get_feed_info", u.origin);
      endpoint.searchParams.set(
        "_rid",
        `${Math.floor(Date.now() / 1000).toString(16)}-${crypto.randomBytes(4).toString("hex")}`,
      );
      endpoint.searchParams.set("_pageUrl", `${u.origin}${u.pathname}`);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: u.origin,
          Referer: u.href,
          "User-Agent": UA,
        },
        body: JSON.stringify({ baseReq: { generalToken: "" }, shortUri }),
      });
      if (!r.ok) throw new Error(`wechat channels ${r.status}`);
      const json = await r.json();
      if (json.errCode !== 0) throw new Error(json.errMsg || "wechat channels metadata failed");
      const feed = json.data?.feedInfo;
      const author = json.data?.authorInfo;
      if (!feed && !author) return null;
      return {
        name: feed?.description || author?.nickname || u.href,
        byline: author?.nickname || "WeChat",
        icon: feed?.coverUrl || author?.headImgUrl || null,
      };
    },
  },
  {
    label: "Vimeo",
    hosts: ["vimeo.com"],
    oembed: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    channel: (u) => /^\/(channels\/[^/]+|[a-zA-Z][\w.-]*)\/?$/.test(u.pathname),
  },
  { label: "Twitch", hosts: ["twitch.tv"], channel: (u) => /^\/[a-zA-Z0-9_]+\/?$/.test(u.pathname) },
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

const videoPlatformFor = (host) => VIDEO_PLATFORMS.find((platform) => matchesHost(platform, host));

const CHAT_PLATFORMS = [
  { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], titleInTag: true },
  { label: "Gemini", hosts: ["gemini.google.com", "g.co"] },
  { label: "Grok", hosts: ["grok.com", "x.ai"] },
  { label: "Claude", hosts: ["claude.ai"] },
];

const chatPlatformFor = (host) => CHAT_PLATFORMS.find((platform) => matchesHost(platform, host));

export function urlStoreFor(href) {
  let host;
  try {
    host = new URL(href).hostname.replace(/^www\.|^m\./, "");
  } catch {
    return "pages";
  }
  if (host === "apps.apple.com" || host === "itunes.apple.com" || host === "play.google.com") return "apps";
  if (chatPlatformFor(host)) return "chats";
  if (postPlatformFor(host)) return "posts";
  if (videoPlatformFor(host)) return "videos";
  return "pages";
}

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

export const appItemId = (platform, id) => `${platform}-${id}`;

export function sourceDisallowsThumbnail(href) {
  try {
    const host = new URL(href).hostname.replace(/^www\.|^m\./, "");
    return videoPlatformFor(host)?.noThumbnail === true;
  } catch {
    return false;
  }
}

async function analyzeAppUrl(href, country) {
  const u = new URL(href);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const queryId = u.searchParams.get("id");
    const id = u.pathname.match(/\/id(\d+)/)?.[1] || (/^\d+$/.test(queryId) ? queryId : null);
    if (!id) throw new Error("no app id in url");
    const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`);
    if (!r.ok) throw new Error(`itunes ${r.status}`);
    const app = (await r.json()).results?.[0];
    if (!app?.bundleId) throw new Error("app not found");
    return {
      itemId: appItemId("ios", app.bundleId),
      kind: "app",
      name: app.trackName,
      byline: app.artistName,
      icon: app.artworkUrl512 || app.artworkUrl100,
      url: app.trackViewUrl || href,
    };
  }
  const appId = u.searchParams.get("id");
  if (host !== "play.google.com" || !appId) throw new Error("no app id in url");
  const app = await gplay.app({ appId, country });
  return {
    itemId: appItemId("android", app.appId),
    kind: "app",
    name: app.title,
    byline: app.developer,
    icon: app.icon,
    url: app.url || href,
  };
}

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
  const title = metaContent(html, "og:title") || stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
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
  if (isChannelUrl && platform?.channelInfo) {
    const info = await platform.channelInfo(u).catch(() => null);
    if (info?.icon) {
      return {
        kind: "channel",
        name: info.name || url,
        byline: platform.label,
        icon: info.icon,
        url,
        iconReferrerPolicy: platform.iconReferrerPolicy,
      };
    }
  }
  if (!isChannelUrl && platform?.videoInfo) {
    const info = await platform.videoInfo(u);
    if (info) {
      return {
        kind: "video",
        name: info.name || url,
        byline: info.byline || platform.label,
        icon: info.icon || null,
        url,
        iconReferrerPolicy: platform.iconReferrerPolicy,
      };
    }
  }
  if (platform?.oembed && !isChannelUrl) {
    const r = await fetch(platform.oembed(url), { headers: { "User-Agent": UA } });
    if (r.ok) {
      const json = await r.json();
      return {
        kind: "video",
        name: json.title || url,
        byline: json.author_name || platform.label,
        icon: platform.noThumbnail ? null : json.thumbnail_url || null,
        url,
      };
    }
  }
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
  const platform = postPlatformFor(host);
  let text = null;
  let byline = null;
  if (platform?.oembed) {
    try {
      const normalized = url.replace(/^https?:\/\/(www\.)?x\.com/i, "https://twitter.com");
      const r = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(normalized)}&omit_script=1`, {
        headers: { "User-Agent": UA },
      });
      if (r.ok) {
        const json = await r.json();
        text = stripTags(json.html || "") || null;
        byline = json.author_name || null;
      }
    } catch (err) {
      console.error("post oembed failed:", err.message);
    }
  }
  let icon = null;
  try {
    const { html, finalUrl } = await fetchHtml(url, platform?.ua || BOT_UA, 2000000);
    const image = metaContent(html, "og:image");
    icon = image ? new URL(image, finalUrl).href : null;
    const title = metaContent(html, "og:title");
    const desc = metaContent(html, "og:description");
    if (!text) text = platform?.postInTitle ? title || desc : desc || title;
    if (!byline) {
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

function stripBrand(title, label) {
  if (!label) return title;
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sep = "\\s*[-–—|:·]\\s*";
  const stripped = title
    .replace(new RegExp(`^${esc}${sep}`, "i"), "")
    .replace(new RegExp(`${sep}${esc}$`, "i"), "")
    .trim();
  return stripped || title;
}

async function analyzeChat(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platform = chatPlatformFor(host);
  const { html, finalUrl } = await fetchHtml(url, platform?.ua || UA, 2000000);
  const loc = new URL(finalUrl);
  const ogTitle = metaContent(html, "og:title");
  const docTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const title = (platform?.titleInTag ? docTitle || ogTitle : ogTitle || docTitle) || finalUrl;
  const image = metaContent(html, "og:image");
  return {
    kind: "chat",
    name: stripBrand(title, platform?.label),
    byline: platform?.label || metaContent(html, "og:site_name") || loc.hostname,
    icon: image ? new URL(image, finalUrl).href : `${loc.origin}/favicon.ico`,
    url: finalUrl,
  };
}

export async function searchSources(store, term, country) {
  if (store !== "apps") throw new Error("unsupported search store");
  const searches = await Promise.allSettled([
    (async () => {
      const url =
        `https://itunes.apple.com/search?media=software&limit=12` +
        `&country=${country}&term=${encodeURIComponent(term)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`itunes ${r.status}`);
      const json = await r.json();
      return (json.results || [])
        .filter((app) => app.bundleId && ITEM_ID_RE.test(appItemId("ios", app.bundleId)))
        .map((app) => ({
          store,
          itemId: appItemId("ios", app.bundleId),
          kind: "app",
          name: app.trackName,
          byline: app.artistName,
          icon: app.artworkUrl512 || app.artworkUrl100,
          url: app.trackViewUrl,
        }));
    })(),
    (async () => {
      const found = await gplay.search({ term, num: 12, country });
      return found
        .filter((app) => ITEM_ID_RE.test(appItemId("android", app.appId)))
        .map((app) => ({
          store,
          itemId: appItemId("android", app.appId),
          kind: "app",
          name: app.title,
          byline: app.developer,
          icon: app.icon,
          url: app.url,
        }));
    })(),
  ]);
  const results = searches.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!results.length && searches.every((result) => result.status === "rejected")) {
    throw new Error("app searches failed");
  }
  return results;
}

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
  const finalStore = isVideoStore ? (analyzed.kind === "channel" ? "channels" : "videos") : store;
  const itemId = crypto.createHash("sha1").update(href).digest("hex").slice(0, 16);
  return { store: finalStore, itemId, ...analyzed };
}
