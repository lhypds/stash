import crypto from "node:crypto";
import { UA, BOT_UA, matchesHost } from "./html.js";
import { analyzePage } from "./pages.js";

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
    hosts: ["channels.weixin.qq.com", "weixin.qq.com"],
    iconReferrerPolicy: "no-referrer",
    videoInfo: async (u) => {
      let previewUrl = u;
      let shortUri = null;
      if (u.hostname === "weixin.qq.com") {
        shortUri = u.pathname.match(/^\/sph\/([^/]+)\/?$/)?.[1] || null;
        previewUrl = new URL("https://channels.weixin.qq.com/finder-preview/pages/sph");
        if (shortUri) previewUrl.searchParams.set("id", shortUri);
      } else if (u.pathname === "/finder-preview/pages/sph") {
        shortUri = u.searchParams.get("id");
      }
      if (!shortUri) return null;
      const endpoint = new URL("/finder-preview/api/feed/get_feed_info", previewUrl.origin);
      endpoint.searchParams.set(
        "_rid",
        `${Math.floor(Date.now() / 1000).toString(16)}-${crypto.randomBytes(4).toString("hex")}`,
      );
      endpoint.searchParams.set("_pageUrl", `${previewUrl.origin}${previewUrl.pathname}`);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: previewUrl.origin,
          Referer: previewUrl.href,
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

export const videoPlatformFor = (host) => VIDEO_PLATFORMS.find((platform) => matchesHost(platform, host));

export function sourceDisallowsThumbnail(href) {
  try {
    const host = new URL(href).hostname.replace(/^www\.|^m\./, "");
    return videoPlatformFor(host)?.noThumbnail === true;
  } catch {
    return false;
  }
}

export async function analyzeVideo(url, store) {
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
