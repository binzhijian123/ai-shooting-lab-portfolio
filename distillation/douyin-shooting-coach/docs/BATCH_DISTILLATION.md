# Batch Distillation

Canonical input:

```bash
python3 distillation/douyin-shooting-coach/scripts/prepare_2020_plus_inventory.py
```

This creates:

- `inputs/source_inventory_2020_plus.csv`
- `outputs/needs_transcript.json`
- `outputs/transcript_status_2020_plus.json`

## Transcript Boundary

Rule cards require full legally obtained transcripts. The collected title/caption
text is useful for inventory and prioritization, but it is not enough evidence for
final rule-card distillation.

Preferred automated path:

```bash
.venv-vidscribe/bin/python distillation/douyin-shooting-coach/scripts/download_audio_from_inventory.py --limit 1
.venv-vidscribe/bin/python distillation/douyin-shooting-coach/scripts/transcribe_audio_mlx.py --limit 1 --language zh
```

`/note/` URLs are skipped by the audio downloader. They need manual text extraction
or another note-specific source path before card generation.

Manual fallback: put transcript files at the path shown in
`source_inventory_2020_plus.csv`, for example:

```text
distillation/douyin-shooting-coach/outputs/transcripts/douyin_7629305320225255012.txt
```

Supported text-like formats can be saved with the same content convention, but the
inventory currently points to `.txt` paths for deterministic batching.

## Card Generation

Dry-run readiness:

```bash
python3 distillation/douyin-shooting-coach/scripts/generate_cards_from_transcripts.py --dry-run
```

Generate the first ready card:

```bash
cp distillation/douyin-shooting-coach/.env.example distillation/douyin-shooting-coach/.env
# Fill DEEPSEEK_API_KEY locally, then:
python3 distillation/douyin-shooting-coach/scripts/generate_cards_from_transcripts.py --limit 1
```

Then expand in batches:

```bash
python3 distillation/douyin-shooting-coach/scripts/generate_cards_from_transcripts.py --limit 10
```

Do not paste the API key into chat. Export it locally in the shell or place it in
`distillation/douyin-shooting-coach/.env`.

## Methodology and Knowledge Base

After `outputs/cards/*.md` exists, synthesize cross-card methodology docs:

```bash
python3 distillation/douyin-shooting-coach/scripts/build_methodology_from_cards.py
```

This reads only rule cards and writes:

- `outputs/methodology/overall_methodology.md`
- `outputs/methodology/shooting_quality_rules.md`
- `outputs/methodology/repair_playbook.md`
- `outputs/methodology/source_coverage.md`

Build the structured agent knowledge base:

```bash
python3 distillation/douyin-shooting-coach/scripts/build_knowledge_base.py
```

This writes `outputs/knowledge_base.json` and validates it against
`schemas/knowledge_base.schema.json`.

The build also embeds the research-backed signal registry from:

```text
inputs/research_signal_registry.json
```

This registry does not replace the distilled coach rules. It connects video-derived
metrics to evidence signals, research basis, soft thresholds, required camera views,
and false-positive checks. Use it as a candidate-evidence layer before applying
`diagnosis_rules`; do not treat a single metric threshold as a standalone diagnosis.

When adding a new research-backed metric:

1. Add or update a `signal_id` in `inputs/research_signal_registry.json`.
2. Mark whether thresholds are `comparative`, `model_based`, `heuristic`, or
   `user_baseline`.
3. Include the population context and citation in `research_basis`.
4. List `must_combine_with` evidence and `false_positive_checks`.
5. Rebuild `outputs/knowledge_base.json` and verify schema validation passes.

## Validation

```bash
python3 distillation/douyin-shooting-coach/scripts/validate_distillation_state.py
```

The validator checks that the 2020+ CSV and inventory match, then counts ready
audio files, transcripts, and generated cards.
