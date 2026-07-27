# PRD — Skylark Business Intelligence Agent

## Problem

Founders and executives need quick, accurate answers to business questions spanning multiple monday.com boards. Today that means manually pulling data, reconciling inconsistent formats, and building ad-hoc analysis per question — slow, and easy to get wrong on messy operational data.

## Target user

A Skylark founder or executive. Not an analyst, not an engineer. They want the answer and its implication, not a spreadsheet — and they need to trust the number, which means knowing what was excluded from it.

## User stories

1. **Pipeline health** — "How's our pipeline looking by sector?" -> an answer that leads with the finding (concentration, stalled deals) before the breakdown.
2. **Billing risk** — "What's at risk in billing and collections?" -> unbilled/uncollected amounts with the specific accounts flagged.
3. **Cross-board** — "Which sectors have deals but no active work orders?" -> correctly joins `Deal Name` to `Deal name masked` and reports deals present on only one board rather than dropping them.
4. **Leadership update** — "Prepare a leadership update on pipeline health." -> a pasteable markdown block: one headline stat, 2-3 bullets, one flagged risk.
5. **Honest gaps** — any aggregate states how many records it covers and how many were excluded, so a blank field is never silently counted as zero.

## Out of scope

- Writing to monday.com. The brief specifies read-only, and the token should be read-scoped.
- Authentication / multi-tenancy. One shared credential, appropriate for an evaluation prototype only.
- Dashboards or charts. Chat is the whole interface.

## Success criteria

- All five stories answered correctly against the live boards.
- No aggregate reported without its exclusion count.
- Deployed and usable from a URL with zero local setup.
