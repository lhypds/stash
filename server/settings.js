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
  // Show nsfw items from anywhere. Off, they're still shown from safeIPs.
  nsfw: false,
  // The addresses nsfw items stay visible from while the nsfw toggle is off, as
  // IP literals or CIDR ranges. Empty (the default) means the toggle alone
  // decides. Ignored while the toggle is on — that shows them from anywhere.
  safeIPs: [],
  // The password the account is signed into with, as it was typed. Empty means
  // one has still to be chosen, which is what the first step of signing in reads
  // it as, and what an account opened before there were passwords has.
  // Plain text, deliberately. There is no reset link and no address on file to
  // send one to: whoever forgets theirs writes to the administrator (see
  // VITE_ADMIN_EMAIL), who reads this field and sets a new one — and a hash would
  // make that the one thing the administrator cannot do.
  password: "",
};

// settings.safeIPs as a list of rules: trimmed, with blanks and non-strings
// dropped. A rule that doesn't parse is deliberately *kept* — it never matches
// either way, and kept, the user can still see the typo in the settings editor
// instead of wondering why an address that should see nsfw items doesn't.
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
  // Two older shapes are settled here, so the first read of an old file tidies
  // it. isLocked and a second password were the stash lock, which is gone — an
  // account is got into with the password below and there is nothing further to
  // bolt — and while that lock held the shorter name, the login password was
  // written as loginPassword. A file carrying both keys means the login one is
  // loginPassword; one carrying only `password` has already been through here.
  const carried = { ...(existing || {}) };
  delete carried.isLocked;
  delete carried.loginPassword;
  const password = existing?.loginPassword ?? existing?.password;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...carried,
    password: typeof password === "string" ? password : "",
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

// Whether nsfw items should be listed for a viewer at `ip`. The nsfw toggle on
// means they're shown from anywhere, safeIPs or not. Off, they're hidden except
// from one of settings.safeIPs, so a stash that's fine to open at home stays
// clean on the office network without flipping the toggle back and forth.
export function nsfwVisibleFrom(settings, ip) {
  if (settings?.nsfw === true) return true;
  return ipInList(ip, readSafeIPs(settings?.safeIPs));
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
