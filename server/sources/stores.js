// The store registry and the small shared rules the server validates against.
// Kept dependency-free so any source module can import it without cycles.

// Every content bucket the app understands, and how new items reach it: a
// "url" store is filled by analyzing a pasted link; a "search" store by
// keyword search.
export const STORES = {
  pages: { type: "url" },
  posts: { type: "url" },
  videos: { type: "url" },
  channels: { type: "url" },
  chats: { type: "url" },
  apps: { type: "search" },
};

// Stores whose items get a background page screenshot after stashing.
export const SHOT_STORES = new Set(["pages", "chats"]);

// A stored itemId: a leading alphanumeric then up to 220 more of [A-Za-z0-9._-].
// Guards against path traversal and keeps ids filesystem-safe.
export const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,220}$/;
