# Analysis Engine Package

This package is the migration bridge for the PRD target shape:

```text
packages/analysis-engine
  metrics, evidence packet, knowledge retrieval, report contracts, prompt/report helpers
```

For the current local MVP it re-exports the stable server modules used by `AI 投篮实验室`, so Arc Lab can depend on the evidence engine without deleting or rewriting the existing analysis lab.

Current exports:

- `buildEvidencePacket`
- `buildMultiAngleEvidencePacket`
- `buildAngleKnowledgeRetrieval`
- `buildReportContracts`
- `normalizeEvidencePacketForReport`
- `coachReportSystemPrompt`
- `buildCoachUserPrompt`
- `localCoachReport`
- `validateCoachReport`
