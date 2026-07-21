import { UA, fetchHtml, metaContent, stripTags } from "./html.js";

// Generic OpenGraph/favicon scrape — the fallback for any URL that no
// specialized store analyzer claims.
export async function analyzePage(url, limit, ua = UA) {
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
