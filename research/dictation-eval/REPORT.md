# Dialogue quotes from Whisper itself

Can dictation put spoken dialogue in quotation marks without a separate language model, and without changing the writer's words?

**Yes, mostly, at no extra cost.** Whisper writes in whatever style its prompt shows. Put an example of quoted dialogue in the prompt and it quotes dialogue it hears. Leave the example out and it almost never does. The same pass that writes down the words places the quotes, so nothing runs afterwards that could rewrite the text.

Tested 2026-10-27 on an M1 Max with the two models dictation offers (`electron/dictation/catalog.js`).

## Method

`cases.json` has 45 short dictated lines: 28 with dialogue (tag after, tag before, interrupted, several sentences, questions, exclamations, dialogue mixed with narration), 15 with none (narration, reported speech, first person, and narration that follows an action, which looks like dialogue), and 2 ambiguous action beats that aren't scored. `run.mjs` speaks each one with macOS `say` in three voices (system, Daniel UK, Flo US), so there are 135 clips, and transcribes every clip with three prompts. All three prompts start with story-bible names, the way the app does:

| prompt | after the names |
|---|---|
| `plain` | nothing (what the app sends today) |
| `dialogue` | `"I'm tired," Sam said. "Me too," she replied. He said, "Let's rest."` |
| `pronouns` | `"I'm tired," she said. "Me too," he replied. He said, "Let's rest."` |

Each dialogue clip falls into exactly one bucket. **Right**: the words and the quotes are both right. **Misheard**: quoted, but a word is wrong, so the quotes can't be judged (this happens without the prompt too). **Left plain**: no quotes at all, which is safe but no help. **Misquoted**: the right words with quotes in the wrong place, which is the failure that matters.

## Results

Standard (large-v3-turbo, q5_0):

| prompt | dialogue right | misheard | left plain | misquoted | non-dialogue wrongly quoted | clips with any wrong word |
|---|---|---|---|---|---|---|
| plain | 1 / 84 | 2 | 81 | 0 | 0 / 45 | 27 / 135 |
| dialogue | 62 / 84 | 17 | 4 | 1 | 2 / 45 | 20 / 135 |
| **pronouns** | **66 / 84** | 13 | 4 | 1 | 2 / 45 | **16 / 135** |

Light (small.en, q5_1):

| prompt | dialogue right | misheard | left plain | misquoted | non-dialogue wrongly quoted | clips with any wrong word |
|---|---|---|---|---|---|---|
| plain | 23 / 84 | 13 | 47 | 1 | 0 / 45 | 39 / 135 |
| dialogue | 57 / 84 | 19 | 7 | 1 | 3 / 45 | 31 / 135 |
| **pronouns** | **60 / 84** | 18 | 5 | 1 | 3 / 45 | **30 / 135** |

## Does the prompt change words?

Only the way Whisper's hearing always varies, and mostly for the better. Comparing each clip's words under the `pronouns` prompt with the same clip under `plain`:

- Standard: 12 clips heard more accurately ("Jon" → "John", "cringe" → "grinned", "whispers" → "whispered"), 1 less accurately ("Run!" → "Ruzz" in one synthetic voice).
- Light: 9 more accurately ("dear leech" → "you're late", "litter" → "letter"), none less accurately, 3 wrong both ways.

**The names in the example leak.** With the `dialogue` prompt, Light heard "Tom said" as "Sam said", after the example's Sam. The `pronouns` prompt has no names and nothing leaked. Any example must not contain names.

## Where it goes wrong

- **Narration after an action.** "Brannoc grinned. It wasn't bad for an old man." got its second sentence quoted (2 of 3 voices on Standard). That's genuinely ambiguous: it could be speech or narration. "She shook her head. She couldn't do this anymore." and the first-person version were left alone.
- **A quote split in two.** "Don't move. Don't even breathe, Mara said." became `"Don't move." "Don't even breathe," Mara said.`
- **Narration pulled into the quote.** "You're late, Aelwyn said, not looking up from the map." once became `"You're late," Elwyn said, "Not looking up from the map."`
- **Interrupted lines** ("Maybe, she said, we could…") were sometimes left plain.
- **Spoken commands on Light.** With the dialogue prompt, Light sometimes put the command words in quotes: `"Open quotes, are you coming?" "Close quotes," she asked.` and `She left the room. "New paragraph. Morning came slowly."` The formatter would need to drop quote marks Whisper wraps around a command. On Standard, commands worked the same with or without the prompt (17 of 18 lines both ways, `commands.mjs`).

## Caveats

- The voices are synthetic, the audio is clean, and each clip is one utterance. Real voices change pitch for dialogue, which may make quoting easier. Accents and room noise will cause more mishearing.
- In the app, audio is cut at pauses of a second or more. If a writer pauses between the speech and its tag ("Let's go." … "John said."), Whisper hears two separate stretches and can't quote the first one. The previous text goes into the next prompt, but quotes can't be added to text that's already written down. A small rule could join a stretch that's only a tag ("John said.") with the one before it.
- English only.

## In the app

Settings → Dictation → **Put dialogue in quotation marks**, on by default (`prefs.dictationDialogue`). It uses the `pronouns` example (`DIALOGUE_EXAMPLE` in `src/lib/dictationText.js`): names first, then the example, then the text heard so far. Each stretch Whisper writes then goes through two steps:

- `tidyHeard`: a stretch with a spoken "open quote" or "close quote" drops Whisper's own quote marks, because the writer is placing them. Quotes Whisper opens on a spoken break ("New paragraph. Morning came.") are dropped too. This fixes the Light failures above. `commands.mjs` now runs through it: Standard 18/18 with dialogue on and off, Light 15/18 on and 14/18 off, and every Light miss there is a misheard word ("Jon", "seed break").
- `joinHeard`: when a stretch is only a tag ("John said.", "she replied quietly.", "said the old man.") because the writer paused before it, the sentence before it becomes the dialogue. The verbs are a strict list. "Mara laughed.", "Nobody answered." and "I said nothing." are left alone.

With the setting off, there's no example in the prompt and no tag joining. Whisper's own quotes are kept: Light sometimes turns a spoken "open quote" straight into the mark and drops the words, so removing its marks would lose quotes the writer asked for.

Files: `cases.json`, `run.mjs` (writes `results-<model>.json`), `commands.mjs`.

```bash
DICTATION_MODELS_DIR=/path/to/models node research/dictation-eval/run.mjs
```
