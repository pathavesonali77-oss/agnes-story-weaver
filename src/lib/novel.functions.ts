import { createServerFn } from "@tanstack/react-start";

export type LangCode = "en" | "hi" | "mr";

const LANGUAGE_RULES: Record<LangCode, string> = {
  en: "Write the entire novel in natural, literary English.",
  hi: "पूरी रचना शुद्ध, सहज और साहित्यिक हिन्दी (देवनागरी लिपि) में लिखो। अंग्रेज़ी वाक्य कभी मत लिखो; केवल तकनीकी नाम ज़रूरत पड़ने पर देवनागरी में लिप्यंतरित करो।",
  mr: "संपूर्ण कादंबरी शुद्ध, ओघवत्या आणि साहित्यिक मराठीत (देवनागरी लिपी) लिही. इंग्रजी वाक्ये कधीही लिहू नकोस; आवश्यक असल्यास तांत्रिक नावे देवनागरीत लिप्यंतरित कर.",
};

const LANGUAGE_LABEL: Record<LangCode, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

function craftSystemPrompt(lang: LangCode): string {
  return [
    "You are a master novelist adapting a story recap into a full-length, publishable novel.",
    LANGUAGE_RULES[lang],
    "Craft rules you must follow:",
    "- Deep third-person limited narration with scene-by-scene dramatization: dialogue, sensory detail, subtext, silence.",
    "- Never summarize events that deserve a scene. Never narrate like a recap, wiki or synopsis.",
    "- Give the protagonist an inner moral spine: what power costs, who he becomes, what he refuses to lose.",
    "- Secondary characters have their own wants and contradictions; antagonists have reasons, not just menace.",
    "- Braid a thematic meaning through the action (survival vs. humanity, being used vs. choosing loyalty).",
    "- Keep continuity with the recap's names, classes, factions and events; you may invent connective scenes.",
    "- No headings, bullet points, author notes, word counts or meta commentary. Prose and dialogue only.",
  ].join("\n");
}

const parseInput = <T,>(input: T) => input;

/** Step 1 — story bible + episode outline. One call, one key, one language. */
export const generateOutline = createServerFn({ method: "POST" })
  .inputValidator(
    parseInput<{ lang: LangCode; recap: string; episodes: number; title?: string }>,
  )
  .handler(async ({ data }) => {
    const { getApiKey, agnesChat } = await import("./agnes.server");
    const apiKey = getApiKey(data.lang);

    const outline = await agnesChat({
      apiKey,
      maxTokens: 6000,
      messages: [
        { role: "system", content: craftSystemPrompt(data.lang) },
        {
          role: "user",
          content: [
            `Here is a recap of an existing story:\n\n"""\n${data.recap.slice(0, 120000)}\n"""`,
            "",
            `Plan a ${data.episodes}-episode novel based on this recap, written in ${LANGUAGE_LABEL[data.lang]}.`,
            "Deliver, compactly:",
            "1. Novel title and one-line premise.",
            "2. Core theme and the protagonist's inner arc (start state -> end state).",
            "3. Cast list: name, want, wound, function in the plot.",
            "4. An episode-by-episode outline. For each episode: number, title, the 3-5 scenes it dramatizes, the turn at its end, and which thread it advances.",
            `5. The final episode (${data.episodes}) must land a real emotional resolution for the inner arc but leave the outer story OPEN: a deliberate, tantalising open ending — a new threat revealed, a choice not yet made, a door opening. Never write 'The End'.`,
            "This plan is for your own use as the author. Be dense and concrete, no filler.",
          ].join("\n"),
        },
      ],
    });

    return { outline };
  });

/** Step 2 — one half of one episode. Called repeatedly by the client, sequentially per language. */
export const generateEpisodePart = createServerFn({ method: "POST" })
  .inputValidator(
    parseInput<{
      lang: LangCode;
      recap: string;
      outline: string;
      episode: number;
      episodes: number;
      part: 1 | 2;
      wordsPerPart: number;
      previousTail: string;
    }>,
  )
  .handler(async ({ data }) => {
    const { getApiKey, agnesChat } = await import("./agnes.server");
    const apiKey = getApiKey(data.lang);

    const isFinalEpisode = data.episode === data.episodes;
    const instructions: string[] = [
      `You are writing Episode ${data.episode} of ${data.episodes}, part ${data.part} of 2.`,
      `Target length for this part: about ${data.wordsPerPart} words. Write long, full scenes — do not stop early.`,
    ];

    if (data.part === 1) {
      instructions.push(
        `Open the episode with the line "Episode ${data.episode}: <title>" on its own, then begin the prose.`,
        "Open in the middle of a live scene, not with exposition. Dramatize the first half of this episode's outline.",
        "End this part mid-momentum, on a beat that pulls the reader forward.",
      );
    } else {
      instructions.push(
        "Continue seamlessly from where the text below stops — same scene, same breath, no recap, no new episode heading.",
        "Dramatize the remaining scenes of this episode and land the episode's closing turn.",
      );
    }

    if (isFinalEpisode && data.part === 2) {
      instructions.push(
        "This is the end of the novel. Resolve the protagonist's inner arc with real emotional weight, then leave the outer story deliberately OPEN: reveal or imply something larger just beginning. The last paragraph should feel like a held breath, not a full stop. Do not write 'The End' or any closing note.",
      );
    }

    const contextBlocks = [
      `SOURCE RECAP (canon — keep names and events consistent):\n"""\n${data.recap.slice(0, 60000)}\n"""`,
      `YOUR STORY PLAN:\n"""\n${data.outline.slice(0, 30000)}\n"""`,
    ];
    if (data.previousTail.trim()) {
      contextBlocks.push(
        `END OF WHAT YOU HAVE WRITTEN SO FAR (continue from here, never repeat it):\n"""\n${data.previousTail.slice(-6000)}\n"""`,
      );
    }

    const text = await agnesChat({
      apiKey,
      maxTokens: 8000,
      messages: [
        { role: "system", content: craftSystemPrompt(data.lang) },
        { role: "user", content: [...contextBlocks, "", ...instructions].join("\n\n") },
      ],
    });

    return { text };
  });
