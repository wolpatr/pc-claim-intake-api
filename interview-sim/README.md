# Interview simulator

A local, single-page interview preparation system for Java practice.
Every round keeps the same five-phase shape with manual advance, but the labels and scoring adapt to the round type:

- **coding** - brief and clarify, implement from starter code, run hidden tests, absorb a change request, then debrief. This is the version 1 round.
- **debugging** - brief and reproduce, diagnose the defect, fix and verify against failing tests, harden with a second change, then debrief. A root-cause note is scored separately from the fix.
- **design** - brief and clarify, write object-oriented design notes or a class sketch, review the sketch, answer a constraint change, then debrief against a reference design. Java execution is not required; whether the class sketch compiles is reported as informational and does not affect the score.

Every scenario declares a `roundType`; version 1 scenarios that omit it default to `coding`.
The interviewer is a scripted scenario spine with an optional AI layer.
Without an API key everything still works offline.
The exam is a separate timed multiple-choice mode built from the repository question bank; it needs neither a JDK nor AI.

## Requirements

- Node.js 24 (the code uses only the standard library; there are no npm dependencies).
- A JDK 17 or newer for coding and debugging rounds. The simulator compiles with `javac --release 17`. Design rounds run without a JDK; a detected JDK only enables the optional sketch-compile check, whose result is informational.

## Start

From the repository root:

```bash
node interview-sim/server.mjs
```

Open http://127.0.0.1:4321. The server binds to `127.0.0.1` only. Set `INTERVIEW_SIM_PORT` to change the port.

There is no build step, no bundler, and no CDN asset.

## JDK detection

Detection runs in this order:

1. `JAVA_HOME`, using `<JAVA_HOME>/bin/javac`.
2. `javac` on `PATH`.
3. Known IDE-bundled runtimes, including:
   - `C:\Program Files\Android\Android Studio\jbr`
   - JetBrains `jbr` directories under `Program Files\JetBrains`, `%LOCALAPPDATA%\JetBrains`, and the Toolbox apps directory
   - Eclipse Adoptium installations under `Program Files`, `Program Files (x86)`, and `%LOCALAPPDATA%\Programs`, and Java installations under `Program Files` and `%LOCALAPPDATA%\Programs`

The detected version is printed in the top bar. If no JDK is found, the setup screen shows install instructions; coding and debugging rounds cannot start until one is installed, while design rounds can still run. The simulator never installs software.

Exact install instructions:

1. Install Eclipse Temurin 17 (LTS) or 21 (LTS): https://adoptium.net/temurin/releases/
2. Or on Windows: `winget install --id EclipseAdoptium.Temurin.21.JDK -e`
3. Set `JAVA_HOME` to the installed JDK folder and add its `bin` directory to `PATH`.
4. Open a new terminal and check `java -version` and `javac -version`.
5. Restart the simulator.

## Optional AI interviewer

The AI layer is strictly additive. The scripted interviewer always handles the scenario spine, keyword answers, checkpoint probes, hints, and the debrief fallback.

Set all three variables in the shell that starts the server:

| Variable | Meaning |
| --- | --- |
| `INTERVIEW_SIM_AI_BASE_URL` | OpenAI-compatible base URL, for example `https://ollama.com/v1` |
| `INTERVIEW_SIM_AI_KEY` | Your Ollama Cloud key |
| `INTERVIEW_SIM_AI_MODEL` | Model name to use, for example the model shown in your Ollama account |

PowerShell example:

```powershell
$env:INTERVIEW_SIM_AI_BASE_URL = "https://ollama.com/v1"
$env:INTERVIEW_SIM_AI_KEY = "<your key>"
$env:INTERVIEW_SIM_AI_MODEL = "<your model>"
node interview-sim/server.mjs
```

The key is read from the environment by the server only. It is never written to disk, logs, the repository, or browser storage, and it is never sent to the browser. Each AI call is timeboxed to about 20 seconds. On any error, missing configuration, or timeout the server returns the scripted response.

