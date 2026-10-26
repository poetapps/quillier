# Smart features: accuracy and speed of the shipped runtime (2026-10-04, M1 Max, 64 GB)

This measures exactly what the app runs: the three GGUF files the app downloads (`electron/smart/catalog.js`), the app's prompt builders (`electron/smart/prompts.js`) and its node-llama-cpp 3.22.1 engine (`electron/smart/engine.mjs`, the code the utilityProcess worker runs). The test cases are the research set from `research/julia-1/cases.py` (191 questions). Each question is scored with the same rule as `research/julia-1/score.py`.

## Accuracy

"App" is the shipped file. "Ollama" is the earlier research run (`research/julia-1/results-*-fewshot.json`). "Ollama GGUF, app runtime" runs Ollama's own model files through the app's prompts and engine. It's a control, explained below.

| Task | Cases | 0.8B Q8_0 (app) | 0.8B Ollama | 2B Q4_K_M (app) | 2B Ollama (Q8_0) | 2B Ollama GGUF, app runtime | 4B Q4_K_M (app) | 4B Ollama (Q4_K_M) | 4B Ollama GGUF, app runtime |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Names: is it the character? | 79 | 80% | 80% | 87% | 87% | 87% | 94% | 95% | 95% |
| Who does the mention refer to? (codex with aliases) | 21 | 71% | 71% | 81% | 86% | 86% | 100% | 100% | 100% |
| Same person? | 12 | 83% | 83% | 67% | 67% | 67% | 83% | 92% | 92% |
| Relationship type (11 options) | 25 | 40% | 40% | 84% | 84% | 84% | 96% | 100% | 100% |
| Same, options reversed | 25 | 52% | 52% | 68% | 76% | 76% | 96% | 100% | 100% |
| Who is the parent / boss? | 8 | 100% | 100% | 88% | 100% | 100% | 100% | 100% | 100% |
| Who speaks this line? | 12 | 50% | 50% | 67% | 67% | 67% | 92% | 100% | 100% |
| Present vs only mentioned | 9 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

Mean log-loss on the right answer, over all 191 questions (lower is better): 0.8B 0.914. 2B app 0.518 vs Ollama's file 0.503. 4B app 0.138 vs Ollama's file 0.125.

### Drops of more than 5 points, and what caused them

| Model | Task | Ollama | App | Cases |
|---|---|---:|---:|---:|
| 2B | Relationship, options reversed | 76% | 68% | −2 |
| 2B | Who is the parent / boss? | 100% | 88% | −1 |
| 4B | Same person? | 92% | 83% | −1 |
| 4B | Who speaks this line? | 100% | 92% | −1 |

**The prompts and the chat template are not the cause.** The evidence:

- **Byte-identical prompts.** All 191 chats the app builds are identical to the ones `eval.py` + `llm_fewshot.py` sent to Ollama. `dump_reference_prompts.py` records the research chats without calling Ollama, and `run_eval.mjs` checks every app prompt against them.
- **Same template.** The rendered prompt follows the GGUF's own Qwen 3.5 template with `enable_thinking=false`, and Ollama's `qwen3.5` renderer for `think:false` produces the same string. Every turn is `<|im_start|>role\n…<|im_end|>\n`. Earlier assistant turns are rendered as a bare letter with no think block. The prompt ends with `<|im_start|>assistant\n<think>\n\n</think>\n\n`. There is no BOS token.
- **Tokens match.** The app's token sequence (cached prefix plus per-question tail) equals a single full-string tokenization in 191/191 prompts.
- **The first token is the answer.** The first generated token is an option letter in 191/191 questions for every model. The probability on the option letters is at least 0.95 for 0.8B and at least 0.99 for 2B and 4B.
- **Same probabilities as Ollama.** Run on Ollama's own GGUF files (the control columns), the app's engine reproduces Ollama's per-task numbers exactly for 2B and 4B. Per-question probabilities on names, presence and same-person agree with Ollama's to within 0.004 (median difference 0.0001). The 0.8B file is the same Q8_0 quant in both, and it matches Ollama too: max difference 0.002, identical scores.

**The quantized weights are the cause.** For 2B, the app ships unsloth Q4_K_M (1.28 GB), where the research used Q8_0 (2.01 GB). For 4B, both are Q4_K_M but from different quantizers (unsloth 2.74 GB, Ollama 2.65 GB). Every case the app got wrong and Ollama got right was already borderline in the Ollama run (Ollama confidence 0.38 to 0.83, except one names case at 0.98: "Reading was her only escape from that house"). One 2B case went the other way (Ollama wrong, app right). The continuous log-loss gap is small (0.138 vs 0.125 for 4B). With 8 to 25 cases per task, one flip moves a row by 4 to 12 points, so these drops are within noise for this test set. If the 2B rows matter, unsloth's 2B Q8_0 (2,012,012,800 bytes) would very likely reproduce Ollama's 2B numbers, at +0.73 GB. I did not test that file.

## Speed and memory (M1 Max, Metal)

