# User Stories and Acceptance Criteria

## The customer need in plain language

A policyholder who has suffered a loss files a claim with the insurer. The insurer needs to capture that claim, check that the required fields are present, look the claim up later, and update its status as it moves through processing. This document restates that simple claim-intake need as user stories with acceptance criteria, so that the planned Java implementation can be built and verified against them.

## Honest scope note

This is a practice project. All claims are mock data: records live in memory only and disappear when the application stops. There is no real policy system, no real policyholder data, and nothing here assesses, handles, or pays real insurance claims. Do not use this software for production insurance work.

## Shared vocabulary

- **Claim**: a record of a loss reported by a policyholder (the claimant) to the insurer.
- **Claim ID**: a unique identifier the system assigns to each claim when it is accepted.
- **Required fields**: claimant name, policy number, date of loss, and loss description.
- **Claim statuses**: `OPEN`, `IN_REVIEW`, `CLOSED`. A new claim starts at `OPEN`.

## Story 1: Accept a claim

**As a** policyholder who has suffered a loss, **I want** to file a claim, **so that** the insurer captures my loss information and starts processing it.

### Acceptance criteria

- **Given** I submit a claim with a claimant name, policy number, date of loss, and loss description, **when** the system receives it, **then** the system records the claim, assigns it a unique claim ID, and returns the recorded claim including that ID.
- **Given** a claim is recorded, **when** it is accepted, **then** its initial status is `OPEN`.
- **Given** this practice project stores mock data, **when** a claim is accepted, **then** it is stored in memory only, with no external database or real policyholder data involved.

## Story 2: Validate required fields

**As a** claims representative, **I want** the system to check that every claim has all required fields, **so that** incomplete claims do not enter processing.

### Acceptance criteria

- **Given** a claim submission that is missing any required field (claimant name, policy number, date of loss, or loss description), **when** the claim is submitted, **then** the system rejects it with a validation error that names each missing field.
- **Given** a required field containing only whitespace or an empty string, **when** the claim is submitted, **then** the system treats that field as missing and rejects the claim.
- **Given** a claim submission in which all required fields are present and non-blank, **when** the claim is submitted, **then** the system accepts it.
