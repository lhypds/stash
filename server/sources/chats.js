import { UA, matchesHost, fetchHtml, metaContent, stripTags } from "./html.js";
import { readRenderedTitle } from "../screenshot.js";

const CHAT_PLATFORMS = [
  { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], titleInTag: true },
  { label: "Gemini", hosts: ["gemini.google.com", "g.co"] },
  { label: "Grok", hosts: ["grok.com", "x.ai"] },
  { label: "Claude", hosts: ["claude.ai"] },
  { label: "Doubao", hosts: ["doubao.com"], renderedTitle: true },
];

export const chatPlatformFor = (host) => CHAT_PLATFORMS.find((platform) => matchesHost(platform, host));

// Drop a trailing/leading brand from a shared-chat title (e.g. "… - ChatGPT").
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

export async function analyzeChat(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const platform = chatPlatformFor(host);
  if (platform?.renderedTitle) {
    const { title, finalUrl } = await readRenderedTitle(url);
    const loc = new URL(finalUrl);
    return {
      kind: "chat",
      name: title,
      byline: platform.label,
      icon: `${loc.origin}/favicon.ico`,
      url: finalUrl,
    };
  }
  const { html, finalUrl } = await fetchHtml(url, platform?.ua || UA, 2000000);
  const loc = new URL(finalUrl);
  const ogTitle = metaContent(html, "og:title");
  const docTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const title = (platform?.titleInTag ? docTitle || ogTitle : ogTitle || docTitle) || platform?.label || finalUrl;
  const image = metaContent(html, "og:image");
  return {
    kind: "chat",
    name: stripBrand(title, platform?.label),
    byline: platform?.label || metaContent(html, "og:site_name") || loc.hostname,
    icon: image ? new URL(image, finalUrl).href : `${loc.origin}/favicon.ico`,
    url: finalUrl,
  };
}