When AI is configured, the top bar shows `AI interviewer` and each answer, probe, and debrief is labelled `AI` or `Scripted`. When AI is not configured, the top bar shows `Scripted interviewer` and no network call is made.

Privacy note: when AI is enabled, the clarifying question, the current editor contents for a probe, and the session summary for the debrief are sent to the configured provider. Disable AI (unset the variables) if the code must not leave the machine.

## Session controls

- Phase times default to 5 / 25 / 10 / 10 / 10 minutes and can be changed in the briefing dialog before starting.
- The timer counts active phase time only. Pause and resume it, reset a phase, or advance by hand at any time. A phase that runs past its budget keeps counting overtime, which lowers the time-discipline score.
- Checkpoint probes fire automatically at the scenario's configured minutes. `Ask for a probe` requests one adaptive follow-up when AI is available, and a scripted probe otherwise.
- `Request hint` returns three graded hints: nudge, then direction, then near-answer. Every hint is recorded for scoring.
- `Run tests` compiles and runs the hidden suite for the current phase. Test output is shown in the console.
- In debugging rounds, the root-cause note above the console records your diagnosis in your own words and is scored separately from the fix.
- In design rounds, `Check sketch (optional)` compiles the editor contents under the name of the sketch's first public type, falling back to the scenario's file name when no public type is declared. It reports the result as informational. Design notes do not need to compile, the sketch does not affect the score, and the round runs without a JDK.

## Exam mode

The start screen offers a timed exam beside scenario practice.
The exam draws 20 unique questions from `quiz/questions.js`, round-robin across the eight topics and randomized within each topic.
Questions are multiple-choice or true-false, with no hints, no AI interviewer, and no answers or explanations revealed before submission.
Set the duration before starting; the default is 25 minutes, and the countdown uses active time (it pauses while the exam tab is hidden or when you press Pause).

The exam shows one question at a time with a visible progress count.
Use Previous and Next to move around, change answers until you submit, and press Submit exam when ready.
When the timer reaches zero the exam submits automatically and says so.

After submission the feedback report shows the total correct, the percentage, the same grade bands used by scenario debriefs, and a correct/total breakdown for every topic.
For each incorrect answer it repeats the question, your selected answer, the correct answer, and the bank's explanation, and it names the areas you did incorrectly.
The report is keyboard accessible and announces the result in a live region.

The same feedback builds a tailored remediation plan.
Topics are ranked by the number of incorrect answers, with ties broken by the lower accuracy, and each entry lists the questions that were missed.
Start focused retake begins a new exam containing exactly those missed questions and reports its result the same way.
The server exposes `GET /api/exam` for questions without answers and `POST /api/exam/score` for a submitted answer set.
Both routes sit behind the same local-origin, host-header, and JSON content-type guards as the other API routes.

## Voice controls

Each interviewer message has a Play control that reads it aloud with `window.speechSynthesis` and locally installed voices.
The briefing opening and the exam feedback summary have their own Play controls.
The auto-speak toggle in the top bar speaks each new interviewer message automatically, and the preference is stored in `localStorage` when storage is available.
Pressing a Play control or turning auto-speak off interrupts the current utterance, while the auto-speak toggle queues each new interviewer message so a burst of them is read in order; speech never blocks the text UI.

The microphone button beside the question input uses `window.SpeechRecognition` or `webkitSpeechRecognition` for dictation.
While listening it shows the interim transcript, and on the final result it inserts the transcript into the input without sending the message.
Press the microphone again to stop; permission denial, unsupported browsers, and recognition errors show a clear inline message and leave the text input working.

Both features fall back to text-only with an explicit message when the browser does not support them.
Speech recognition may send audio to the browser vendor's online service, while speech synthesis uses locally installed voices.
The AI key stays server-only and never reaches the browser.

## Scenarios

