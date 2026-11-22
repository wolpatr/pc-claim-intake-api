# pc-claim-intake-api

A small P&C (property & casualty) claim-intake REST API in Java. This is a **learning project** to practice Java, REST, testing, Git, and CI — not a production insurance system. It uses mock data.

## Features

- Accept a claim (mock data)
- Validate required fields
- Retrieve a claim
- List claims, newest first, optionally filtered by status
- Update a claim's status

## Study plan

The day-by-day plan this practice project follows is in
[`docs/study-plan.md`](docs/study-plan.md): a two-week Associate Consultant / Consultant Developer study plan covering Agile and Git, Java and object-oriented design, REST, testing, CI/CD, cloud trade-offs, responsible AI, and customer communication.

## What exists today

The repository contains a typed, in-memory domain model for claim intake, an HTTP layer on top of it, and JUnit 5 tests covering both.

- `com.example.claimintake.domain` — immutable `Claim`, the claimant-supplied `ClaimSubmission`, the `ClaimStatus` enum (`OPEN`, `IN_REVIEW`, `CLOSED`), and the `ClaimType` enum.
- `com.example.claimintake.validation` — `ClaimValidator` checks required fields, email and phone format, incident date, and amount, then throws a `ValidationException` that lists every problem found.
- `com.example.claimintake.repository` — `ClaimRepository` interface with an in-memory implementation. Claims live only as long as the process.
- `com.example.claimintake.service` — `ClaimService` interface and implementation for submitting a claim, retrieving it by id, listing claims with an optional status filter, and updating its status.
- `com.example.claimintake.web` — `ClaimController` exposes the user stories as JSON endpoints, with one shared error shape for validation, not-found, and malformed-JSON responses.

Run the tests with `./mvnw test` (`mvnw.cmd test` on Windows). Java 17 or newer is required.

Persistence and CI are later steps in the plan.

## Running the API

Start the application with `./mvnw spring-boot:run` (`mvnw.cmd spring-boot:run` on Windows). It listens on http://localhost:8080 by default; pass `--server.port=...` to use another port.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/claims` | Accept a claim. Returns `201 Created` with the recorded claim, including its generated `id` and `OPEN` status. Invalid input returns `400 Bad Request`. |
| `GET` | `/claims` | List every claim, newest first. Accepts an optional `status` query parameter (`OPEN`, `IN_REVIEW`, or `CLOSED`); any other value returns `400 Bad Request`. |
| `GET` | `/claims/{id}` | Retrieve a claim by id. Returns `200 OK` with the full record, or `404 Not Found`. |
| `PATCH` | `/claims/{id}/status` | Update only the status from a JSON body such as `{"status":"IN_REVIEW"}`. Returns `200 OK` with the updated claim, `400 Bad Request` for an unrecognized status, or `404 Not Found`. |

A submission is a JSON object with camelCase fields: `claimantName`, `claimantEmail`, `claimantPhone` (optional), `policyNumber`, `incidentDate` (`yyyy-MM-dd`, not in the future), `claimType` (`AUTO`, `PROPERTY`, `GENERAL_LIABILITY`, `WORKERS_COMPENSATION`, `OTHER`), `description`, and `amount` (a decimal number greater than zero). Responses add `id` and `status`.

Example:

```bash
curl -X POST http://localhost:8080/claims \
  -H 'Content-Type: application/json' \
  -d '{"claimantName":"Ada Lovelace","claimantEmail":"ada.lovelace@example.com",
       "policyNumber":"POL-12345","incidentDate":"2024-05-20","claimType":"AUTO",
       "description":"Rear-ended while stopped at a traffic light.","amount":1500.00}'
```

Validation (`400`), unknown-claim (`404`), and malformed-JSON (`400`) responses share one shape: `status`, `error`, `message`, and a `fieldErrors` array of `{field, message}` objects.

## Study quiz

A separate offline quiz for self-testing this project and the study plan lives in
[`quiz/`](quiz/README.md). Open `quiz/index.html` in a browser; it needs no build or server.

## Interview simulator

A timed coding, debugging, and object-oriented design interview simulator for Java practice, with a
multiple-choice exam mode and voice controls, lives in
[`interview-sim/`](interview-sim/README.md). It runs your code locally, interrupts with probes,
adds a change or constraint request, and scores a debrief. Start it with
`node interview-sim/server.mjs` and open http://127.0.0.1:4321. It can also be
served over Wi-Fi and installed as an app on Android; see the interview simulator
README for the HTTPS and LAN steps.

## Stack

- Java
- Spring Boot (Spring Web) for REST over HTTP with JSON
- JUnit unit and Spring Boot integration tests
- CI workflow (GitHub Actions)
