import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

// Notes are the one store that isn't scraped from a URL — the user writes them
// in the app, optionally attaching one image. Everything here is about turning
// that raw input into the same item.json shape every other store produces.

// A note's title is its first non-empty line, so the card has something to show
// without asking for a separate title field. Long first lines are trimmed; a
// note that is only whitespace has no title at all (callers reject it).
export const NOTE_TITLE_LENGTH = 80;

export function noteTitle(text) {
  const line = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > NOTE_TITLE_LENGTH ? `${line.slice(0, NOTE_TITLE_LENGTH - 1)}…` : line;
}

// Attached images arrive as a data: URL in the JSON body (no multipart parser in
// this server), capped well under the notes route's body limit.
export const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024;

// Decodes a `data:image/...;base64,...` string into raw bytes, or null if it
// isn't one / is oversized.
export function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  let buf;
  try {
    buf = Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_NOTE_IMAGE_BYTES) return null;
  return buf;
}

// Writes an attached image into the note's own directory as its thumbnail,
// re-encoded to webp like a downloaded icon. Returns the filename, or null if
// the bytes turn out not to be a decodable image.
export async function saveNoteImage(dir, dataUrl) {
  const buf = decodeImageDataUrl(dataUrl);
  if (!buf) return null;
  const file = "thumbnail.webp";
  try {
    await sharp(buf, { animated: true }).webp({ quality: 80 }).toFile(path.join(dir, file));
    return file;
  } catch (err) {
    console.error("note image save failed:", err.message);
    await fs.rm(path.join(dir, file), { force: true });
    return null;
  }
}
