/**
 * Agnes AI API client (OpenAI-compatible).
 * Docs: https://agnes-ai.com/en/docs/overview — base URL https://apihub.agnes-ai.com/v1
 */

const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
export const AGNES_MODEL = "agnes-3.0-flash";

export type AgnesMessage = { role: "system" | "user" | "assistant"; content: string };

export type LangCode = "en" | "hi" | "mr";

const KEY_ENV: Record<LangCode, string> = {
  en: "AGNES_API_KEY_EN",
  hi: "AGNES_API_KEY_HI",
  mr: "AGNES_API_KEY_MR",
};

/** Each language uses its own key, resolved at call time. Keys never depend on each other. */
export function getApiKey(lang: LangCode): string {
  const name = KEY_ENV[lang];
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `Missing API key for ${lang.toUpperCase()}. Add ${name} in project secrets before generating.`,
    );
  }
  return key;
}

function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?thinking>/gi, "")
    .trim();
}

export async function agnesChat(opts: {
  apiKey: string;
  messages: AgnesMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const response = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AGNES_MODEL,
      messages: opts.messages,
      temperature: opts.temperature ?? 1.0,
      top_p: 0.95,
      max_tokens: opts.maxTokens ?? 8000,
      reasoning_effort: "low",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("Agnes rejected this API key (unauthorized).");
    }
    if (response.status === 429) {
      throw new Error("Agnes rate limit reached for this key. Wait a moment and resume.");
    }
    if (response.status === 402) {
      throw new Error("This Agnes key has no remaining credits.");
    }
    throw new Error(`Agnes request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = stripThinking(data.choices?.[0]?.message?.content ?? "");
  if (!content) throw new Error("Agnes returned an empty response.");
  return content;
}
