import {
  UA,
  BOT_UA,
  META_UA,
  matchesHost,
  fetchHtml,
  metaContent,
  stripTags,
  truncate,
  truncateWords,
  PREVIEW_LENGTH,
} from "../utils/html.js";

const POST_PLATFORMS = [
  // X posts get their title capped much tighter than the rest (30 words, not
  // 140 chars) — its full oembed blockquote text style tends to run long.
  { label: "X", hosts: ["x.com", "twitter.com"], ua: BOT_UA, syndication: true, maxNameWords: 30 },
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
    // og:description is usually empty for these articles; the real body text
    // lives in the js_content div, so the PREVIEW section reads from there
    // instead of falling back to the (title-derived) `text` used for the item
    // name. Some posts (e.g. short "note"-style posts served straight off
    // 微信公众平台 itself, with no js_name/js_content in the static HTML at
    // all — content is rendered client-side) have no js_content div but do
    // carry the real text in og:description, so fall back to that.
    bodyFromHtml: (html, { desc }) => textAfterMarker(html, 'id="js_content"') || desc || null,
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

// The public token X's own embed widget derives from a tweet id to call the
// unauthenticated syndication endpoint below — no API key needed. Reverse
// engineered (and widely relied on, e.g. by the react-tweet library).
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

// Picks the highest-resolution progressive mp4 among a tweet's video
// variants (skipping the HLS .m3u8 entry) — a plain <video> tag can play it
// directly, with no HLS support needed in the browser.
function bestMp4(variants) {
  let best = null;
  let bestWidth = -1;
  for (const v of variants) {
    if (v.type !== "video/mp4") continue;
    const width = Number(v.src.match(/\/(\d+)x\d+\//)?.[1] || 0);
    if (width > bestWidth) {
      best = v.src;
      bestWidth = width;
    }
  }
  return best;
}

// The oembed endpoint only hands back a rendered blockquote (byline and date
// baked into the text, no media info). This is the same syndication endpoint
// X's own embed widget calls: clean tweet text, plus a direct mp4 URL when
// the tweet has an attached video.
async function fetchTweetSyndication(url) {
  const id = new URL(url).pathname.match(/\/status\/(\d+)/)?.[1];
  if (!id) return null;
  try {
    const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}`;
    const r = await fetch(endpoint, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const json = await r.json();
    if (json.__typename !== "Tweet") throw new Error("not a tweet");
    // A tweet's attached media rides along in `text` as a trailing t.co link
    // (e.g. ".../video/1"); that's the media itself, already surfaced as the
    // preview/video, so strip it. A real shared link uses the same t.co
    // shape but isn't in `entities.media`, so it's left alone.
    const mediaUrls = new Set((json.entities?.media || []).map((m) => m.url).filter(Boolean));
    let text = typeof json.text === "string" ? json.text : null;
    if (text) {
      text = text.replace(/\s*(https:\/\/t\.co\/\w+)\s*$/, (full, link) => (mediaUrls.has(link) ? "" : full)).trim();
    }
    return {
      text: text || null,
      byline: typeof json.user?.name === "string" ? json.user.name : null,
      video: bestMp4(json.video?.variants || []),
    };
  } catch (err) {
    console.error("tweet syndication failed:", err.message);
    return null;
  }
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
  let video = null;
  if (platform?.syndication) {
    const tweet = await fetchTweetSyndication(url);
    if (tweet) {
      text = tweet.text;
      byline = tweet.byline;
      video = tweet.video;
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
      // A post gated behind a login/age/sensitive-content wall (X does this
      // for some tweets) renders only the platform's own generic placeholder
      // — og:title === "X", no og:description — to an unauthenticated
      // scrape. That's not real content; treat it as if nothing came back.
      if (text && platform?.label && text.trim().toLowerCase() === platform.label.toLowerCase()) {
        text = null;
      }
    }
    if (!byline) {
      byline =
        platform?.bylineFromHtml?.(html) ||
        (platform?.postInTitle
          ? siteName || platform?.label || host
          : title?.split(/:\s*["“]/)[0].trim() || platform?.label || host);
    }
    body = platform?.bodyFromHtml?.(html, { desc }) || null;
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
    name: platform?.maxNameWords
      ? truncateWords(text, platform.maxNameWords)
      : text.length > 140
        ? `${text.slice(0, 140)}…`
        : text,
    byline: byline || platform?.label || host,
    icon,
    url,
    preview: truncate(body || text, PREVIEW_LENGTH),
    iconReferrerPolicy: platform?.iconReferrerPolicy,
    video,
  };
}
