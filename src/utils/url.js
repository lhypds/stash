// Bare hostname with the common www./m. subdomain prefixes stripped, or null
// if `url` can't be parsed.
function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, "");
  } catch {
    return null;
  }
}

// Pasted "share" text buries the link among emoji and captions, and can hold
// several at once (e.g. RedNote's "15 【…】 😆 code 😆 https://…"). Pull out
// every http(s) URL, trim punctuation that tends to cling to the end, and
// drop duplicates.
export function extractUrls(text) {
  const matches = String(text).match(/https?:\/\/[^\s<>"'`）】」』]+/gi) || [];
  const seen = new Set();
  const urls = [];
  for (const match of matches) {
    const trimmed = match.replace(/[.,;:!?、。，！？）)\]}】」』>"'`]+$/u, "");
    let href;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      href = u.href;
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
  }
  return urls;
}

// Domain → how its platform's name is written. A host matches a key exactly or
// as a subdomain (space.bilibili.com → Bilibili); unmapped hosts fall back to
// the bare domain.
const SOURCE_NAMES = {
  "apps.apple.com": "App Store",
  "itunes.apple.com": "App Store",
  "play.google.com": "Google Play",
  "x.com": "X",
  "twitter.com": "X",
  "threads.net": "Threads",
  "threads.com": "Threads",
  "instagram.com": "Instagram",
  "instagr.am": "Instagram",
  "xiaohongshu.com": "RedNote",
  "xhslink.com": "RedNote",
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "fb.watch": "Facebook",
  "bsky.app": "Bluesky",
  "mastodon.social": "Mastodon",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "bilibili.com": "Bilibili",
  "b23.tv": "Bilibili",
  "bilibili.tv": "Bilibili",
  "tiktok.com": "TikTok",
  "vimeo.com": "Vimeo",
  "twitch.tv": "Twitch",
  "nicovideo.jp": "niconico",
  "nico.ms": "niconico",
  "pornhub.com": "Pornhub",
  "channels.weixin.qq.com": "WeChat",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "gemini.google.com": "Gemini",
  "g.co": "Gemini",
  "grok.com": "Grok",
  "x.ai": "Grok",
  "claude.ai": "Claude",
};

// Where the item came from, e.g. "Bilibili", "YouTube". Falls back to the bare
// domain for unmapped hosts, or null when there's no usable URL.
export function sourceName(url) {
  const host = hostname(url);
  if (!host) return null;
  for (const [domain, name] of Object.entries(SOURCE_NAMES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}

// A YouTube watch/share/shorts/live URL → its privacy-friendly nocookie embed
// URL, or null for anything that isn't a recognizable YouTube video.
export function videoEmbedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
  const id =
    host === "youtu.be"
      ? u.pathname.split("/")[1]
      : u.pathname === "/watch"
        ? u.searchParams.get("v")
        : u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
