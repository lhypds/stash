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

// Also the order the store filter lists them in — notes first, being the one
// store you write into rather than collect from somewhere else.
export const STORE_KEYS = [
  "notes",
  "pages",
  "posts",
  "publishers",
  "videos",
  "channels",
  "chats",
  "repositories",
  "apps",
  "skills",
];
export const URL_STORES = new Set(["posts", "publishers", "pages", "videos", "channels", "chats", "repositories"]);

// Stores whose items are authored rather than collected, and so can't be
// stashed into: a note is written through its own endpoint (see createNote).
// Mirrors the "write" type on the server's STORES.
export const WRITE_STORES = new Set(["notes"]);

// Stores filled by a keyword search rather than a pasted link.
export const SEARCH_STORES = new Set(["apps", "skills"]);

// Stores whose items get a background screenshot instead of arriving with one;
// the detail view polls for it to land. Mirrors SHOT_STORES on the server.
export const SHOT_STORES = new Set(["pages", "chats"]);

// Largest image attachable to a note. Mirrors MAX_NOTE_IMAGE_BYTES on the
// server, so an oversized pick is caught before it's read and base64-inflated.
export const MAX_NOTE_IMAGE_MB = 8;

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

// Writes a new note into the Notes store. `image` is an optional data: URL of
// one attached image, `imageName` the file it came from — the server stores it
// under that name, re-encoded to webp.
export const createNote = (username, { text, image, imageName }) =>
  request(
    `/api/users/${userPath(username)}/notes`,
    json("POST", { text, image: image || null, imageName: imageName || null }),
  );

// `store` locates the item in the source stash; `toStore` is where the copy
// should land — omitted, it lands in the store it came from. `note` stands in
// for the note the item carries over; omitted, that note is kept as-is.
export const copyItem = (username, fromUsername, store, itemId, toStore = null, note = null) =>
  request(
    `/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}/copy`,
    json("POST", {
      from: fromUsername,
      ...(toStore ? { store: toStore } : {}),
      ...(typeof note === "string" ? { note } : {}),
    }),
  );

export const updateItem = (username, store, itemId, patch) =>
  request(`/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}`, json("PATCH", patch));

export const refreshItem = (username, store, itemId, country = "us") =>
  request(
    `/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}/refresh?country=${country}`,
    { method: "POST" },
  );

export const removeItem = (username, store, itemId) =>
  request(`/api/users/${userPath(username)}/items/${store}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
