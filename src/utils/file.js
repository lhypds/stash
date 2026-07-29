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
