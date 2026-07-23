import {
  UA,
  BOT_UA,
  META_UA,
  matchesHost,
  fetchHtml,
  metaContent,
  stripTags,
  truncate,
  PREVIEW_LENGTH,
} from "../utils/html.js";

const POST_PLATFORMS = [
  { label: "X", hosts: ["x.com", "twitter.com"], ua: BOT_UA, oembed: true },
  { label: "Threads", hosts: ["threads.net", "threads.com"], ua: BOT_UA },
  { label: "Instagram", hosts: ["instagram.com", "instagr.am"], ua: META_UA },
  { label: "RedNote", hosts: ["xiaohongshu.com", "xhslink.com", "rednote.com"], ua: UA, postInTitle: true },
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.watch"], ua: META_UA },
  { label: "Bluesky", hosts: ["bsky.app"], ua: BOT_UA },
  { label: "Mastodon", hosts: ["mastodon.social"], ua: BOT_UA },
  // Zhihu may return 403 to server-side metadata requests. Keep it stashable
  // as a Post even when its title/cover cannot be read from the public page.
  {
    label: "Zhihu",
    hosts: ["zhihu.com"],
    ua: UA,
    postInTitle: true,
    metadataFallback: "microlink",
    allowMetadataFallback: true,
  },
  // mp.weixin.qq.com (WeChat official-account articles) is distinct from
  // weixin.qq.com/channels.weixin.qq.com (WeChat Channels short videos,
  // handled in videos.js) — keep its host list from overlapping that one.
  // og:title/og:image are readable with a plain desktop UA; the account name
  // isn't in any <meta> tag, so it's pulled from the byline link in the body.
  {
    label: "WeChat",
    hosts: ["mp.weixin.qq.com"],
    ua: UA,
    postInTitle: true,
    bylineFromHtml: (html) => stripTags(html.match(/id="js_name">([\s\S]*?)<\/a>/i)?.[1] || "") || null,
    // og:description is empty for these articles; the real body text lives
    // in the js_content div, so the PREVIEW section reads from there instead
    // of falling back to the (title-derived) `text` used for the item name.
    bodyFromHtml: (html) => textAfterMarker(html, 'id="js_content"'),
    // mmbiz.qpic.cn rejects the cover-image request unless the Referer is
    // mp.weixin.qq.com's own origin (which only the post-stash server-side
    // download sends); suppress the browser's Referer for the pre-stash
    // preview <img> so it doesn't get swapped for a placeholder.
    iconReferrerPolicy: "no-referrer",
  },
];

export const postPlatformFor = (host) => POST_PLATFORMS.find((platform) => matchesHost(platform, host));

// Grabs the text right after `marker`'s own opening tag closes, capped to a
// generous window and trimmed back to the last complete tag — a raw byte cut
// can land mid-attribute (e.g. inside a huge base64 data-url) and leak that
// binary-looking noise into the extracted text otherwise.
function textAfterMarker(html, marker, window = 20000) {
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = html.indexOf(">", markerIdx) + 1;
  if (start <= 0) return null;
  let chunk = html.slice(start, start + window);
  const lastClose = chunk.lastIndexOf(">");
  if (lastClose !== -1) chunk = chunk.slice(0, lastClose + 1);
  return stripTags(chunk) || null;
}

// Zhihu blocks unauthenticated server-side page requests in some regions.
// Microlink retains the page's public metadata, so use it only after the
// direct request failed and only for platforms that explicitly opt in.
async function fetchFallbackMetadata(url, provider) {
  if (provider !== "microlink") return null;
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    const r = await fetch(endpoint, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const { data } = await r.json();
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    if (!title || /安全验证|captcha/i.test(title)) throw new Error("no usable title");
    return {
      text: title,
      byline: typeof data.author === "string" ? data.author.trim() : null,
      icon: data.image?.url || data.logo?.url || null,
    };
  } catch (err) {
    console.error("post metadata fallback failed:", err.message);
    return null;
  }
}

export async function analyzePost(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platform = postPlatformFor(host);
  let text = null;
  let byline = null;
  let body = null;
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
    const siteName = metaContent(html, "og:site_name");
    if (!text) {
      text = platform?.postInTitle ? title || desc : desc || title;
      // Some sites (e.g. RedNote) append " - <site name>" to og:title; that
      // suffix belongs to the page chrome, not the post content.
      const suffix = siteName && ` - ${siteName}`;
      if (text && suffix && text.toLowerCase().endsWith(suffix.toLowerCase())) {
        text = text.slice(0, -suffix.length).trim();
      }
    }
    if (!byline) {
      byline =
        platform?.bylineFromHtml?.(html) ||
        (platform?.postInTitle
          ? siteName || platform?.label || host
          : title?.split(/:\s*["“]/)[0].trim() || platform?.label || host);
    }
    body = platform?.bodyFromHtml?.(html) || null;
  } catch (err) {
    console.error("post page fetch failed:", err.message);
  }
  if (!text && platform?.metadataFallback) {
    const fallback = await fetchFallbackMetadata(url, platform.metadataFallback);
    if (fallback) {
      text = fallback.text;
      byline = fallback.byline || byline;
      icon = fallback.icon || icon;
    }
  }
  if (!text && platform?.allowMetadataFallback) {
    text = platform.label;
    icon = new URL("/favicon.ico", url).href;
  }
  if (!text) throw new Error("no post content");
  return {
    kind: "post",
    name: text.length > 140 ? `${text.slice(0, 140)}…` : text,
    byline: byline || platform?.label || host,
    icon,
    url,
    preview: truncate(body || text, PREVIEW_LENGTH),
    iconReferrerPolicy: platform?.iconReferrerPolicy,
  };
}
