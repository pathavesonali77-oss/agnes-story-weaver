import { createServerFn } from "@tanstack/react-start";

import {
  cleanNovelText,
  extractEpisodePlan,
  findNovelQualityProblems,
} from "./novel-quality";

export type LangCode = "en" | "hi" | "mr";

const LANGUAGE_RULES: Record<LangCode, string> = {
  en: "Write idiomatic, polished literary English. Prefer precise, varied sentences over ornamental repetition.",
  hi: "किसी अनुवाद की तरह नहीं, एक कुशल हिन्दी उपन्यासकार की तरह स्वाभाविक, व्याकरणसम्मत और साहित्यिक हिन्दी में लिखो। केवल देवनागरी प्रयोग करो। पात्रों के नामों का एक ही सुसंगत लिप्यंतरण रखो। अंग्रेज़ी शीर्षक या वाक्य मत लिखो। कृत्रिम संयुक्त शब्द, शब्दशः अनुवाद और निरर्थक उपमाएँ मत गढ़ो।",
  mr: "अनुवादासारखे नव्हे, तर कुशल मराठी कादंबरीकाराप्रमाणे नैसर्गिक, व्याकरणशुद्ध आणि प्रवाही मराठीत लिही. फक्त देवनागरी वापर. पात्रांच्या नावांचे एकच सुसंगत लिप्यंतर ठेव. इंग्रजी शीर्षके किंवा वाक्ये लिहू नको. हिंदीसदृश वाक्यरचना, शब्दशः भाषांतर, कृत्रिम जोडशब्द आणि निरर्थक उपमा टाळ.",
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
    "- Never rename, merge, gender-swap or invent relationships for characters. Preserve the recap's facts and event order.",
    "- Every paragraph must advance action, character, tension or setting. Never loop a phrase, image, thought, sentence, exchange or event.",
    "- Use restrained imagery. Do not stack metaphors, explain a metaphor, or repeat a thematic keyword for emphasis.",
    "- Plain text only: never use Markdown, asterisks, underscores, hashes, bold, italics, bullet points, author notes or word-count notes.",
    "- System notifications may be plain standalone lines, without decorative symbols or Markdown.",
  ].join("\n");
}

const HEADING_RULE: Record<LangCode, string> = {
  en: 'Use exactly "Episode N: Title" for the episode heading.',
  hi: 'एपिसोड का शीर्षक ठीक "एपिसोड N: शीर्षक" के रूप में लिखो।',
  mr: 'भागाचे शीर्षक नेमके "एपिसोड N: शीर्षक" या स्वरूपात लिही.',
};

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
            "4. An episode-by-episode outline using these exact machine-readable delimiters:",
            "EPISODE 1",
            "TITLE: ...",
            "PART 1 SCENES: 2-3 concrete scene beats",
            "PART 2 SCENES: 2-3 different concrete scene beats",
            "ENDING TURN: ...",
            "Repeat that exact block structure for every episode. Never place an episode's event in another episode.",
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
    const episodePlan = extractEpisodePlan(data.outline, data.episode);
    const instructions: string[] = [
      `You are writing Episode ${data.episode} of ${data.episodes}, part ${data.part} of 2.`,
      `Write ${Math.round(data.wordsPerPart * 0.8)}-${Math.round(data.wordsPerPart * 1.1)} words. Never exceed that range to compensate for earlier parts.`,
      `Dramatize ONLY the PART ${data.part} SCENES in the current episode plan. Do not replay completed events or borrow scenes from another episode.`,
      "Move forward continuously. Each physical action happens once unless the plan explicitly calls for its later repetition.",
      "Use complete, varied paragraphs. Avoid rhetorical fragments, chained 'and' clauses, repeated sentence openings and recurring decorative imagery.",
      "Return only finished plain-text novel prose. Do not discuss these instructions.",
    ];

    if (data.part === 1) {
      instructions.push(
        HEADING_RULE[data.lang],
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
      `CURRENT EPISODE PLAN — this is the only outline section you may dramatize now:\n"""\n${episodePlan}\n"""`,
    ];
    if (data.previousTail.trim()) {
      contextBlocks.push(
        `END OF WHAT YOU HAVE WRITTEN SO FAR (continue from here, never repeat it):\n"""\n${data.previousTail.slice(-6000)}\n"""`,
      );
    }

    const requestText = [...contextBlocks, "", ...instructions].join("\n\n");
    const createDraft = (correction?: string) =>
      agnesChat({
        apiKey,
        maxTokens: 8000,
        temperature: correction ? 0.65 : 0.8,
        messages: [
          { role: "system", content: craftSystemPrompt(data.lang) },
          {
            role: "user",
            content: correction
              ? `${requestText}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED because it contained: ${correction}. Rewrite the entire part from scratch. Do not copy any sentence from the rejected attempt.`
              : requestText,
          },
        ],
      });

    let text = cleanNovelText(await createDraft());
    let problems = findNovelQualityProblems(text, data.lang, data.wordsPerPart, data.part === 1);
    if (problems.length) {
      text = cleanNovelText(await createDraft(problems.join(", ")));
      problems = findNovelQualityProblems(text, data.lang, data.wordsPerPart, data.part === 1);
    }
    if (problems.length) {
      throw new Error(`The writing quality check rejected this part: ${problems.join(", ")}. Please retry this language.`);
    }

    return { text };
  });
