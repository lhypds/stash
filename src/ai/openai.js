// OpenAI client. Server-only: reads OPENAI_API_KEY, which must never reach a browser.

const apiKey = () => (process.env.OPENAI_API_KEY || "").trim();

export const aiEnabled = () => Boolean(apiKey());

// One chat call in JSON mode; resolves to the parsed reply.
export async function chatJSON(system, content) {
  if (!aiEnabled()) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
