# Douyin Shooting Coach Distillation

This workspace is for distilling a public basketball shooting creator into an app-ready
diagnosis and training knowledge base.

Source homepage:
https://www.douyin.com/user/MS4wLjABAAAAt5TumWfhHwGqpg6Cg73S_wnlmFtgK3k40iz5G2SucQ0?from_tab_name=main

## Boundary

- Do not bypass login, CAPTCHA, risk control, membership, paywalls, or platform restrictions.
- Do not upload raw transcripts, raw audio, raw video, API keys, or cookies into any GPT/agent package.
- Distill transferable rules and diagnostics. Do not imitate the creator's voice, identity, brand, or exact wording.
- Prefer user-supplied legal inputs: video URL list, subtitles, transcript files, or notes.

## Workflow

1. Collect public video URLs with `docs/MANUAL_LINK_COLLECTION.md`, then fill `inputs/video_urls.txt`.
2. For the 2020+ batch, use `docs/BATCH_DISTILLATION.md` and treat `outputs/link_dates_2020_plus.csv` as the canonical source.
3. Save legal transcripts or notes under `outputs/transcripts/`.
4. Convert each transcript into one rule card using `templates/rule_card_template.md`.
5. Synthesize rule cards into methodology and taxonomy under `outputs/methodology/`.
6. Build `outputs/knowledge_base.json` and validate it against `schemas/knowledge_base.schema.json`.
7. Run one realistic smoke test before using the knowledge in the shooting-analysis app.
