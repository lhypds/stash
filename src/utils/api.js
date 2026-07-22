async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  return body;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const STORE_KEYS = ["pages", "posts", "videos", "channels", "chats", "apps"];
export const URL_STORES = new Set(["posts", "pages", "videos", "channels", "chats"]);

// Stores whose items get a background screenshot instead of arriving with one;
// the detail view polls for it to land. Mirrors SHOT_STORES on the server.
export const SHOT_STORES = new Set(["pages", "chats"]);

const userPath = (username) => encodeURIComponent(username);

export const searchStore = (store, term, country = "us") =>
  request(`/api/search?store=${store}&country=${country}&term=${encodeURIComponent(term)}`);

// The server auto-detects the type (Page/Post/Video/Channel, or an app from an
// App Store / Google Play link) from the URL's host. country steers app lookups.
export const analyzeUrl = (url, country = "us") =>
  request(`/api/analyze?store=auto&country=${country}&url=${encodeURIComponent(url)}`);

export const ensureUser = (username) => request(`/api/users/${userPath(username)}`, { method: "POST" });

export const login = (username) => request(`/api/users/${userPath(username)}/login`, json("POST", {}));

export const getSession = () => request("/api/session");

export const logout = () => request("/api/session", { method: "DELETE" });

export const getLock = (username) => request(`/api/users/${userPath(username)}/lock`);

export const lockUser = (username, password) =>
  request(`/api/users/${userPath(username)}/lock`, json("PUT", { password }));

export const unlockUser = (username, password) =>
  request(`/api/users/${userPath(username)}/unlock`, json("POST", { password }));

export const relockUser = (username) => request(`/api/users/${userPath(username)}/relock`, json("POST", {}));

export const getSettings = (username) => request(`/api/users/${userPath(username)}/settings`);

export const saveSettings = (username, settings) =>
  request(`/api/users/${userPath(username)}/settings`, json("PUT", { settings }));

export const getStash = (username) => request(`/api/users/${userPath(username)}/stash`);

export const stashItem = (username, item) => request(`/api/users/${userPath(username)}/items`, json("POST", item));

export const updateItem = (username, store, itemId, patch) =>
  request(`/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}`, json("PATCH", patch));

export const removeItem = (username, store, itemId) =>
  request(`/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
