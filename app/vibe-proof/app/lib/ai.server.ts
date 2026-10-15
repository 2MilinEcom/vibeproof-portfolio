type ResponsePayload = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateAiText(args: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      instructions: args.instructions,
      input: args.input,
      max_output_tokens: args.maxOutputTokens ?? 400,
      store: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as ResponsePayload;
  const text = (json.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();

  return text || null;
}
