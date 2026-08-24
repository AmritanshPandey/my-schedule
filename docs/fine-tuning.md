# Fine-tuning PlanR's Browser AI model

PlanR's default AI provider ("Browser AI", `lib/ai/providers/browser.ts`) runs
a small instruction-tuned model entirely on-device via
[Transformers.js](https://huggingface.co/docs/transformers.js) — no server,
no API key. The current default is
[`onnx-community/gemma-3-1b-it-ONNX-GQA`](https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX-GQA)
(`lib/ai/config.ts`'s `DEFAULT_BROWSER_CONFIG.model`), a ~1B-parameter model
that's already been hand-tuned at the *prompt* level for PlanR's JSON
schemas (`lib/ai/providers/browserPrompts.ts` — see that file's header for
why small models need compact, few-shot-guided prompts rather than the
verbose prompts the bigger MLX/Ollama/API providers use).

This document covers the next step: actually fine-tuning the model's
*weights* on real PlanR-shaped data, rather than only steering it with
prompts. The GPU training step has to happen outside this repo — there's no
GPU here, and no Python/ML tooling at all. What's in the repo is the tooling
that makes that external step possible and verifiable:

- **Capture** real Browser AI interactions on-device (opt-in, Settings → AI
  → Training data)
- **Build** a training dataset from captures + the curated example bank
  (`scripts/build-finetune-dataset.mjs`)
- **Fine-tune** externally (this doc, manual)
- **Evaluate** the result against PlanR's own validation pipeline before
  shipping it (`scripts/eval-finetune.mjs`)

## 1. Capture training examples from real usage

Settings → AI → Training data → toggle on. From then on, every Browser AI
generation is recorded on-device (`lib/ai/capture.ts`): the exact compact
prompt the model was actually served (post-`rewriteForBrowserModel`, so
train/inference prompt parity is guaranteed) and its response. Nothing
leaves the device until you export it — this mirrors the app's local-first
stance generally.

Use the app normally for a while — create plans, generate tasks, ask the AI
Assistant things. When you have enough, go back to Settings → AI → Training
data and **Download** (or **Copy**) as `.jsonl`.

Turn the toggle back off when you're done; it's opt-in and off by default on
purpose (see `lib/ai/capture.ts`'s header comment) — a capture log is
verbatim raw prompts and responses.

## 2. Build the dataset

```bash
npm run build-finetune-dataset -- path/to/exported-captures.jsonl
```

This merges your captures with the **full** example bank in
`lib/ai/examples.json` (not just the one example per category shown live —
that file's own header comment calls this out as the "future
diversification pass" it was left with extra material for), run through the
real live prompt-builders in `browserPrompts.ts` so the dataset can never
drift from what the app actually serves. Output:
`training-data/finetune-dataset.jsonl` (gitignored — never commit this,
it may contain real captured usage).

Zero args still works, sourcing purely from `examples.json` — useful as a
baseline dataset even before you've captured anything.

Each line is:

```jsonc
{
  "action": "tasks",          // "tasks" | "subtasks" | "milestones" | "milestone_tasks"
                               // | "insight" | "chat" | "create_plan" | "add_task"
                               // | "add_tracker" | "suggest_milestones" | "create_ritual"
  "systemPrompt": "...",      // exactly what the model saw as system context
  "messages": [{ "role": "user", "content": "..." }],
  "response": "..."           // the target output — ground truth or a captured reply
}
```

## 3. Fine-tune (external — not part of this repo)

The base checkpoint behind the app's current ONNX build is
[`google/gemma-3-1b-it`](https://huggingface.co/google/gemma-3-1b-it). A
LoRA fine-tune (cheap enough to run for free on Colab) is the right scale
for this — you're steering an already-capable instruct model onto a narrow
output format, not teaching it new knowledge.

1. **[Unsloth](https://github.com/unslothai/unsloth)** is the easiest path —
   it ships a ready-made Gemma 3 Colab notebook with LoRA + 4-bit training
   built in. Point it at `training-data/finetune-dataset.jsonl`, formatting
   each record as a `user`/`model` turn pair (fold `systemPrompt` into the
   first user turn — see the note on Gemma's chat template below).
2. Train a few epochs, watching for overfitting — the dataset above is
   small. A held-out slice of your own captures (excluded from training)
   is what step 5 grades against.
3. Merge the LoRA adapter into the base weights (`merge_and_unload()` in
   PEFT, or Unsloth's own merge helper).

**Gemma chat-template note:** Gemma's chat template only recognizes
`user`/`model` turns — an unsupported `system` turn is silently *dropped*,
not an error (`lib/ai/providers/browser.ts`'s `foldSystemIntoFirstUserTurn`
works around this at inference time for the same reason). Fold
`systemPrompt` into the first user turn the same way when formatting
training examples, or the model never actually sees your schema
instructions during training.

## 4. Export to ONNX and upload

```bash
optimum-cli export onnx --model ./merged-model --task text-generation ./onnx-out
```

Then quantize to `q4` — matching `dtypeFor()` in `lib/ai/providers/browser.ts`,
which is the conservative default every model gets unless it's been
individually verified safe under `q4f16` and added to that file's
`FP16_SAFE_MODELS` set (out of scope for this doc; a model swap doesn't
need that to work, just to be maximally small on WebGPU).

Upload the ONNX build to a public Hugging Face repo:

```bash
huggingface-cli upload your-username/planr-gemma-3-1b-ft ./onnx-out
```

(Publishing a model repo on Hugging Face is free.)

## 5. Evaluate before shipping it

Run your candidate model over a held-out set of prompts (however your
external tooling does inference), write the outputs as `{action,
response}` JSONL (same shape as a capture export), then:

```bash
npm run eval-finetune -- candidate-outputs.jsonl
```

This grades every output through the app's own, already-tested validation
pipeline — `parseGeneratedTasks`/`parseGeneratedSubtasks`/
`parseGeneratedMilestones`/`parseAIAction` (parse success/failure, the same
signal the live app uses to detect "not valid JSON"), then
`validateTaskShapes` (schema) and `runBusinessRules` (semantic checks) for
task-shaped output. Each record comes back **pass**, **warning** (parsed,
but flagged), or **fail** (didn't parse at all). Exit code `1` only if a
whole category has a 0% pass rate — compare against a baseline run of the
*current* shipped model on the same held-out prompts before deciding the
fine-tune is actually an improvement.

## 6. Ship it

Settings → AI → Browser AI → Model field → paste your new repo id
(`your-username/planr-gemma-3-1b-ft`). No code changes needed —
`AIProviderConfig.model` already accepts any Hugging Face repo id; this is
exactly how switching from Qwen2.5-0.5B to Gemma 3 1B happened for the
built-in default.
