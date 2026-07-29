# top-companies-watch

Hourly GitHub Actions watcher (separate from `job-alert-bot` and
`career-ops-watch`) covering your curated top-201 ranked company list plus
Fortune 500 companies that resolve to a **real, verified ATS board** — not a
guessed or fabricated one.

**Scope**: same as career-ops-watch — Summer 2027 internships, USA-based
only, in Data Scientist/Applied DS/Research Data Scientist, SWE (+ ML/
Platform Engineer variants), Applied/Research Scientist/GenAI/LLM/Agentic,
and Quant Research + Quant Trading.

## How the company list was built (2026-07-29)

1. Started from a curated, ranked 201-company list (3 knowledge-recall passes
   across Big Tech/AI labs, funded AI startups, quant trading firms, and SWE
   growth startups — deduped and ranked by role fit / comp / reputation /
   culture; saved separately at
   `/Users/jayitsaha/Documents/APPLICATIONS/top_companies_ranked.json`).
2. Fetched the real 2023 Fortune 500 dataset (505 companies,
   [EatMoreOranges/Fortune-500-Dataset](https://github.com/EatMoreOranges/Fortune-500-Dataset))
   — a live snapshot, not LLM-recalled.
3. Merged + deduped against the curated 201 → 686 unique target companies.
4. **Resolved each to a real board two ways, no guessing**:
   - Live-probed `discover-ats.mjs` (Greenhouse/Ashby/Lever direct APIs) — 96 resolved.
   - Name-matched against the same public `job-board-aggregator` dataset
     `scan-ats-full.mjs` already uses for its 38k-company reverse discovery
     (covers Workday/iCIMS too, which can't be live-guessed by name alone) —
     300 resolved total once combined (141 of which via Workday alone).
5. Final list: **300 companies with a working, verified `careers_url`**
   (`config/companies.json`) — 148 of these are genuinely new beyond the
   curated 201 (real Fortune 500 additions: Boeing, Citigroup, Comcast,
   BlackRock, Amgen, Broadcom, AT&T, and more).

**Honest limit**: 349 of the merged 686 didn't resolve to anything scannable
via zero-token methods (mostly Fortune 500 companies on fully custom career
sites with no supported ATS at all — not fixable without literally driving a
browser per company, which isn't zero-token anymore).

## Architecture

15 parallel batch legs (20 companies each, `scripts/scan-leg.mjs`), each:
1. Shallow-clones the latest upstream `career-ops` fresh.
2. Generates a per-batch `portals.yml` (shared filters from `config/
   filters.yml` + that batch's slice of `config/companies.json` as
   `tracked_companies`).
3. Runs `node scan.mjs` against just that batch.
4. Uploads offers + its own `scan-history.tsv`/`portal-health.tsv` delta.

An `aggregate` job merges all 15 batches (dedup by URL), applies the hard
"must mention 2027" gate, judges relevance/tier/action via NVIDIA NIM in
parallel chunks across a key pool (`NIM_API_KEYS`, round-robin), sends one
Telegram report, and persists each batch's own state back to `state/`.

## Required repo secrets

- `NIM_API_KEYS` — same comma-separated key pool as career-ops-watch
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — same bot as the other two watchers

Optional repo variable: `NIM_MODEL` (defaults to `meta/llama-3.1-70b-instruct`).
