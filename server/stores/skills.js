import { ITEM_ID_RE } from "../stores.js";
import { fetchHtml, metaContent, stripTags, truncate, PREVIEW_LENGTH } from "../utils/html.js";

// Every skill on skills.sh ships as a file in a public GitHub repo and is
// served at /{owner}/{repo}/{skill-slug}; the search API lives on the apex.
export const isSkillHost = (host) => host === "skills.sh";

// GitHub's own avatar shortcut (redirects to avatars.githubusercontent.com) —
// used as the item icon since search results carry no icon of their own.
const ownerIcon = (owner) => `https://github.com/${owner}.png`;

// A stashable itemId can't hold "/", so an "owner/repo/skill-slug" id is
// flattened to "owner--repo--skill-slug".
const skillItemId = (id) => id.replace(/\//g, "--");

// The rendered "$ npx skills add ... --skill ..." snippet in a skill page's
// Installation section, e.g.:
//   <code>...<span>$</span> <!-- -->npx skills add https://github.com/o/r --skill s</code>
const INSTALL_CODE_RE = /Copy command to clipboard[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>/i;

// The rendered body of the skill's own markdown file (SKILL.md, or a
// prompt/theme file for those resource kinds), shown in a `.prose` block —
// a far better summary than the page's og:description, which just mirrors
// the file's (often terse, sometimes placeholder-y) frontmatter description.
const SKILL_BODY_RE = /class="prose prose-invert[^"]*">([\s\S]*?)<\/div>/i;

// The search API returns neither a description nor an install command, so
// both are scraped from the skill's own page — the rendered markdown body,
// and the copyable snippet in its Installation section. Best-effort: a fetch
// failure just means neither shows up, not a broken item.
export async function fetchSkillMeta(url) {
  try {
    const { html } = await fetchHtml(url);
    const body = html.match(SKILL_BODY_RE)?.[1];
    const desc = body ? stripTags(body) : metaContent(html, "og:description");
    const code = html.match(INSTALL_CODE_RE)?.[1];
    const installCommand = code ? stripTags(code).replace(/^\$\s*/, "") : null;
    return { preview: desc ? truncate(desc, PREVIEW_LENGTH) : null, installCommand: installCommand || null };
  } catch {
    return { preview: null, installCommand: null };
  }
}

// A pasted skill page URL carries its owner/repo/slug right in the path, so
// it resolves to a full item with no extra lookup beyond its own page.
export async function analyzeSkillUrl(href) {
  const { pathname } = new URL(href);
  const [owner, repo, slug] = pathname.split("/").filter(Boolean);
  if (!owner || !repo || !slug) throw new Error("no skill in url");
  const url = `https://www.skills.sh/${owner}/${repo}/${slug}`;
  return {
    itemId: skillItemId(`${owner}/${repo}/${slug}`),
    kind: "skill",
    name: slug,
    byline: `${owner}/${repo}`,
    icon: ownerIcon(owner),
    url,
    ...(await fetchSkillMeta(url)),
  };
}

// Keyword search across skills.sh's public catalog — off when settings.json's
// search.skills_dot_sh is false.
export async function searchSkills(term, flags = {}) {
  const { skills_dot_sh = true } = flags;
  if (!skills_dot_sh) return [];
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(term)}&limit=12`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`skills.sh ${r.status}`);
  const { skills } = await r.json();
  return (skills || [])
    .filter((skill) => skill.source?.includes("/") && ITEM_ID_RE.test(skillItemId(skill.id)))
    .map((skill) => ({
      store: "skills",
      itemId: skillItemId(skill.id),
      kind: "skill",
      name: skill.name,
      byline: skill.source,
      icon: ownerIcon(skill.source.split("/")[0]),
      url: `https://www.skills.sh/${skill.id}`,
    }));
}
