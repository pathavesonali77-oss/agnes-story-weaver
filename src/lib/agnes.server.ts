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
  const baseTokens = opts.maxTokens ?? 8000;
  let lastReason = "";
  // Empty replies happen when reasoning consumes the token budget or on transient upstream hiccups.
  for (let attempt = 0; attempt < 3; attempt++) {
    const content = await agnesChatOnce({
      ...opts,
      maxTokens: Math.min(baseTokens + attempt * 4000, 16000),
      onEmpty: (reason) => (lastReason = reason),
    });
    if (content) return content;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(
    `Agnes returned an empty response after 3 attempts${lastReason ? ` (${lastReason})` : ""}. Please resume this language.`,
  );
}

async function agnesChatOnce(opts: {
  apiKey: string;
  messages: AgnesMessage[];
  maxTokens: number;
  temperature?: number;
  onEmpty: (reason: string) => void;
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
      max_tokens: opts.maxTokens,
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
    if (response.status >= 500) {
      opts.onEmpty(`server error ${response.status}`);
      return "";
    }
    throw new Error(`Agnes request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  } | null;
  const choice = data?.choices?.[0];
  const content = stripThinking(choice?.message?.content ?? "");
  if (!content) opts.onEmpty(choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : "no content");
  return content;
}
