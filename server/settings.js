import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { STORES } from "./stores.js";

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const settingsFile = (username) => path.join(DATA_DIR, "users", username, "settings.json");

const DEFAULT_SETTINGS = {
  stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, true])),
  nsfw: false,
  isLocked: false,
  password: "",
};

export async function userExists(username) {
  try {
    await fs.access(settingsFile(username));
    return true;
  } catch {
    return false;
  }
}

// Load a user's settings, normalized to the current shape: defaults filled in,
// lock/password coerced to valid types, and the store map rebuilt from the
// known stores so renamed/removed keys don't linger. Rewrites the file when
// normalization changed anything, and creates it for a brand-new user.
export async function ensureSettings(username) {
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(settingsFile(username), "utf8"));
  } catch {
    existing = null;
  }
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(existing || {}),
    isLocked: existing?.isLocked === true,
    password: typeof existing?.password === "string" ? existing.password : "",
    stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, existing?.stores?.[s] ?? true])),
    nsfw: typeof existing?.nsfw === "boolean" ? existing.nsfw : false,
  };
  if (JSON.stringify(merged) !== JSON.stringify(existing)) await writeSettings(username, merged);
  return merged;
}

// Persist a settings object verbatim (caller is responsible for its shape).
export async function writeSettings(username, settings) {
  const file = settingsFile(username);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(settings, null, 2) + "\n");
}

// Constant-time comparison for the stash-lock password.
export function passwordsMatch(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