Twelve scenarios ship under `interview-sim/scenarios/`, across Associate, Intermediate, Senior, and Consultant difficulty:

| Scenario | Type | Area | Base round | Follow-up |
| --- | --- | --- | --- | --- |
| `claim-status-transition` | coding | Claim domain | Status transition method with an enum | Audit-note overload and reopening rule |
| `claim-validation` | coding | Claim domain | Ordered validation messages | Field-keyed map API for a form |
| `claim-query-filter` | coding | Claim domain | Fix a broken filter and sort | Search summary counts and totals |
| `java-claim-index` | coding | Core Java | HashMap-based claim index | Remove and merge operations |
| `java-claim-streams` | coding | Core Java | Streams for totals, averages, top-N, partitions | Status totals and largest claim |
| `java-batch-exceptions` | coding | Core Java | Rule-based batch processor with custom exceptions | Fail-fast strict mode |
| `claim-payment-allocation` | coding | Claim domain | Allocate a payment across line items | Detailed allocations with remainder |
| `claim-duplicate-detection` | coding | Claim domain | Group duplicate claims by policy, date, and amount | Rich duplicate groups with the shared key |
| `claim-deductible-debug` | debugging | Claim domain | Fix a settlement that can go negative | Batch settlement from approved and deductible maps |
| `java-lru-cache-debug` | debugging | Core Java | Fix an LRU cache that evicts the wrong entry | Recency listing and live resize |
| `design-claim-review-workflow` | design | Claim domain | Review rules, decisions, precedence, and audit | Mandatory fraud rule before approval |
| `design-notification-preferences` | design | Claim domain | Channels, opt-ins, quiet hours, fallback, dedupe | Mandatory delivery receipts |

Coding and debugging scenarios have a starter file, a change-request starter, deterministic hidden tests, a rubric, checkpoint probes, hints, and a reference solution. Design scenarios have a prompt, constraints, probing questions, a weighted rubric, a reference design, and an optional sketch seed.

## Authoring a scenario

Add a JSON file under `interview-sim/scenarios/`. Every scenario requires:

- `id`, `title`, `tagline`, `difficulty`, `topics`
- `roundType`: `coding` (default when omitted), `debugging`, or `design`
- `phaseTimes`: minutes for `brief`, `implement`, `test`, `change`, `debrief`; labels adapt per round type
- `intro`, `problemStatement` (Markdown)
- `examples`, `clarifyingQuestions` (with `id`, `topic`, `question`, `keywords`, `answer`, `coach`), `clarifyingFallback`
- `probes` (`atMinute`, `phase`, `text`) for coding and debugging, `fallbackProbe`; design scenarios use `design.probingQuestions`
- `phasePrompts` for all five phase keys (`brief`, `implement`, `test`, `change`, `debrief`)
- `hints`: exactly three, in nudge, direction, near-answer order
- `rubric`: non-empty criteria with `id`, `type`, `weight`, `criterion`, `strongAnswer`; weights must sum to 100
- `changeRequest`: for coding and debugging, a code delta; for design, a constraint change or extension question

### Coding and debugging scenarios

Add:

- `starterCode`, `fileName` (ending in `.java`), `testSupport`
- `hiddenTests`: `{ name, className, code }` entries
- `referenceSolution`: a full solution that passes both the base and change suites
- `changeRequest`: `{ statement, prompt, starterCode, fileName, hiddenTests }`

A debugging scenario also adds:

- `reproductionNote`: the ticket or reproduction steps shown above the editor
- `diagnosis`: `{ prompt, keywords, strongAnswer }`. The candidate's root-cause note is scored by keyword coverage, separately from the tests.
- At least one hidden test with `"regression": true`. The validator checks that the broken starter compiles, fails that regression test, and that the reference solution passes it.

### Design scenarios

Add:

