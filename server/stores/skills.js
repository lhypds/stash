import { ITEM_ID_RE } from "../stores.js";

// Every skill on skills.sh ships as a file in a public GitHub repo and is
// served at /{owner}/{repo}/{skill-slug}; the search API lives on the apex.
export const isSkillHost = (host) => host === "skills.sh";

// GitHub's own avatar shortcut (redirects to avatars.githubusercontent.com) —
// used as the item icon since search results carry no icon of their own.
const ownerIcon = (owner) => `https://github.com/${owner}.png`;

// A stashable itemId can't hold "/", so an "owner/repo/skill-slug" id is
// flattened to "owner--repo--skill-slug".
const skillItemId = (id) => id.replace(/\//g, "--");

// A pasted skill page URL carries its owner/repo/slug right in the path, so
// it resolves to a full item with no extra lookup needed.
export function analyzeSkillUrl(href) {
  const { pathname } = new URL(href);
  const [owner, repo, slug] = pathname.split("/").filter(Boolean);
  if (!owner || !repo || !slug) throw new Error("no skill in url");
  return {
    itemId: skillItemId(`${owner}/${repo}/${slug}`),
    kind: "skill",
    name: slug,
    byline: `${owner}/${repo}`,
    icon: ownerIcon(owner),
    url: `https://www.skills.sh/${owner}/${repo}/${slug}`,
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
