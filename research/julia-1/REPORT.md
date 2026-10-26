# Julia-1 evaluation for Draftwell entity features (2026-10-04)

Model: [SupersonicLabs/Julia-1](https://huggingface.co/SupersonicLabs/Julia-1), 144M params, FP32 (550 MB), CPU on Apple Silicon.
Setup verified: the official typed-decisions reproduction matches the model card exactly (426/600 choice, 542/800 score, 483/600 noul).

**Verdict: not usable for Draftwell's entity tasks.** It handles topic-style routing, but it does not read prose closely enough to tell a name from a word, resolve aliases, identify relationships, or attribute dialogue. Every task below scored at or near chance, in every prompt format tried.

| Task | Cases | Julia-1 (best format) | Chance / baseline |
| --- | ---: | ---: | ---: |
| Is "May"/"Will"/"Hope"… the codex entity? | 79 | 43–54% | 56% (always "not entity"); simple rules **78%** |
| Who does "Nell" / "the surgeon" / "he" refer to? | 21 | 33–43% | ~13% (8 options) |
| Are X and Y the same person? (yes/no) | 12 | 42–67% | 50% |
| Relationship type (11 options) | 25 | 12–20% | 9% |
| Relationship yes/no statements | 20 | 45% | 50% |
| Who is the parent / boss? | 8 | 50% | 50% |
| Who speaks this line? | 12 | 17–42% | ~40% |
| Present in scene vs only mentioned | 9 | 44–56% | 50% |
| Topic of a paragraph (sanity check) | 3 | 3/3 | — |
| Scene mood (sanity check) | 4 | 3/4 | — |

Failure pattern:
- Disambiguation: picks "the character" for nearly every occurrence, with ~1.00 confidence, including lowercase "she may not come back".
- Yes/no: says "true" to anything on-topic, including contradictions ("Tom is Margaret's son" → "Margaret is Tom's daughter": 1.00; invoice 500 vs PO 900 → "totals match": 0.98).
- Confidence is uninformative: 99% of disambiguation answers had confidence ≥0.8, at 44% accuracy.
- Not a prompt-format issue: plain prose, codex notes, bracketed targets, JSON states shaped like its training data, sentence-style options, statement-style Boolean questions, and reversed option orders all landed near chance. Results are identical with the runtime's `marker_only_head` flag on and off.

Speed was fine: ~30 ms per question (single), ~10 ms batched, ~96 ms with a 424-token paragraph.

## Follow-up: small local LLMs (Qwen 3.5, via Ollama)

Same test cases. Each question is asked as lettered options; the answer is the first token's probability spread over the letters (one decode step, no free text). "Examples" = 2–4 worked examples per question type, using names and sentences that are not in the tests (`llm_fewshot.py`).

| Task | 0.8B | 0.8B + examples | 2B | 2B + examples | 4B | 4B + examples | Qwen 3.8 27B | Julia-1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Names: is it the character? | 77% | 80% | 84% | 87% | 96% | 95% | 95% | 46% |
| Who does the mention refer to? (codex with aliases) | 86% | 71% | 81% | 86% | 90% | **100%** | 95% | 33% |
| Same person? | 83% | 83% | 83% | 67% | 100% | 92% | 100% | 42% |
| Relationship type (11 options) | 44% | 40% | 56% | 84% | 92% | **100%** | 96% | 20% |
| Same, options reversed | 28% | 52% | 80% | 76% | 88% | **100%** | 96% | 16% |
| Who is the parent / boss? | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 50% |
| Who speaks this line? | 75% | 50% | 75% | 67% | 100% | 100% | 100% | 17% |
| Present vs only mentioned | 44% | **100%** | 56% | **100%** | 89% | **100%** | 100% | 56% |
| Median ms per question (M1 Max) | 285 | 347 | 309 | 494 | 475 | 972 | 1827 | 30 |

Tested quantization: 0.8B and 2B at Q8_0, 4B and 27B at Q4_K_M. Text-only GGUF sizes for shipping: 4B Q4_K_M 2.74 GB (IQ4_XS 2.48 GB, Q3_K_M 2.29 GB); 2B Q4_K_M 1.28 GB (not yet tested at Q4).

Findings:
- 4B is close to the 27B model on everything, and with examples it gets every relationship, alias, dialogue and presence question right.
- Its confidence is usable: on names, answers at ≥90% confidence were right 73/75 times. Auto-apply above a threshold and ask the writer below it.
- For names, the plain sentence works best. Bracketing the word or adding a "May is a character" note pushes every size toward "character" (4B: 96% plain, 92% bracketed, 81% bracketed + note). Hand-written rules add nothing once the model is 4B.
- Worked examples matter most for small models on "present vs mentioned" (0.8B and 2B: under 60% → 100%) and relationships (2B: 56% → 84%). They roughly double prompt length, so latency rises unless the example prefix is cached (batch questions by type).
- Caveat: about 190 short, hand-written cases. Real manuscripts have longer passages and messier ambiguity.

## Files
- `cases.py`: all test cases (original passages, gold labels written before running).
- `eval.py` → `results.json`; `score.py` prints the breakdown and every miss.
- `sweep.py`: JSON-format variants. `sanity.py`: trivial yes/no, topic and mood checks.
- `llm.py` (Ollama backend), `llm_fewshot.py` (worked examples), `names_variants.py` (bracketed names, no note).
  Run: `BACKEND=llm MODEL=qwen3.5:4b .venv/bin/python eval.py` (or `BACKEND=llm-fewshot`), then `compare.py` for the table.
- Model weights: `../../models/julia-1` (gitignored). Python env: `.venv` (gitignored).

The harness can be pointed at another backend (an entity tagger, an entailment checker, or a small local LLM) by swapping the `choice`/`noul` functions.
