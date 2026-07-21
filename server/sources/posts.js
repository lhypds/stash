import { UA, BOT_UA, META_UA, matchesHost, fetchHtml, metaContent, stripTags } from "./html.js";

const POST_PLATFORMS = [
  { label: "X", hosts: ["x.com", "twitter.com"], ua: BOT_UA, oembed: true },
  { label: "Threads", hosts: ["threads.net", "threads.com"], ua: BOT_UA },
  { label: "Instagram", hosts: ["instagram.com", "instagr.am"], ua: META_UA },
  { label: "RedNote", hosts: ["xiaohongshu.com", "xhslink.com"], ua: UA, postInTitle: true },
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.watch"], ua: META_UA },
  { label: "Bluesky", hosts: ["bsky.app"], ua: BOT_UA },
  { label: "Mastodon", hosts: ["mastodon.social"], ua: BOT_UA },
];

export const postPlatformFor = (host) => POST_PLATFORMS.find((platform) => matchesHost(platform, host));

export async function analyzePost(url) {
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
