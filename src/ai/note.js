import fs from "node:fs/promises";
import { chatJSON } from "./openai.js";

const SYSTEM_PROMPT = `You help organize a personal collection of saved notes.
Given one note (text, an image, or both), reply with a JSON object with two string fields:
- "title": a concise, specific title, at most 60 characters.
- "comment": 2–5 sentences. If the note mentions facts, things, ideas, or questions, research them and add useful background, corrections, or answers. If it is mainly personal writing, comment on the writing itself. Do not just restate the note.
Write both in the same language as the note.`;

// A note's AI title and comment. `imagePath` is its stored (webp) image, if any.
export async function generateNoteAI({ text, imagePath }) {
  const content = [{ type: "text", text: `Note:\n${String(text || "").slice(0, 12000)}` }];
  if (imagePath) {
    const b64 = (await fs.readFile(imagePath)).toString("base64");
    content.push({ type: "image_url", image_url: { url: `data:image/webp;base64,${b64}` } });
  }
  const { title, comment } = await chatJSON(SYSTEM_PROMPT, content);
  return { title: String(title || "").trim().slice(0, 80), comment: String(comment || "").trim() };
}
