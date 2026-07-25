#!/usr/bin/env node
// One-off migration: re-encode existing icon/thumbnail/screenshot files to
// WebP so old stashed items benefit the same way new ones do (see
// downloadIcon() and captureFullPage() in ../index.js and ../utils/screenshot.js).
//
// Safe to interrupt and re-run: already-webp/svg/ico files are skipped, and
// each image is written to a .tmp file and renamed into place only after a
// successful encode, so a crash mid-run never leaves a half-written file.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = process.env.STASH_DATA_DIR || path.join(ROOT, "data");
const DRY_RUN = process.argv.includes("--dry-run");
const QUALITY = 80;
const SKIP_EXT = new Set(["webp", "svg", "ico"]);
const FIELDS = ["iconFile", "screenshotFile"];

const stats = { converted: 0, skipped: 0, missing: 0, errors: 0, before: 0, after: 0 };
const errors = [];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function fmt(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)}MB` : `${(bytes / 1024).toFixed(1)}KB`;
}

async function convertField(dir, itemJsonPath, label, field, record) {
  const oldFile = record[field];
  if (!oldFile) return;
  const ext = path.extname(oldFile).slice(1).toLowerCase();
  if (SKIP_EXT.has(ext)) {
    stats.skipped++;
    return;
  }

  const oldPath = path.join(dir, oldFile);
  const newFile = `${path.basename(oldFile, path.extname(oldFile))}.webp`;
  const newPath = path.join(dir, newFile);
  const tmpPath = `${newPath}.tmp`;

  let before;
  try {
    before = (await fs.stat(oldPath)).size;
  } catch {
    stats.missing++;
    console.warn(`[${label}] ${field}: ${oldFile} referenced but missing on disk, skipping`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[${label}] ${oldFile} would convert (${fmt(before)})`);
    return;
  }

  try {
    await sharp(oldPath, { animated: true }).webp({ quality: QUALITY }).toFile(tmpPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    stats.errors++;
    errors.push(`${itemJsonPath} (${field}): ${err.message}`);
    return;
  }

  const after = (await fs.stat(tmpPath)).size;
  await fs.rename(tmpPath, newPath);

  // Re-read right before writing so a concurrent live update to other
  // fields (e.g. a refresh happening on the running server) isn't clobbered.
  const fresh = await readJson(itemJsonPath).catch(() => record);
  fresh[field] = newFile;
  await fs.writeFile(itemJsonPath, JSON.stringify(fresh, null, 2) + "\n");

  if (oldPath !== newPath) await fs.rm(oldPath, { force: true });

  stats.converted++;
  stats.before += before;
  stats.after += after;
  const pct = (100 * (1 - after / before)).toFixed(1);
  console.log(`[${label}] ${oldFile} -> ${newFile}: ${fmt(before)} -> ${fmt(after)} (${pct}%)`);
}

async function run() {
  const usersRoot = path.join(DATA_DIR, "users");
  const users = await fs.readdir(usersRoot).catch(() => []);
  for (const user of users) {
    const storesRoot = path.join(usersRoot, user, "stores");
    const stores = await fs.readdir(storesRoot).catch(() => []);
    for (const store of stores) {
      const storeDir = path.join(storesRoot, store);
      const items = await fs.readdir(storeDir).catch(() => []);
      for (const itemId of items) {
        const dir = path.join(storeDir, itemId);
        const itemJsonPath = path.join(dir, "item.json");
        const record = await readJson(itemJsonPath).catch(() => null);
        if (!record) continue;
        const label = `${store}/${itemId}`;
        for (const field of FIELDS) await convertField(dir, itemJsonPath, label, field, record);
      }
    }
  }

  console.log("\n--- summary ---");
  if (DRY_RUN) console.log("(dry run, nothing was written)");
  console.log(`converted: ${stats.converted}`);
  console.log(`skipped (already webp/svg/ico): ${stats.skipped}`);
  console.log(`missing (referenced but not on disk): ${stats.missing}`);
  console.log(`errors: ${stats.errors}`);
  if (stats.before > 0) {
    const pct = (100 * (1 - stats.after / stats.before)).toFixed(1);
    console.log(`size: ${fmt(stats.before)} -> ${fmt(stats.after)} (${pct}% smaller)`);
  }
  if (errors.length) {
    console.log("\nfailed files (left untouched):");
    for (const e of errors) console.log(`  ${e}`);
  }
}

await run();
