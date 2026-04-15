# RNS Workflow — DYOR HQ Research System

## Rule
**Every RNS received for any watched company must be analysed, stored, and assessed for material impact.** No exceptions. The record must exist even if the announcement is not material.

## Architecture

### Storage Location
```
research/{slug}/rns/{YYYY-MM-DD}-{title-slug}.md
```

Each RNS file contains:
- **Header:** ticker, date, URL, material score (0-10)
- **RNS Summary:** Full announcement text (from Investegate)
- **Assessment:** Material / Watch / Low materiality
- **Investment Impact:** Thesis-relevant analysis (to be completed on review)
- **Next Steps:** Any action required (thesis update, alert, no action)

### Materiality Scoring

| Score | Trigger | Action |
|-------|---------|--------|
| 10 | Fundraise/placing, PFS/feasibility, regulatory approval, acquisition, cybersecurity incident | **Alert Hugh immediately** + store |
| 8-9 | Results, strategic partnership, trading update, major contract | **Alert Hugh** + store |
| 5-7 | Board changes, grant/award, regulatory filing, capital markets events | Store + review |
| 1-4 | Holdings disclosure, own shares, block listing | Store |
| 0 | Routine administrative | Store |

### Research Director Structure
```
research/{slug}/
  index.md          — Master thesis (updated monthly)
  rns/             — All RNS files, newest first
  analyses/        — Ad-hoc thesis notes, one-off research
```

## Monthly Review Process

1. Pull all new RNS files for each company since last review
2. Score each against current thesis
3. If conviction should change: update index.md, log rationale
4. If new catalyst emerged: document in index.md Thesis Evaluation section
5. If thesis broken: flag to Hugh immediately

## Alert Thresholds

- **Score 8+:** Alert Hugh immediately (Telegram + research dir)
- **Score 5-7:** Store only, include in monthly review
- **Score 0-4:** Store, review quarterly

## Implementation

- **One-time backfill:** `scripts/rns-backfill.js` — populates research dirs from alert history
- **Ongoing:** `rns-watcher.js` writes RNS directly to `research/{slug}/rns/` on receipt
- **Alert routing:** Material score 8+ → Telegram alert → research dir
- **Material score 5-7:** Research dir only → monthly digest

## RNS Type Reference

Highly material (score 10):
- Fundraise, placing, oversubscribed offer
- PFS / feasibility study results
- Regulatory approval (FDA, MHRA, EMA)
- Acquisition, disposal, takeover
- Cybersecurity incident

Material (score 8):
- Annual / interim / final results
- Trading update / trading statement
- Strategic partnership or major collaboration
- Major contract or award

Watch (score 5-7):
- Board changes / director appointments
- Grant of options / RSU awards
- TR-1 notifications (holdings >3%)
- Capital markets events / investor days

Low (score 1-4):
- Transaction in own shares
- Total voting rights
- Block listing return
- Grant of options to employees

Routine (score 0):
- Form 8.3 (standard holdings disclosure)
- Very minor administrative
