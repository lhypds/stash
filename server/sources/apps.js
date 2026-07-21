import gplay from "google-play-scraper";
import { ITEM_ID_RE } from "./stores.js";

// The App Store / Google Play hosts, used to route a pasted link to the apps
// store and to pick the right lookup API.
export const isAppHost = (host) =>
  host === "apps.apple.com" || host === "itunes.apple.com" || host === "play.google.com";

// An app item id namespaces the store's own id under its platform, e.g.
// "ios-com.foo.bar" or "android-com.foo.bar".
export const appItemId = (platform, id) => `${platform}-${id}`;

export async function analyzeAppUrl(href, country) {
  const u = new URL(href);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const queryId = u.searchParams.get("id");
    const id = u.pathname.match(/\/id(\d+)/)?.[1] || (/^\d+$/.test(queryId) ? queryId : null);
    if (!id) throw new Error("no app id in url");
    const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`);
    if (!r.ok) throw new Error(`itunes ${r.status}`);
    const app = (await r.json()).results?.[0];
    if (!app?.bundleId) throw new Error("app not found");
    return {
      itemId: appItemId("ios", app.bundleId),
      kind: "app",
      name: app.trackName,
      byline: app.artistName,
      icon: app.artworkUrl512 || app.artworkUrl100,
      url: app.trackViewUrl || href,
    };
  }
  const appId = u.searchParams.get("id");
  if (host !== "play.google.com" || !appId) throw new Error("no app id in url");
  const app = await gplay.app({ appId, country });
  return {
    itemId: appItemId("android", app.appId),
    kind: "app",
    name: app.title,
    byline: app.developer,
    icon: app.icon,
    url: app.url || href,
  };
}

// Keyword search across the App Store and Google Play in parallel. Fails only
// if both stores error; a single store's failure just yields its half empty.
export async function searchApps(term, country) {
  const searches = await Promise.allSettled([
    (async () => {
      const url =
        `https://itunes.apple.com/search?media=software&limit=12` +
        `&country=${country}&term=${encodeURIComponent(term)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`itunes ${r.status}`);
      const json = await r.json();
      return (json.results || [])
        .filter((app) => app.bundleId && ITEM_ID_RE.test(appItemId("ios", app.bundleId)))
        .map((app) => ({
          store: "apps",
          itemId: appItemId("ios", app.bundleId),
          kind: "app",
          name: app.trackName,
          byline: app.artistName,
          icon: app.artworkUrl512 || app.artworkUrl100,
          url: app.trackViewUrl,
        }));
    })(),
    (async () => {
      const found = await gplay.search({ term, num: 12, country });
      return found
        .filter((app) => ITEM_ID_RE.test(appItemId("android", app.appId)))
        .map((app) => ({
          store: "apps",
          itemId: appItemId("android", app.appId),
          kind: "app",
          name: app.title,
          byline: app.developer,
          icon: app.icon,
          url: app.url,
        }));
    })(),
  ]);
  const results = searches.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!results.length && searches.every((result) => result.status === "rejected")) {
    throw new Error("app searches failed");
  }
  return results;
}
