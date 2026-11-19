# User Stories and Acceptance Criteria

## The customer need in plain language

A policyholder who has suffered a loss files a claim with the insurer. The insurer needs to capture that claim, check that the required fields are present, look the claim up later, and update its status as it moves through processing. This document restates that simple claim-intake need as user stories with acceptance criteria, so that the planned Java implementation can be built and verified against them.

## Honest scope note

This is a practice project. All claims are mock data: records live in memory only and disappear when the application stops. There is no real policy system, no real policyholder data, and nothing here assesses, handles, or pays real insurance claims. Do not use this software for production insurance work.

## Shared vocabulary

- **Claim**: a record of a loss reported by a policyholder (the claimant) to the insurer.
- **Claim ID**: a unique identifier the system assigns to each claim when it is accepted.
- **Required fields**: claimant name, claimant email, policy number, date of loss (which must not be in the future), claim type, loss description, and amount. The amount must be greater than zero. Claimant phone is optional, but when supplied it must be a valid phone format.
- **Claim statuses**: `OPEN`, `IN_REVIEW`, `CLOSED`. A new claim starts at `OPEN`.

## Story 1: Accept a claim

**As a** policyholder who has suffered a loss, **I want** to file a claim, **so that** the insurer captures my loss information and starts processing it.

### Acceptance criteria

- **Given** I submit a claim with a claimant name, claimant email, policy number, date of loss that is not in the future, claim type, loss description, and an amount greater than zero, **when** the system receives it, **then** the system records the claim, assigns it a unique claim ID, and returns the recorded claim including that ID.
- **Given** a claim is recorded, **when** it is accepted, **then** its initial status is `OPEN`.
- **Given** this practice project stores mock data, **when** a claim is accepted, **then** it is stored in memory only, with no external database or real policyholder data involved.

## Story 2: Validate required fields

**As a** claims representative, **I want** the system to check that every claim has all required fields, **so that** incomplete claims do not enter processing.

### Acceptance criteria

- **Given** a claim submission that is missing any required field (claimant name, claimant email, policy number, date of loss, claim type, loss description, or amount), **when** the claim is submitted, **then** the system rejects it with a validation error that names each missing field.
- **Given** a required field containing only whitespace or an empty string, **when** the claim is submitted, **then** the system treats that field as missing and rejects the claim.
- **Given** a claim submission with a claimant name, a valid claimant email, a policy number, an incident date that is not in the future, a claim type, a loss description, and an amount greater than zero, **when** the claim is submitted, **then** the system accepts it; claimant phone is optional but must be valid when supplied.

## Story 3: Retrieve a claim

**As a** claims representative, **I want** to look up a claim by its claim ID, **so that** I can review the details of a claim a policyholder filed.

### Acceptance criteria

- **Given** a claim recorded with a known claim ID, **when** I retrieve the claim by that ID, **then** the system returns the full claim record: claim ID, claimant name, claimant email, claimant phone, policy number, date of loss, claim type, loss description, amount, and status.
- **Given** a claim ID that was never recorded, **when** I retrieve a claim by that ID, **then** the system returns a not-found error rather than an empty or partial claim.
- **Given** more than one recorded claim, **when** I retrieve a claim by one ID, **then** the system returns exactly that claim and not another claim's details.

## Story 4: Update a claim's status

**As a** claims representative, **I want** to update a claim's status, **so that** the claim's progress from `OPEN` through `IN_REVIEW` to `CLOSED` is tracked as it is processed.

### Acceptance criteria

- **Given** a recorded claim, **when** I update its status to a valid status (`OPEN`, `IN_REVIEW`, or `CLOSED`), **then** the system stores the new status and returns the updated claim showing it.
- **Given** a status value that is not `OPEN`, `IN_REVIEW`, or `CLOSED`, **when** I update a claim's status with it, **then** the system rejects the update with a validation error.
- **Given** a claim ID that was never recorded, **when** I update a claim's status by that ID, **then** the system returns a not-found error.
- **Given** a successful status update, **when** the update is applied, **then** the claim's other details (claimant name, claimant email, claimant phone, policy number, date of loss, claim type, loss description, and amount) remain unchanged.
