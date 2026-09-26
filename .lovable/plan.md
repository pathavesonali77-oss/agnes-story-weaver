# Improve novel generation quality

## Findings
- English falls into severe phrase loops, overuses fragments and repeated metaphors, and adds Markdown italics/bold.
- Hindi contains corrupted character runs, broken grammar, mistranslated terms and names, repeated blocks, and mixed English headings.
- Marathi is largely unnatural or nonsensical, repeats dialogue/actions, mistranslates core story terms, and also switches heading language.
- Parts are much longer than requested, which increases degeneration. The continuation context does not clearly separate completed events from the next required scenes.

## Changes
- Strengthen each language's native-writing rules, glossary/name preservation, prose standards, scene progression, and plain-text-only formatting.
- Make the outline machine-readable per episode so each part receives only its assigned scenes and cannot invent or replay later events.
- Add automatic output cleanup for Markdown styling and malformed formatting before text reaches the app or download.
- Add quality checks for repetition loops, corrupted character runs, wrong-script output, premature episode headings, and severe length drift; retry a bad part with corrective instructions instead of accepting it.
- Give each continuation a compact continuity record and recent prose only, reducing repetition while keeping character and plot facts stable.
- Keep English, Hindi, and Marathi runs fully independent, including retries and failures.

## Verification
- Add focused tests for formatting cleanup and quality rejection.
- Check the preview build and run a small mocked generation flow to verify retries, clean plain text, and independent language progress.