| Model | File | Load (warm) | Median ms/question, batched by task | Mean ms/question incl. prefix, batched | Median ms, each prompt from scratch | Batched speed-up (wall, whole test set) | Peak RSS of the inference process |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0.8B Q8_0 | 0.81 GB | 1.9 s | 35 | 44 | 129 | 3.4× | 1.6 GB |
| 2B Q4_K_M | 1.28 GB | 1.9 s | 74 | 94 | 290 | 3.6× | 2.0 GB |
| 4B Q4_K_M | 2.74 GB | 2.0 s | 155 | 217 | 682 | 3.7× | 3.4 GB |

For comparison, the Ollama research run took 347, 494 and 972 ms per question (few-shot, nothing cached).

- **Batching.** Questions in one `smart:ask` are grouped by task. Each task's shared prefix (system prompt plus worked examples, 200–700 tokens) is evaluated once and checkpointed, and every question then evaluates only its own tail (60–180 tokens). For `resolve`, the cast list also joins the cached prefix, which cut the tail from 282 to 108 tokens with 7 characters. Qwen 3.5 is a hybrid recurrent/attention model, so the KV cache can't simply be truncated. node-llama-cpp's sequence checkpoints (`takeCheckpoint`, restored automatically by `eraseContextTokenRanges`) make the reuse possible. A restore costs about 2 ms (20 MB of state for 0.8B and 2B, 53 MB for 4B). Batched and from-scratch answers are bit-identical (max probability difference 0).
- **Across calls.** The last task's prefix stays loaded between calls. Switching tasks costs one prefix evaluation: about 0.3–1.0 s on 4B, 0.1–0.25 s on 0.8B.
- **Parallel sequences don't help.** Four sequences evaluated in one batch took exactly 4× as long as one, because prompt processing is already compute-bound (about 700 tokens/s for 4B). The engine uses one sequence.
- **Memory.** Peak RSS was 1.6 GB, 2.0 GB and 3.4 GB. Metal allocations were 1.1, 1.6 and 3.2 GB. The context is 4096 tokens. The worker runs in its own process, so unloading (after 3 minutes idle, or on `smart:unload`) returns all of it. A context batch size of 256 instead of 512 saves about 250 MB of GPU memory with no measurable slowdown.
- **Slow first load.** The first model load by a newly installed binary took 25–26 s every time it was observed (dev Electron, packaged arm64 app, packaged universal app). macOS compiles llama.cpp's Metal kernels once and caches them. Later loads take about 2 s. The UI should show a "getting ready" state for the first question after install or update.
- **Electron end to end.** `selftest.js` spawns the utilityProcess, loads 2B and answers 7 questions from 7 different tasks in 4.3 s. Most of that is the 2.2 s load plus one prefix per task. Two more questions on the warm model took 164 ms on 0.8B.

## Packaging (electron-builder 26.15.3)

- **Packaged arm64 app: verified.** `npx electron-builder --mac --arm64 --dir -c.extraMetadata.main=electron/smart/selftest.js` built the app with the selftest as its entry point. The worker ran from inside `app.asar` and loaded the unpacked Metal binary, giving the same answers as the dev run. The app is 316 MB. node-llama-cpp adds about 15 MB to `app.asar` and 15 MB unpacked. The 34 MB llama.cpp source bundle is excluded.
- **Universal mac app: verified, with one CI step.** The build succeeded, and the selftest passed on the arm64 slice (Metal) and on the x64 slice under Rosetta (CPU, same answers to about 0.003). This needs two things:
  - `mac.x64ArchFiles` in `package.json`, which is now set. The single-arch llama binaries are identical in both slices, and @electron/universal would otherwise reject them.
  - The x64 binary package must be in `node_modules` when building on the arm64 runner. npm skips it there because its `cpu` is `x64`.
  Without the CI step, the build still succeeds, but Intel Macs report `supported: false`. The universal app is 566 MB.
- **Windows and Linux: not built or tested here.** The CUDA binary packages (176 MB plus 368 MB) are excluded through `files`. The CPU and Vulkan packages (31 MB plus 74 MB) are kept.

## Files

- `export_cases.py` exports `cases.py` to `cases.json`.
- `dump_reference_prompts.py` writes `reference_prompts.json`, the research harness's chats, for the prompt check. It is gitignored and regenerated on demand.
- `items.mjs` turns the cases into API items with gold answers and scoring rules.
- `run_eval.mjs` runs everything and writes `results-<model>.json`. `SMART_MODELS_DIR` and `SMART_RESULTS_TAG` run other GGUF files under the catalog names.
- `score.mjs` prints these tables and writes `src/lib/smartAccuracy.json`.
- `compare_cases.mjs <model>` lists the cases that differ from the Ollama run.
- `probe.mjs` prints the exact prompt for one question and checks tokenization.
- `download_test.js` tests the downloader: cancel, resume and sha256.

To reproduce, with the three GGUFs in `models/smart/` (gitignored):

```bash
python3 research/smart-eval/export_cases.py && python3 research/smart-eval/dump_reference_prompts.py
node research/smart-eval/run_eval.mjs
node research/smart-eval/score.mjs
npx electron electron/smart/selftest.js     # utilityProcess end-to-end
```

Caveat, same as the research: about 190 short, hand-written cases. Real manuscripts have longer passages and messier ambiguity.
