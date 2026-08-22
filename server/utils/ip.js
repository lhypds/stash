// Client-address matching for settings.safeIPs — the addresses a user's nsfw
// items stay visible from. A rule is either an IP literal or a CIDR range, in
// either family: "203.0.113.4", "203.0.113.0/24", "2001:db8::1", "2001:db8::/32".

// The address a request came from. Express resolves X-Forwarded-For into req.ip
// according to the app's "trust proxy" setting (see index.js) — with the whole
// chain trusted, that leftmost entry is written by the client itself, so a
// deployment gating on safeIPs wants TRUST_PROXY pinned to its real hop count.
export const clientIp = (req) => req.ip || req.socket?.remoteAddress || "";

function ipv4Bytes(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (const [i, part] of parts.entries()) {
    // Reject "0x7f", "010" and the like rather than guessing at them: a rule
    // only ever has to match what a socket reports, which is canonical.
    if (!/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) return null;
    bytes[i] = Number(part);
  }
  return bytes;
}

function ipv6Groups(chunk) {
  if (chunk === "") return [];
  const parts = chunk.split(":");
  const groups = [];
  for (const [i, part] of parts.entries()) {
    // A trailing dotted quad (::ffff:203.0.113.4) stands in for the last two groups
    if (part.includes(".")) {
      if (i !== parts.length - 1) return null;
      const v4 = ipv4Bytes(part);
      if (!v4) return null;
      groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

function ipv6Bytes(text) {
  const [addr] = text.split("%"); // drop a link-local zone id (fe80::1%en0)
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = ipv6Groups(halves[0]);
  const tail = halves.length === 2 ? ipv6Groups(halves[1]) : [];
  if (!head || !tail) return null;
  // "::" stands for at least one group of zeros; without it every group is written out
  const zeros = 8 - head.length - tail.length;
  if (halves.length === 2 ? zeros < 1 : head.length !== 8) return null;
  const groups = halves.length === 2 ? [...head, ...Array(zeros).fill(0), ...tail] : head;
  const bytes = new Uint8Array(16);
  groups.forEach((group, i) => {
    bytes[i * 2] = group >> 8;
    bytes[i * 2 + 1] = group & 0xff;
  });
  return bytes;
}

// An address literal as its bytes — 4 for IPv4, 16 for IPv6 — or null if it
// isn't one. The two lengths never match, which is what keeps an IPv4 client
// from matching an IPv6 rule.
function ipBytes(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return value.includes(":") ? ipv6Bytes(value) : ipv4Bytes(value);
}

// An IPv4 client on a dual-stack socket is reported in IPv4-mapped form
// (::ffff:203.0.113.4), which has to match a rule written as the plain
// 203.0.113.4 — so both sides collapse to the four bytes they really are.
function asIpv4(bytes) {
  if (bytes.length !== 16) return bytes;
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return bytes;
  return bytes[10] === 0xff && bytes[11] === 0xff ? bytes.slice(12) : bytes;
}

// A safeIPs entry as {bytes, bits}, or null when it's neither an IP literal nor
// a CIDR range. A bare literal is just a range with every bit significant.
export function parseIpRule(rule) {
  const text = String(rule ?? "").trim();
  const slash = text.indexOf("/");
  const prefix = slash === -1 ? null : text.slice(slash + 1);
  if (prefix !== null && !/^(0|[1-9]\d{0,2})$/.test(prefix)) return null;
  const raw = ipBytes(slash === -1 ? text : text.slice(0, slash));
  if (!raw) return null;
  let bits = prefix === null ? raw.length * 8 : Number(prefix);
  if (bits > raw.length * 8) return null;
  const bytes = asIpv4(raw);
  // A range written in IPv4-mapped form ("::ffff:203.0.113.0/120") counts its
  // prefix over 128 bits; the four bytes it collapses to count over 32.
  if (bytes.length !== raw.length) bits = Math.max(0, bits - 96);
  return { bytes, bits };
}

export const isValidIpRule = (rule) => parseIpRule(rule) !== null;

export function ipMatchesRule(ip, rule) {
  const parsed = parseIpRule(rule);
  const raw = ipBytes(ip);
  const addr = raw && asIpv4(raw);
  if (!parsed || !addr || addr.length !== parsed.bytes.length) return false;
  const whole = parsed.bits >> 3;
  for (let i = 0; i < whole; i++) if (addr[i] !== parsed.bytes[i]) return false;
  const rest = parsed.bits & 7;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (addr[whole] & mask) === (parsed.bytes[whole] & mask);
}

// Whether an address falls inside any of the rules. An unparseable rule simply
// never matches, so a typo fails closed rather than opening the list up.
export const ipInList = (ip, rules) => rules.some((rule) => ipMatchesRule(ip, rule));
