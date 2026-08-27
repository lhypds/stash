import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { STORES } from "./stores.js";
import { isValidIpRule, ipInList } from "./utils/ip.js";

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const settingsFile = (username) => path.join(DATA_DIR, "users", username, "settings.json");

// Search engines behind the "apps" and "skills" stores, individually
// toggleable so e.g. Google Play results can be turned off without hiding the
// App Store too.
const SEARCH_ENGINES = ["app_store", "google_play", "skills_dot_sh"];

const DEFAULT_SETTINGS = {
  stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, true])),
  search: Object.fromEntries(SEARCH_ENGINES.map((k) => [k, true])),
  nsfw: false,
  // The addresses nsfw items stay visible from, as IP literals or CIDR ranges.
  // Empty (the default) means the nsfw toggle alone decides, from anywhere.
  safeIPs: [],
  // The password the account is signed into with, as it was typed. Empty means
  // one has still to be chosen, which is what the first step of signing in reads
  // it as, and what an account opened before there were passwords has.
  // Plain text, deliberately. There is no reset link and no address on file to
  // send one to: whoever forgets theirs writes to the administrator (see
  // VITE_ADMIN_EMAIL), who reads this field and sets a new one — and a hash would
  // make that the one thing the administrator cannot do.
  loginPassword: "",
};

// settings.safeIPs as a list of rules: trimmed, with blanks and non-strings
// dropped. A rule that doesn't parse is deliberately *kept* — dropping it would
// leave an empty list, which reads as "no restriction", so one typo in a
// hand-edited file would publish the nsfw items the list exists to keep in.
// Kept, it just never matches, and the user can see it in the settings editor.
const readSafeIPs = (value) =>
  Array.isArray(value)
    ? value.filter((rule) => typeof rule === "string").map((rule) => rule.trim()).filter(Boolean)
    : [];

export async function userExists(username) {
  try {
    await fs.access(settingsFile(username));
    return true;
  } catch {
    return false;
  }
}

// Load a user's settings, normalized to the current shape: defaults filled in,
// the password coerced to a valid type, and the store map rebuilt from the
// known stores so renamed/removed keys don't linger. Rewrites the file when
// normalization changed anything, and creates it for a brand-new user.
export async function ensureSettings(username) {
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(settingsFile(username), "utf8"));
  } catch {
    existing = null;
  }
  // isLocked/password were the stash lock, which is gone — an account is got
  // into with loginPassword and there is nothing further to bolt. Dropped here
  // rather than left behind, so the first read of an old file tidies it.
  const carried = { ...(existing || {}) };
  delete carried.isLocked;
  delete carried.password;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...carried,
    loginPassword: typeof existing?.loginPassword === "string" ? existing.loginPassword : "",
    stores: Object.fromEntries(Object.keys(STORES).map((s) => [s, existing?.stores?.[s] ?? true])),
    search: Object.fromEntries(SEARCH_ENGINES.map((k) => [k, existing?.search?.[k] ?? true])),
    nsfw: typeof existing?.nsfw === "boolean" ? existing.nsfw : false,
    safeIPs: readSafeIPs(existing?.safeIPs),
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

// Whether nsfw items should be listed for a viewer at `ip`. The nsfw toggle
// still decides whether they're shown at all; safeIPs narrows *where* from, so
// a stash that's fine to open at home stays clean on the office network — with
// a non-empty list, only requests from one of those addresses see them.
export function nsfwVisibleFrom(settings, ip) {
  if (!settings?.nsfw) return false;
  const safeIPs = readSafeIPs(settings.safeIPs);
  return safeIPs.length === 0 || ipInList(ip, safeIPs);
}

// Whether a settings object's safeIPs is one this server can act on — used to
// reject a bad rule as it's saved instead of quietly dropping it on the next
// read. Absent is fine; present has to be an array of usable rules.
export const safeIPsAcceptable = (value) =>
  value === undefined || (Array.isArray(value) && value.every((rule) => typeof rule === "string" && isValidIpRule(rule)));

// Constant-time comparison for the login password.
export function passwordsMatch(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
