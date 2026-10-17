# Execution intelligence

PlanR watches how the plan is actually going, says what it sees with the real
numbers, and proposes concrete changes. The user decides every one. Nothing
applies itself.

It runs in two layers:

```text
Schedule (IndexedDB)
  │
  ├─ Pattern engine (lib/intelligence/patterns.ts)       deterministic, every device
  │     per-task outcomes, slot reliability, capacity, trend
  │     → insights + suggestions + wins
  │
  ├─ Builder checks (lib/intelligence/builderChecks.ts)  deterministic, every device
  │     hints while writing goals, milestones and tasks
  │
  └─ Progress note (lib/intelligence/progressFacts.ts)
        template writer ............................... every device
        on-device model rewrite + grounding guard ..... desktop, native iOS app
```

**The model never decides anything.** What is slipping, what is going well and
what to change are all settled by arithmetic over dated completion events. The
language model only rewrites the progress note so it reads more naturally, and
its draft is thrown away if it says anything the facts don't.

That split is deliberate:

- Suggestions change someone's schedule, so they must be exact, explainable and
  identical on every device.
- iPhone Safari and the PWA can't load a language model (see "Where the model
  runs"). Because the thinking is deterministic, they still get all of it.
- A 1B-parameter model is good at phrasing and unreliable at counting. Here it
  only has to phrase.

## Pattern engine

`analyzeExecution(schedule)` returns ranked insights. Each detector needs enough
evidence before it says anything, and all thresholds are named constants at the
top of `patterns.ts`.

| Insight | Fires when | Suggestion |
|---|---|---|
| `chronic_miss` | A task finished ≤40% of ≥4 resolved occurrences in 28 days, and missed 2 of its last 3 | See the diagnosis below |
| `stalled_plan` | A running plan had 0 completions in 14 days across ≥4 sessions, while other plans kept moving | **Pause plan** (reversible) |
| `overload` | This week asks for ≥1.5× the median week this person actually completes | Review the heaviest day |
| `weekday_dip` | One weekday finishes ≤45%, at least 25 points below the rest of the week | Review that day |
| `declining` | Completion fell three complete weeks running, by ≥15 points in total | — |
| `momentum` | A run of ≥5, a best week, or a strong time band | — (a win) |

The `chronic_miss` diagnosis picks the most specific explanation:

1. **Misses concentrated on certain weekdays.** Example: Mon 4/4 done, Wed and
   Fri 0/8. The suggestion is to review those days. Moving the whole task would
   punish the days that work, so the user edits the task.
2. **A weak time slot with a strong one free.** The suggestion is to move the
   task there, at the time this person usually starts work they *do* finish in
   that band. Fifteen-minute nudges keep it clear of other tasks on every day it
   runs. If nothing fits, nothing is offered.
3. **A long session, 60 minutes or more.** The suggestion is to shorten it to
   half. A session that gets done beats a longer one that gets skipped.
4. Otherwise, review the task.

### Evidence rules

These are shared with `lib/slotReliability.ts`:

- Only *resolved* occurrences count (done or missed). An unmarked day may just
  be a day the app wasn't opened.
- Today is excluded. Commitments, paused plans and days before tracking began
  are excluded too.
- Time comes from the slot the work was *scheduled into*, never from
  `completedAt`, which records when the box was ticked.

### Suggestion lifecycle (`suggestions.ts`)

- Only `retime`, `shorten` and `pause_plan` apply in one step. All three are
  exact and reversible. No task is ever deleted or removed from a weekday,
  because completion history lives on each weekday copy.
- A suggestion goes stale if the task was edited after it was built. Applying
  it then changes nothing.
- **Not now** hides that insight for the rest of the week.
- **Apply** records the date. The engine then reads that task's outcomes only
  from that date on, so a fixed task isn't flagged again because of misses from
  before the fix.
- Both decisions live in `preferences.acknowledgedAttention`, the synced,
  date-pruned set that Needs Attention already uses. A decision on the phone
  holds on the desktop.
- **Undo** inverts the change itself (`undoSuggestion`). It never restores a
  whole-schedule snapshot, so it can't clobber an unrelated edit.

## Builder checks

`builderChecks.ts` is shown inline by `components/intelligence/BuilderHints.tsx`.
Hints are advisory and never block saving. Each form shows at most two.

- **Goals:** a vague effort instead of a result ("get better at…"), nothing
  measurable, two goals joined with "and", a missing or impossible target date.
