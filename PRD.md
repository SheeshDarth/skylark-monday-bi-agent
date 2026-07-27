# PRD — Skylark Business Intelligence Agent

## Problem

Founders and executives need quick, accurate answers to business questions spanning multiple monday.com boards (work orders, deals). Today this means manually pulling data, cleaning inconsistent formats, and building ad-hoc analysis per query — slow, and error-prone on messy real-world data.

## Target users

Skylark founders/executives asking natural-language business questions — not analysts, not engineers. They want an answer and the "so what," not a spreadsheet.

## Core user stories

1. As a founder, I can ask "How's our pipeline looking for the energy sector this quarter?" and get a direct answer with context (not just a number).
2. As an executive, I can ask about work order billing/collection status by sector and get flagged risks (e.g. unbilled amounts, stalled collections).
3. As a founder, I can ask a question that requires joining both boards (e.g. "which sectors have deals but no active work orders?") and get a correct cross-board answer.
4. As a founder, I can ask the agent to prepare a leadership-update-ready summary of a topic, and get a short, pasteable markdown block.
5. As any user, when data is missing or ambiguous, I'm told so explicitly rather than getting a silently wrong number.

## Out of scope

- Write access to monday.com (the integration is read-only by requirement).
- User authentication / multi-tenant support (single shared token for this exercise).
- Historical trend charts or a dashboard UI — this is a chat interface only.

## Success criteria

- Correctly answers all 5 user stories above against the live boards.
- Never reports an aggregate number without disclosing exclusions/missing data behind it.
- Hosted, reachable, and testable with zero local setup.
