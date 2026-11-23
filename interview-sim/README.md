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

Open http://127.0.0.1:4321. By default the server binds to `127.0.0.1` only. Set `INTERVIEW_SIM_PORT` to change the port. To serve the app to an Android phone on the same Wi-Fi, see [Install on Android](#install-on-android). To reach it from the phone over Tailscale instead, see [Run from your phone over Tailscale](#run-from-your-phone-over-tailscale).

There is no build step, no bundler, and no CDN asset.

## Install on Android

Android installs a web app only from a secure context. An `https://` origin qualifies, and so does `http://localhost`, but a plain HTTP address on the LAN does not. Choose one of the two LAN paths below, or use the Tailscale path in [Run from your phone over Tailscale](#run-from-your-phone-over-tailscale).

### Path A: LAN + HTTPS (recommended, full app install)

1. Find this computer's Wi-Fi IPv4 address (`ipconfig` on Windows), for example `192.168.1.42`.
2. Allow Node through the firewall for private networks when Windows asks, and use a home or office Wi-Fi you trust.
3. From the repository root, start the server (PowerShell):

```powershell
$env:INTERVIEW_SIM_LAN = "1"
$env:INTERVIEW_SIM_PUBLIC_HOST = "192.168.1.42"
$env:INTERVIEW_SIM_HTTPS = "1"
node interview-sim/server.mjs
```

`INTERVIEW_SIM_LAN=1` is the opt-in LAN mode. It binds all interfaces (`0.0.0.0`) and adds exactly the chosen `192.168.1.42:4321` host name to the allowed hosts and origins. `INTERVIEW_SIM_PUBLIC_HOST` is the address the phone will use; when it is omitted the server picks the first non-loopback IPv4 address. Set `INTERVIEW_SIM_HOST` to bind one interface instead of all of them. `INTERVIEW_SIM_PORT` changes the port everywhere, including these allow lists.

On the first start with `INTERVIEW_SIM_HTTPS=1`, the server generates a local CA and a server certificate under `interview-sim/.certs/` using OpenSSL (already included with Git for Windows). Later starts reuse those files; delete the directory to regenerate. To use a certificate you already have instead:

```powershell
$env:INTERVIEW_SIM_TLS_CERT = "C:\certs\interview-sim.pem"
$env:INTERVIEW_SIM_TLS_KEY = "C:\certs\interview-sim-key.pem"
```

4. On the phone, open `https://192.168.1.42:4321`. Chrome warns that the connection is not private; choose **Advanced** and continue once.
5. Open `https://192.168.1.42:4321/interview-sim-ca.crt` and install it as a CA certificate: **Settings > Security > Encryption & credentials > Install a certificate > CA certificate**. Android asks you to confirm and may require a screen lock. If you supplied your own certificate, install your own CA instead.
6. Reopen `https://192.168.1.42:4321` and confirm the address shows as secure; restart Chrome if the warning remains. Open Chrome's menu and choose **Install app** (or **Add to Home screen**). The app opens in its own standalone window with safe-area insets, the app shell is cached, and it opens offline. `/api` calls still need the server to be running.

The manifest is served as `application/manifest+json`, and the server maps `.webmanifest` to that type. The 192 px and 512 px icons plus the maskable icon live in `interview-sim/public/icons/`.

### Path B: LAN over HTTP (fallback shortcut)

```powershell
$env:INTERVIEW_SIM_LAN = "1"
$env:INTERVIEW_SIM_PUBLIC_HOST = "192.168.1.42"
node interview-sim/server.mjs
```

Open `http://192.168.1.42:4321`. Chrome only offers **Add to Home screen**, which creates a shortcut that opens this URL in a normal browser tab. There is no service worker, no cached offline shell, and no standalone window, but every scenario, exam, and API call works while the server is running. Use this path only when you cannot install the certificate.

Both LAN paths are opt-in. Without those variables the server keeps the original `127.0.0.1` binding and its existing host and origin allow list.

## Run from your phone over Tailscale

Use this when you want the phone to reach the simulator on the home PC over your Tailscale network, away from the home Wi-Fi, with a valid HTTPS origin. Tailscale Serve terminates TLS and proxies to the server, which keeps listening only on `127.0.0.1`.

1. Confirm Tailscale is up and signed in on both the PC and the phone, and that they are peers on the same tailnet. MagicDNS and HTTPS certificates must be enabled for the tailnet.
2. From the repository root, start a session:

```powershell
powershell -ExecutionPolicy Bypass -File interview-sim\scripts\start-tailscale.ps1
```

The script:

- checks that `tailscale` is on PATH and the backend is running, then reads this node's DNS name and Tailscale IPv4 at runtime;
- checks that the local simulator port (4321 by default) is free, and stops before touching Serve if it is not;
- reads `tailscale serve status --json` and stops without changing anything if HTTPS port 8443 already points at something other than `http://127.0.0.1:4321`;
- otherwise adds only `https://<machine>.<tailnet>.ts.net:8443 -> http://127.0.0.1:4321` and prints what it added;
- starts `node interview-sim/server.mjs` with `INTERVIEW_SIM_PUBLIC_URL` set to the printed HTTPS origin.

3. Open the printed `https://<machine>.<tailnet>.ts.net:8443` URL on the phone. Chrome shows a valid secure origin. Open the menu and choose **Install app**.
4. Keep the PC awake and the server window running while you practice. Access is limited to the tailnet.

The 8443 Serve mapping is persistent. It stays active after the node server exits until you remove it. It is reachable only from your tailnet and points at `http://127.0.0.1:4321`, so nothing is exposed publicly; never repoint it at another service. Remove it when you are done:

```powershell
tailscale serve --https=8443 off
```

`INTERVIEW_SIM_PUBLIC_URL` is the opt-in switch. Set it directly when you run the server yourself:

```powershell
$env:INTERVIEW_SIM_PUBLIC_URL = "https://<machine>.<tailnet>.ts.net:8443"
node interview-sim/server.mjs
```

The server accepts the value only when it is an `https://` URL whose host has no credentials, query, fragment, or path other than `/`. It adds that host and port to the allowed host and origin lists, still rejects every other host and origin, prints the public URL in the startup message, and keeps the listener on `127.0.0.1`. Without the variable nothing changes.

Useful switches:

- `-SkipServe` starts the server without touching Tailscale Serve, for when you manage Serve yourself.
- `-Port <port>` changes the local simulator port (default 4321).
- `-HttpsPort <port>` changes the Serve HTTPS port (default 8443).

The script never installs Tailscale, signs in, changes tailnet policy, or edits firewall rules. It fails with a clear message when one of those is missing.

### Troubleshooting

- **The phone cannot reach the URL.** Run `tailscale status` on both devices and confirm both show the same tailnet. The URL must match the printed port (default `:8443`).
- **The certificate is not trusted.** Enable HTTPS certificates for the tailnet in the Tailscale admin console, then rerun the script so it derives the certificate hostname again.
- **The browser shows `Forbidden host` or `Forbidden origin`.** The server was started without `INTERVIEW_SIM_PUBLIC_URL`, or the variable does not match the hostname and port in the browser. Start it with the script.
- **The script reports a Serve conflict.** Something else already uses HTTPS port 8443. Stop that mapping or choose another `-HttpsPort`; the script changes nothing when it finds a conflict.
- **The session stops after the PC sleeps.** Wake the PC and start the session again. When the PC is unreachable, the installed app falls back to its offline shell, refreshers, and writing practice; running tests returns when the PC is reachable again.
- **The other service on the hostname root breaks.** It should not: this setup adds only the 8443 mapping. Never point the root Serve mapping at the simulator, and never use `tailscale funnel` for it.

### Boundaries

The simulator has no authentication and it compiles and runs Java on this PC. Treat it as tailnet-only:

- Never expose it with `tailscale funnel` or any other public tunnel.
- Use Tailscale access rules to limit it to your own devices.
- The existing Serve mapping at the hostname root belongs to another service and must stay unchanged. Only the dedicated 8443 mapping is added for the simulator.
- Keep any tailnet name, machine name, and address out of tracked files; the script derives them at runtime and the documentation uses placeholders.

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

- Each scenario sets its own `phaseTimes`; beginner rounds are shorter than the Associate-and-up rounds. You can change every phase in the briefing dialog before starting.
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

Eighteen scenarios ship under `interview-sim/scenarios/`, across Beginner, Associate, Intermediate, Senior, and Consultant difficulty:

| Scenario | Type | Area | Base round | Follow-up |
| --- | --- | --- | --- | --- |
| `beginner-claim-newest` | coding | Claim domain | Return the claim with the latest incident date | Break date ties by claim id |
| `beginner-claim-name-check` | coding | Claim domain | Validate one claimant name field | Reject names longer than 80 characters |
| `beginner-claim-filter-bug` | debugging | Claim domain | Fix an inverted claim status filter | Include reopened claims |
| `beginner-claim-total-amount` | coding | Claim domain | Total the approved claim amounts | Return a summary with the total and count |
| `beginner-claim-count-bug` | debugging | Claim domain | Fix a counter that misses the last claim | Count reopened claims too |
| `design-claim-documents` | design | Claim domain | Validate, store, and retrieve claim documents | Mandatory virus scan before storage |
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
It also checks that the shared quiz bank loads with eight topics and valid questions, that a standard exam selects 20 unique answer-free questions balanced across topics, that a focused selection returns exactly the requested ids, and that exam scoring and the tailored plan follow the documented rules.

It first starts the server on a random port and verifies the installable web app: the manifest's MIME type and fields, the icon PNG sizes, and that the service worker precaches the app shell, leaves `/api` to the network, and serves the cached shell offline.

It also starts the server with `INTERVIEW_SIM_PUBLIC_URL` set and checks that the public host and origin are accepted, unknown hosts and origins are still rejected, the bare host form works on the default HTTPS port, and every malformed value exits with a single-line error.

## Progress and history

A completed debrief appends one JSON record under `interview-sim/progress/` per session.
A submitted exam appends its own record there with `kind: "exam"`, the score, topic breakdown, missed question ids, and the tailored plan.
That directory is gitignored; only `.gitkeep` is tracked.
Each scenario record carries the round type, rubric evidence, test results, and sketch compile result where relevant.
The `History` button shows completed sessions and exam attempts, scenario-session per-topic averages and weakest topics, and the latest tailored plan, with a button to start that plan's focused retake.
Records stay on this machine.

## Local-only and sandbox limitations

- By default the server binds to `127.0.0.1`. It rejects requests with a non-local `Host` header, rejects API requests whose `Origin` header is not the local server, and requires `Content-Type: application/json` on API POSTs. LAN mode is opt-in: when `INTERVIEW_SIM_LAN=1` is set, the server binds the configured interface and adds only the chosen LAN host name to the allowed hosts and origins. Tailscale mode is opt-in: `INTERVIEW_SIM_PUBLIC_URL` adds only that HTTPS origin and its host while the listener stays on `127.0.0.1`. There is no authentication, telemetry, or remote service other than the optional AI provider you configure. Because these modes have no authentication, use them only on a network you trust, and never expose the simulator through `tailscale funnel` or a public tunnel.
- Your code is the user's own practice code. It is compiled and run locally in a temporary directory outside the repository, with a per-test timeout and a total timeout, and the directory is deleted afterward. On Windows, the whole process tree is killed on timeout.
- **This is not a security sandbox.** Java code can read and write local files and use the network. Do not run code you do not trust. The timeouts limit hangs, not malicious behaviour.
- Hidden tests are not sent to the browser, but test results and failure output are shown so you can debug.
- The AI key never reaches the browser because all AI calls are proxied by the local server.

## Layout

```text
interview-sim/
  server.mjs            local HTTP and HTTPS server and API
  validate.mjs          scenario, exam, and installable-app validator
  scripts/
    start-tailscale.ps1 configures Serve and starts a phone session over Tailscale
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
    manifest.webmanifest  installable web app metadata
    sw.js               app-shell service worker
    icons/              192 px, 512 px, and maskable PNG icons
  scenarios/            eighteen scenario definitions across three round types
  progress/             gitignored local session records
  .certs/               gitignored generated HTTPS certificates
```