- **Milestones:** nothing linked (so progress can't be measured), a vague finish
  line, shorter than 3 days or longer than 90, a duplicate of a sibling, already
  over.
- **Tasks:** checked against the user's own record. Examples: "you finish 24%
  of what you schedule late at night, 82% in the early morning" with a one-tap
  move to a free slot; "your 90-minute sessions get done half as often"; "with
  this, the week asks for 31h, and you typically complete 18h". Near-duplicates
  are flagged too.

## Progress note

`buildProgressFacts` turns the report into a few fact lines plus the suggested
next steps. That is all the model ever sees.

- `templateSummary` writes two or three sentences from those facts. It's
  instant, works everywhere, and is a complete feature on its own.
- `streamProgressSummary` asks the active provider to rewrite the facts. For
  small models, `browserPrompts.ts` swaps in a compact system prompt (140
  tokens max, temperature 0.3).
- `validateSummary` rejects the draft if it contains any number not present in
  the facts, a list or markdown, a greeting or "I…", or a length outside 40–600
  characters. A rejected draft is dropped and the template stays.

`useProgressSummary` rewrites the note automatically only when the model is
already warm (the native host, or weights already loaded in this tab).
Otherwise it offers **Rewrite with AI**. Cold-loading ~850 MB to rephrase three
sentences isn't something to do behind the user's back. A validated note is
cached per device for the day and for the facts it was written from.

## Where the model runs

`lib/ai/deviceCapability.ts` is the single policy:

| Surface | Language model | Why |
|---|---|---|
| Desktop browser, including an installed desktop PWA | ✅ In-page (Transformers.js, WebGPU → WASM) | Plenty of memory |
| Native iOS app (WKWebView host) | ✅ Native system model, via the bridge | The OS manages the model outside the web view |
| iPhone/iPad Safari, home-screen PWA | ❌ | WebKit caps memory per tab. Loading the weights kills the tab, and there's no error to catch |
| Android and other phones/tablets, browser or PWA | ❌ | Same failure, more headroom, still unsafe |
| Desktop reporting `deviceMemory` < 4 GB | ❌ | Not enough room |

The policy is enforced in three places:

1. **The provider.** `BrowserProvider` throws `OnDeviceModelUnavailableError`
   before any download starts. Whatever UI path asks, the weights never load
   where they would crash.
2. **Readiness.** `isAiConfigured()` returns false and `useAIReady()` reports
   `"unsupported"`, which hides AI generation buttons. TaskSheet's subtask
   generator used to skip this check on iOS and could load the model in Safari.
3. **Settings.** On-device AI shows why it's off instead of running a test that
   would load the model.

Remote and LAN providers (OpenAI-compatible, Ollama, MLX) load nothing into the
page, so they stay usable on phones.

## Model choice

The language layer only has to turn about eight fact lines into three
sentences, without inventing numbers. That favours a small, heavily
instruction-tuned model over a bigger one.

- **Desktop: Gemma 3 1B IT** (`onnx-community/gemma-3-1b-it-ONNX-GQA`, q4,
  ~850 MB, the existing default). It is distilled from much larger Gemma models
  and is strong at short, faithful prose for its size. It's already verified
  with this codebase's chat-template handling (Gemma has no system role; see
  `browser.ts`), and it's already cached for existing users. A bigger model
  would cost more download and memory for no gain on three sentences. Below
  ~0.5B, models start to drift from the facts, which the guard catches but
  users would notice as "AI unavailable".
- **Native iOS: Apple's on-device foundation model** (Foundation Models
  framework, iOS 26+, Apple Intelligence devices). It needs no download, the OS
  owns its memory, and it's tuned by Apple for exactly this kind of short,
  instruction-following text. Its context window is 4K tokens, which is why the
  bridge uses the same compact prompts as the browser model.
- **Older iPhones:** host Gemma 3 1B 4-bit with MLX Swift behind the same
  bridge.
- **Mac power users:** the existing MLX / Ollama providers (Qwen3 4B) work
  unchanged and give the strongest output.

Fine-tuning the desktop model on captured interactions is covered in
`docs/fine-tuning.md`. The `summary` action is tagged in captures like every
other action.

## Native iOS bridge

`lib/ai/providers/native.ts` routes on-device requests to the host app when
`window.webkit.messageHandlers.planrAI` exists. The host registers a
`WKScriptMessageHandlerWithReply`, so `postMessage` returns a Promise.

The request has this shape:

```json
{ "v": 1, "type": "generate", "system": "…",
  "messages": [{ "role": "user", "content": "…" }],
  "maxTokens": 140, "temperature": 0.3 }
```

The reply is the generated text as a string. Errors reject the promise with a
message.

A minimal host using the Foundation Models framework:

```swift
import WebKit
import FoundationModels

final class PlanRAIHandler: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any],
              body["type"] as? String == "generate",
              let system = body["system"] as? String,
              let messages = body["messages"] as? [[String: String]] else {
            replyHandler(nil, "Unsupported request")
            return
        }
        guard case .available = SystemLanguageModel.default.availability else {
            replyHandler(nil, "On-device AI isn't available on this device.")
            return
        }
        let prompt = messages.map { $0["content"] ?? "" }.joined(separator: "\n\n")
        let options = GenerationOptions(
            temperature: body["temperature"] as? Double,
            maximumResponseTokens: body["maxTokens"] as? Int)

        Task {
            do {
                let session = LanguageModelSession(instructions: system)
                let response = try await session.respond(to: prompt, options: options)
                replyHandler(response.content, nil)
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }
}

// When building the web view:
let config = WKWebViewConfiguration()
config.userContentController.addScriptMessageHandler(
    PlanRAIHandler(), contentWorld: .page, name: "planrAI")
```

The web build needs no changes for this. The same static export runs in Safari
and inside the host app. Only the host app exposes `planrAI`, so only it gets
the model.
