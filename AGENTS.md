<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Novel generation calls the Agnes AI API (OpenAI-compatible, `https://apihub.agnes-ai.com/v1`, model `agnes-3.0-flash`) only from `src/lib/agnes.server.ts`, so API keys never reach the browser.
- Each language uses its own key (`AGNES_API_KEY_EN`, `AGNES_API_KEY_HI`, `AGNES_API_KEY_MR`) resolved per request; the three generation runs must stay independent so one key failing cannot stop the others.
- Long novels are produced as one outline call plus two calls per episode, driven sequentially from the client, to stay inside serverless request limits.
