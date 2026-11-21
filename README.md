# pc-claim-intake-api

A small P&C (property & casualty) claim-intake REST API in Java. This is a **learning project** to practice Java, REST, testing, Git, and CI — not a production insurance system. It uses mock data.

## Planned features

- Accept a claim (mock data)
- Validate required fields
- Retrieve a claim
- Update a claim's status

## What exists today: the claim domain model

The repository currently contains a typed, in-memory domain model for claim intake, covered by JUnit 5 tests. There is no HTTP/REST layer yet.

- `com.example.claimintake.domain` — immutable `Claim`, the claimant-supplied `ClaimSubmission`, the `ClaimStatus` enum (`OPEN`, `IN_REVIEW`, `CLOSED`), and the `ClaimType` enum.
- `com.example.claimintake.validation` — `ClaimValidator` checks required fields, email and phone format, incident date, and amount, then throws a `ValidationException` that lists every problem found.
- `com.example.claimintake.repository` — `ClaimRepository` interface with an in-memory implementation. Claims live only as long as the process.
- `com.example.claimintake.service` — `ClaimService` interface and implementation for submitting a claim, retrieving it by id, and updating its status.

Run the tests with `./mvnw test` (`mvnw.cmd test` on Windows). Java 17 or newer is required.

REST endpoints, persistence, and CI are later steps in the plan.

## Study quiz

A separate offline quiz for self-testing this project and the study plan lives in
[`quiz/`](quiz/README.md). Open `quiz/index.html` in a browser; it needs no build or server.

## Interview simulator

A timed coding, debugging, and object-oriented design interview simulator for Java practice lives in
[`interview-sim/`](interview-sim/README.md). It runs your code locally, interrupts with probes,
adds a change or constraint request, and scores a debrief. Start it with
`node interview-sim/server.mjs` and open http://127.0.0.1:4321.

## Stack

- Java
- REST over HTTP with JSON
- JUnit unit tests
- CI workflow (GitHub Actions)
