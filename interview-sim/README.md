# Interview simulator

A local, single-page live coding interview simulator for Java practice. It recreates the shape of a real interview round instead of asking trivia:

1. **Brief and Clarify** - the interviewer opens the problem and answers clarifying questions.
2. **Implement** - you code against a visible clock while checkpoint probes interrupt.
3. **Test** - the server compiles your file and runs hidden tests in a temporary workspace.
4. **Change Request** - the interviewer adds scope and runs a second hidden suite.
5. **Debrief** - the rubric is scored, misses are listed, timings and hints are shown, and the reference solution is revealed.

The interviewer is a scripted scenario spine with an optional AI layer. Without an API key everything still works offline.

## Requirements

- Node.js 24 (the code uses only the standard library; there are no npm dependencies).
- A JDK 17 or newer. The simulator compiles with `javac --release 17`.

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

The detected version is printed in the top bar. If no JDK is found, the setup screen shows install instructions and refuses to start a session. The simulator never installs software.

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

## Scenarios

Six scenarios ship under `interview-sim/scenarios/`:

| Scenario | Area | Base round | Change request |
| --- | --- | --- | --- |
| `claim-status-transition` | Claim domain | Status transition method with an enum | Audit-note overload and reopening rule |
| `claim-validation` | Claim domain | Ordered validation messages | Field-keyed map API for a form |
| `claim-query-filter` | Claim domain | Debug a broken filter and sort | Search summary counts and totals |
| `java-claim-index` | Core Java | HashMap-based claim index | Remove and merge operations |
| `java-claim-streams` | Core Java | Streams for totals, averages, top-N, partitions | Status totals and largest claim |
| `java-batch-exceptions` | Core Java | Rule-based batch processor with custom exceptions | Fail-fast strict mode |

Every scenario has a starter file, a change-request starter, hidden tests, a rubric, checkpoint probes, hints, and a reference solution.

## Authoring a scenario

Add a JSON file under `interview-sim/scenarios/`. Required fields:

- `id`, `title`, `tagline`, `difficulty`, `topics`
- `phaseTimes`: minutes for `brief`, `implement`, `test`, `change`, `debrief`
- `intro`, `problemStatement` (Markdown), `starterCode`, `fileName`
- `examples`, `clarifyingQuestions` (with `id`, `topic`, `question`, `keywords`, `answer`, `coach`), `clarifyingFallback`
- `probes` (`atMinute`, `phase`, `text`), `fallbackProbe`
- `phasePrompts` for all five phases
- `hints`: exactly three, in nudge, direction, near-answer order
- `hiddenTests`: `{ name, className, code }` entries
- `changeRequest`: `{ statement, prompt, starterCode, fileName, hiddenTests }`
- `rubric`: non-empty criteria with `id`, `type`, `weight`, `criterion`, `strongAnswer`; weights must sum to 100
- `referenceSolution`: a full solution that passes both the base and change suites
- `testSupport`: shared helper source written into the temporary workspace

Test protocol:

- Each hidden test is a Java file whose public class name matches `className` and contains `public static void main(String[] args)`.
- Exit code 0 means pass. Throw `AssertionError` with a useful message to fail.
- The shared `TestSupport` class provides `eq`, `check`, `near`, and `throwsType`.
- Tests must be deterministic, must not touch the network or the clock where avoidable, and must not rely on file system state.
- The candidate file and all test files compile together with `javac --release 17`.

Run the validator before reporting a scenario as done:

```bash
node interview-sim/validate.mjs
```

It checks the schema, unique ids, non-empty rubrics, that every clarifying question example and a set of paraphrase questions resolve to the intended topic, that every starter and change starter compiles with its tests, and that every reference solution passes both hidden suites.

## Progress and history

A completed debrief appends a JSON record under `interview-sim/progress/`. That directory is gitignored; only `.gitkeep` is tracked. The `History` button shows completed sessions, per-topic averages, and the weakest topics. Records stay on this machine.

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
    java.mjs            JDK detection, compile, run, timeout, cleanup
    progress.mjs        local progress records
    scenarios.mjs       scenario loading and public projection
  public/
    index.html          single-page UI
    app.js              session flow, timer, chat, scoring
    styles.css          local styling, no external assets
  scenarios/            six scenario definitions
  progress/             gitignored local session records
```
