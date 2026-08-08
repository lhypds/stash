import { UA, fetchHtml, metaContent, truncate, PREVIEW_LENGTH } from "../utils/html.js";

// Path segments that sit at the same `/segment` depth as a repo owner but are
// the forge's own routes, not accounts — so `github.com/topics/rust` isn't read
// as the "rust" repo of an owner called "topics".
const GITHUB_RESERVED = new Set([
  "about",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "signup",
  "site",
  "sponsors",
  "stars",
  "topics",
  "trending",
]);
const GITLAB_RESERVED = new Set([
  "-",
  "admin",
  "dashboard",
  "explore",
  "groups",
  "help",
  "projects",
  "public",
  "pricing",
  "users",
]);
const BITBUCKET_RESERVED = new Set(["account", "dashboard", "product", "repo", "workspace", "workspaces"]);
const GITEA_RESERVED = new Set(["admin", "api", "explore", "issues", "notifications", "org", "pulls", "user"]);
const GITEE_RESERVED = new Set([
  "enterprises",
  "explore",
  "gists",
  "login",
  "notifications",
  "organizations",
  "profile",
  "signup",
]);

// Each forge exposes the same repo facts through its own public REST API, with
// no key needed: `api` builds the lookup URL from the repo's path segments and
// `read` maps that response onto the shared shape repoPreview/analyzeRepository
// consume. A field a forge doesn't have (Bitbucket has no stars, GitLab's
// project payload carries no language) is simply left out.
const REPO_PLATFORMS = [
  {
    label: "GitHub",
    hosts: ["github.com"],
    reserved: GITHUB_RESERVED,
    api: ([owner, name]) => `https://api.github.com/repos/${owner}/${name}`,
    read: (d) => ({
      name: d.full_name,
      byline: d.owner?.login,
      icon: d.owner?.avatar_url,
      url: d.html_url,
      description: d.description,
      stars: d.stargazers_count,
      language: d.language,
      clone: d.clone_url,
    }),
    // GitHub's own avatar shortcut (redirects to avatars.githubusercontent.com),
    // the same one skills.js uses — a repo page's og:image is a generated social
    // card, which reads as noise at thumbnail size.
    ownerIcon: (owner) => `https://github.com/${owner}.png`,
    // Every GitHub repo's og:description ends with the same generated call to
    // action, and a repo with no description of its own has nothing but that.
    descFromMeta: (desc) =>
      desc?.replace(/\s*-?\s*Contribute to \S+ development by creating an account on GitHub\.?\s*$/i, "").trim() || null,
  },
  {
    label: "GitLab",
    hosts: ["gitlab.com"],
    reserved: GITLAB_RESERVED,
    // A GitLab project can sit under nested groups (group/subgroup/project),
    // so its whole path — not just two segments — identifies it.
    nestedGroups: true,
    api: (path) => `https://gitlab.com/api/v4/projects/${encodeURIComponent(path.join("/"))}`,
    read: (d) => ({
      name: d.path_with_namespace,
      byline: d.namespace?.name || d.namespace?.path,
      icon: d.avatar_url || d.namespace?.avatar_url,
      url: d.web_url,
      description: d.description,
      stars: d.star_count,
      clone: d.http_url_to_repo,
    }),
  },
  {
    label: "Bitbucket",
    hosts: ["bitbucket.org"],
    reserved: BITBUCKET_RESERVED,
    api: ([owner, name]) => `https://api.bitbucket.org/2.0/repositories/${owner}/${name}`,
    read: (d) => ({
      name: d.full_name,
      byline: d.owner?.display_name || d.workspace?.name,
      icon: d.links?.avatar?.href,
      url: d.links?.html?.href,
      description: d.description,
      language: d.language,
      clone: d.links?.clone?.find((link) => link.name === "https")?.href,
    }),
  },
  {
    label: "Codeberg",
    hosts: ["codeberg.org"],
    reserved: GITEA_RESERVED,
    api: ([owner, name]) => `https://codeberg.org/api/v1/repos/${owner}/${name}`,
    read: (d) => ({
      name: d.full_name,
      byline: d.owner?.full_name || d.owner?.login,
      icon: d.owner?.avatar_url,
      url: d.html_url,
      description: d.description,
      stars: d.stars_count,
      language: d.language,
      clone: d.clone_url,
    }),
  },
  {
    label: "Gitee",
    hosts: ["gitee.com"],
    reserved: GITEE_RESERVED,
    api: ([owner, name]) => `https://gitee.com/api/v5/repos/${owner}/${name}`,
    // Gitee's payload carries no https clone URL of its own, and its html_url
    // is the odd one out among the forges in already ending in `.git` — that
    // suffix is what separates the clone URL from the page URL here, so it's
    // stripped off one and kept on the other.
    read: (d) => {
      const page = d.html_url?.replace(/\.git$/i, "") || null;
      return {
        name: d.full_name,
        byline: d.owner?.name || d.owner?.login,
        icon: d.owner?.avatar_url,
        url: page,
        description: d.description,
        stars: d.stargazers_count,
        language: d.language,
        clone: page && `${page}.git`,
      };
    },
  },
];

