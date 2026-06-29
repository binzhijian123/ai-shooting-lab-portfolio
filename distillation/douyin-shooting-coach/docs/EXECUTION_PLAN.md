# Execution Plan

## Goal

Build a basketball shooting methodology knowledge base for the shooting-analysis app.
The output should support action-video diagnosis, common error classification, and
training repair suggestions.

## Phase 0: Feasibility Gate

- Confirm the creator's videos are public and accessible without bypassing restrictions.
- Prefer a user-provided full video URL list over crawling the creator homepage.
- If Douyin blocks access, stop and ask for exported links, subtitles, or transcript text.

## Phase 1: Small Pilot

- Process 1 to 3 representative videos first.
- Produce one rule card per video.
- Check whether the card contains actionable diagnosis rules instead of a generic summary.
- Run one smoke test against a realistic shooting problem.

## Phase 2: Batch Expansion

- Expand in batches of 5 to 10 videos.
- Keep deterministic source counts from the inventory file.
- Record missing subtitles or failed extraction in `outputs/needs_transcript.json`.
- Do not paste full transcripts into chat context.

## Phase 3: Methodology and App Layer

- Merge repeated principles into shooting modules.
- Mark conflicts and claims needing human or coach review.
- Build `knowledge_base.json` for app retrieval.
- Keep raw transcripts separate from the app upload package.

## Subagent Split

- Extractor: verifies source inventory and transcript availability only.
- Card Builder: converts transcripts into rule cards.
- Synthesizer: merges cards into methodology, taxonomy, and app rules.
- Schema Builder: validates `knowledge_base.json`.
- Verifier: runs smoke tests and checks for unsupported claims.

