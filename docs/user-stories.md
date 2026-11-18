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
