# Shooting Rule Card Prompt

Use this prompt when converting a legally obtained transcript into an app-ready
shooting rule card.

## Non-negotiable Rules

- Read the transcript first; do not generate a card from title/caption metadata alone.
- Do not copy long transcript passages into the card.
- Do not imitate the creator's tone, identity, brand, or exact phrasing.
- Separate explicit claims from inferred claims.
- Mark missing evidence as `not_stated`.
- Prefer diagnosis and repair rules over ordinary summaries.

## Output Target

Each card should help the shooting-analysis app answer:

- What motion problem is being diagnosed?
- What visible body or ball-flight indicators should the app inspect?
- What false positives should be avoided?
- What repair task should the user do next?
- What should the app avoid inferring from a single camera angle?

## Required Rule Shape

Use IF/THEN/CHECK/REPAIR rules:

```text
IF: visible condition in the user's shooting video
THEN: likely diagnosis
CHECK: extra evidence or camera angle needed
REPAIR: concrete training action
confidence_basis: explicit transcript / inferred / not_stated
```