// Repo hosts are matched exactly rather than by suffix (unlike matchesHost, the
// other stores' matcher): a forge's subdomains aren't repositories, and some of
// them serve paths with the very same two-segment shape a repo URL has —
// gist.github.com/{user}/{hash}, docs.github.com/{lang}/{page}.
const platformForHost = (host) => REPO_PLATFORMS.find((platform) => platform.hosts.includes(host));

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

// The repository a URL points at: the forge it lives on, and the owner/name
// path identifying it there. Deep links resolve to the repo they belong to,
// since every forge nests its views (tree, blob, issues, releases, ...) under
// the repo's own path. null for anything on those hosts that isn't a repo —
// the forge's own pages (github.com/pricing) and bare owner pages
// (github.com/anthropics), both of which are Pages instead.
export function repoFor(u) {
  const platform = platformForHost(u.hostname.replace(/^www\./, ""));
  if (!platform) return null;
  // GitLab routes every view of a project under `/-/`, so what precedes it is
  // the project path however deeply its groups nest.
  const segments = u.pathname.split("/-/")[0].split("/").filter(Boolean);
  const path = platform.nestedGroups ? segments : segments.slice(0, 2);
  if (path.length < 2 || platform.reserved.has(path[0].toLowerCase())) return null;
  // A pasted https clone URL ends in .git; it names the same repo as the page.
  path[path.length - 1] = path[path.length - 1].replace(/\.git$/i, "");
  if (!path.every((segment) => SEGMENT_RE.test(segment))) return null;
  return { platform, path };
}

export const isRepoUrl = (u) => !!repoFor(u);

// The forge's own API — the only source carrying a repo's stats and clone URL.
// Unauthenticated calls are rate-limited (GitHub allows 60/hour per IP), so a
// failure falls back to the repo page itself rather than failing the stash.
async function fetchRepoApi(platform, path) {
  try {
    const r = await fetch(platform.api(path), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`${platform.label} api ${r.status}`);
    return platform.read(await r.json());
  } catch (err) {
    console.error("repository api failed:", err.message);
    return null;
  }
}

// Fallback for when the API call didn't land: the repo page's own OpenGraph
// tags. They carry the description but none of the stats, so the item comes out
// thinner than an API-built one. Everything else is already spelled out by the
// URL — the name and owner, and the https clone URL, which on every one of
// these forges is just the repo's page URL with a .git suffix.
async function scrapeRepo(url, platform, path) {
  const { html, finalUrl } = await fetchHtml(url, UA);
  const desc = metaContent(html, "og:description");
  const page = finalUrl.replace(/\/$/, "");
  return {
    name: path.join("/"),
    byline: path[0],
    icon: platform.ownerIcon?.(path[0]) || metaContent(html, "og:image"),
    url: page,
    description: platform.descFromMeta ? platform.descFromMeta(desc) : desc,
    clone: `${page.replace(/\.git$/i, "")}.git`,
  };
}

// How popular and what it's written in are the two facts that tell repos apart
// at a glance, so they lead the preview, ahead of the description.
function repoPreview({ stars, language, description }) {
  const parts = [];
  if (typeof stars === "number" && stars > 0) parts.push(`★ ${stars.toLocaleString("en-US")}`);
  if (language) parts.push(language);
  const desc = description?.trim();
  if (desc) parts.push(desc);
  return parts.length ? truncate(parts.join(" · "), PREVIEW_LENGTH) : null;
}

export async function analyzeRepository(href) {
  const repo = repoFor(new URL(href));
  if (!repo) throw new Error("not a repository url");
  const { platform, path } = repo;
  const canonical = `https://${platform.hosts[0]}/${path.join("/")}`;
  const info = (await fetchRepoApi(platform, path)) || (await scrapeRepo(canonical, platform, path));
  return {
    kind: "repository",
    name: info.name || path.join("/"),
    byline: info.byline || path[0],
    icon: info.icon || platform.ownerIcon?.(path[0]) || null,
    url: info.url || canonical,
    preview: repoPreview(info),
    // A repo's counterpart to a skill's install command — the one line that
    // gets it onto your machine, copyable from the same block in the detail
    // view.
    installCommand: info.clone ? `git clone ${info.clone}` : null,
  };
}
