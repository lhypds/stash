async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const STORE_KEYS = ["pages", "tweets", "videos", "channels", "ios-apps", "android-apps"];
export const URL_STORES = new Set(["tweets", "pages", "videos", "channels"]);

export const searchStore = (store, term, country = "us") =>
  request(`/api/search?store=${store}&country=${country}&term=${encodeURIComponent(term)}`);

export const analyzeUrl = (store, url) =>
  request(`/api/analyze?store=${store}&url=${encodeURIComponent(url)}`);

export const ensureUser = (username) => request(`/api/users/${username}`, { method: "POST" });

export const getSettings = (username) => request(`/api/users/${username}/settings`);

export const saveSettings = (username, settings) =>
  request(`/api/users/${username}/settings`, json("PUT", { settings }));

export const getStash = (username) => request(`/api/users/${username}/stash`);

export const stashItem = (username, item) => request(`/api/users/${username}/items`, json("POST", item));

export const updateItem = (username, store, itemId, patch) =>
  request(`/api/users/${username}/items/${store}/${encodeURIComponent(itemId)}`, json("PATCH", patch));

export const removeItem = (username, store, itemId) =>
  request(`/api/users/${username}/items/${store}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