- `starterCode`: a plain-text design-notes seed. It does not need to compile, and a note-only seed is expected.
- `fileName`: the `.java` file name used for a class sketch that declares no public type; a sketch with a public class, interface, enum, or record is compiled under that type's name.
- `design`: `{ prompt, constraints, probingQuestions }`. Constraints are strings; probing questions use the same `{ atMinute, text }` shape as `probes`. If `probes` is omitted, the loader uses the probing questions.
- `referenceDesign`: the reference design shown in the debrief.
- `rubric` criteria of `type: "notes"` with a `keywords` array. Design scores structure, separation of responsibilities, interface choices, extensibility, and stated trade-offs by checking the candidate's design notes, editor sketch, and typed answers for evidence.
- `changeRequest`: `{ statement, prompt }` only. The change phase asks a constraint change or extension question instead of supplying a code delta.

Test protocol:

- Each hidden test is a Java file whose public class name matches `className` and contains `public static void main(String[] args)`.
- Exit code 0 means pass. Throw `AssertionError` with a useful message to fail.
- Every scenario's shared `TestSupport` class provides `eq`, `check`, `near`, and `throwsType`. The claim-payment-allocation, claim-deductible-debug, claim-duplicate-detection, and java-lru-cache-debug scenarios also provide `money`.
- Tests must be deterministic, must not touch the network or the clock where avoidable, and must not rely on file system state.
- The candidate file and all test files compile together with `javac --release 17`.

Run the validator before reporting a scenario as done:

```bash
node interview-sim/validate.mjs
```

It checks the schema per round type, unique ids, non-empty rubrics and weights, that every clarifying question example and a set of paraphrase questions resolve to the intended topic, the required scenario mix (at least 12 scenarios, 2 debugging and 2 design), that every code starter compiles and fails before completion, that each debugging regression test fails on the broken starter, that every reference solution passes both hidden suites, and that each design criterion's strong answer and reference design, plus each debugging diagnosis's strong answer, clear their evidence thresholds.

## Progress and history

A completed debrief appends one JSON record under `interview-sim/progress/` per session.
A submitted exam appends its own record there with `kind: "exam"`, the score, topic breakdown, missed question ids, and the tailored plan.
That directory is gitignored; only `.gitkeep` is tracked.
Each scenario record carries the round type, rubric evidence, test results, and sketch compile result where relevant.
The `History` button shows completed sessions and exam attempts, per-topic averages, the weakest topics, and the latest tailored plan, with a button to start that plan's focused retake.
Records stay on this machine.

## Local-only and sandbox limitations

- The server binds to `127.0.0.1`. It rejects requests with a non-local `Host` header, rejects API requests whose `Origin` header is not the local server, and requires `Content-Type: application/json` on API POSTs. There is no authentication, telemetry, or remote service other than the optional AI provider you configure.
- Your code is the user's own practice code. It is compiled and run locally in a temporary directory outside the repository, with a per-test timeout and a total timeout, and the directory is deleted afterward. On Windows, the whole process tree is killed on timeout.
- **This is not a security sandbox.** Java code can read and write local files and use the network. Do not run code you do not trust. The timeouts limit hangs, not malicious behaviour.
- Hidden tests are not sent to the browser, but test results and failure output are shown so you can debug.
- The AI key never reaches the browser because all AI calls are proxied by the local server.

## Layout

```text
interview-sim/
  server.mjs            local HTTP server and API
  validate.mjs          scenario and reference-solution validator
  lib/
    ai.mjs              optional AI calls with scripted fallbacks
    exam.mjs            quiz bank loading, exam selection, scoring, tailored plan
    java.mjs            JDK detection, compile, run, timeout, cleanup
    progress.mjs        local progress records
    scenarios.mjs       scenario loading and public projection
  public/
    index.html          single-page UI
    app.js              session flow, timer, chat, scoring
    scoring.mjs         keyword evidence helpers shared by app.js and validate.mjs
    styles.css          local styling, no external assets
  scenarios/            twelve scenario definitions across three round types
  progress/             gitignored local session records
```
