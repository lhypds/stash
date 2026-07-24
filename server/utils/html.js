// Shared HTTP + HTML-scraping helpers used by every source analyzer: the
// user-agents sites expect, the host matcher that maps a URL onto a platform's
// host list, a size-capped fetcher, and OpenGraph/<meta> readers.

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
export const BOT_UA = "Mozilla/5.0 (compatible; Twitterbot/1.0)";
export const META_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

// A platform (`{ hosts: [...] }`) matches a hostname exactly or as a subdomain
// (space.bilibili.com matches bilibili.com).
export const matchesHost = (platform, host) => platform.hosts.some((h) => host === h || host.endsWith(`.${h}`));

const decodeEntities = (s) =>
  s
    // Some WeChat "note"-style posts serialize their og:description with
    // literal `\x0a` (backslash-x-0-a as four text characters, not a real
    // newline) where a line break belongs — an escaping bug on their end.
    // Collapse it to a space before entity decoding so it doesn't leak into
    // the extracted text as visible backslash-x noise.
    .replace(/\\x0[9ad]/gi, " ")
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

export const stripTags = (s) =>
  decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

// Cuts already-cleaned text down to `len` characters, appending an ellipsis
// only when something was actually cut off.
export const truncate = (s, len) => (s.length > len ? `${s.slice(0, len)} ...` : s);

// Cuts text down to `maxWords` whitespace-separated words, appending an
// ellipsis only when something was actually cut off.
export const truncateWords = (s, maxWords) => {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : s;
};

// How much of a post/app/page's body text a PREVIEW section shows.
export const PREVIEW_LENGTH = 300;

export function metaContent(html, prop) {
  const tags = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "gi")) || [];
  for (const tag of tags.reverse()) {
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decodeEntities(content).trim();
  }
  return null;
}

export async function fetchHtml(url, ua = UA, limit = 500000) {
  const r = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html,*/*" }, redirect: "follow" });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return { html: (await r.text()).slice(0, limit), finalUrl: r.url || url };
}
