// What a dropped file can turn into: an image attached to a note, or text
// loaded into the note itself. Both the page-wide drop target and the note
// modal's own classify files the same way, so the rules live here.

// Text formats a browser labels as something other than text/*
const TEXT_TYPES = new Set(["application/json", "application/xml", "application/yaml", "application/x-yaml"]);

// Browsers hand over an empty type for plenty of plain-text extensions
// (.md and .log among them), so the name is the fallback.
const TEXT_EXTENSIONS = /\.(txt|text|md|markdown|log|csv|tsv|json|ya?ml|toml|ini|conf|xml|html?|srt|vtt)$/i;

export const isImageFile = (file) => !!file && file.type.startsWith("image/");

export const isTextFile = (file) =>
  !!file &&
  !isImageFile(file) &&
  (file.type.startsWith("text/") || TEXT_TYPES.has(file.type) || (!file.type && TEXT_EXTENSIONS.test(file.name)));

// Anything a note can take in — used to decide whether a drop is ours at all.
export const isNoteFile = (file) => isImageFile(file) || isTextFile(file);

// A pasted screenshot can arrive nameless, so one is made up: the note lists
// the name beside its attach button, and the stored file is named after it.
function named(file) {
  if (file.name) return file;
  const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  return new File([file], `pasted-image.${ext}`, { type: file.type });
}

// The first file on a clipboard a note can take, images first — a copied image
// often rides along with the HTML it came from. Older browsers only expose the
// files through `items`, hence the fallback. Returns null for a paste that
// carries no file at all, which is every ordinary text paste.
export function clipboardFile(clipboardData) {
  const carried = clipboardData?.files?.length
    ? [...clipboardData.files]
    : [...(clipboardData?.items || [])].filter((i) => i.kind === "file").map((i) => i.getAsFile());
  const files = carried.filter(isNoteFile);
  const file = files.find(isImageFile) || files[0];
  return file ? named(file) : null;
}
