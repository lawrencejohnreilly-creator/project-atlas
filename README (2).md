# Project Atlas — CBPI Backbone Instrument

Autonomous agents holding up the Web4 constellation on the backend — fully
autonomous with human oversight — as a live reference implementation of
**draft-reilly-cbpi-00** (Cognitive Behavioral Provenance and Integrity for
Autonomous AI Agents), Reilly Protocol Suite.

Zero dependencies. Node built-ins only. Flat file layout for GitHub web
upload + Railway.

## What the agents do (every epoch, default 60s)

| Agent | Function |
|---|---|
| Resolver | Live DNS resolution of every constellation host |
| Reachability | Live HTTPS checks with latency against a 6s SLA |
| Integrity | SHA-256 content digests vs. stored baselines; flags drift |
| Provenance | Seals each epoch into the hash-linked Operant Provenance Chain |
| Conditioning Authority | Issues Reinforcement Event Records (R+ / P / EXT), hash-linked |
| Drift | Computes the Behavioral Drift Index (BDI) per agent |
| FBA | Opens Functional Behavior Assessments when BDI > 0.35 |
| Sentinel | Applies remediations — autonomous mode self-applies; oversight mode queues for operator approval |

## Constellation under load

remweb4.org · remweb4.org/sentinel · HDRP · Project Orion · Multilarity ·
CBPI · Bulk Subtree Proofs · Project Pegasus (edit CONSTELLATION in agents.js).

## API

- `GET /` — watch-floor dashboard
- `GET /api/state` — full instrument state
- `GET /api/constellation` — monitored endpoints + latest results
- `GET /api/epochs?limit=50` — Operant Provenance Chain
- `GET /api/chain/verify` — recompute and verify the chain
- `GET /api/rer?limit=100` — Reinforcement Event Records
- `GET /api/fba` — Functional Behavior Assessments
- `GET /api/decisions` — Sentinel decision queue
- `POST /api/decisions/:id/approve` | `/reject` — operator verdicts
- `POST /api/mode` — `{"mode":"autonomous"}` or `{"mode":"oversight"}`
- `GET /healthz`

## Optional operator key

Set env var `OPERATOR_KEY` on Railway; control endpoints then require the
`x-operator-key` header. Unset = open, matching the other suite instruments.

## Run locally

    node server.js
    # http://localhost:8080

State is in-memory per boot (Railway ephemeral); the chain genesis restamps
on each deploy.

— Lawrence John Reilly Jr. · REM Technologies & Consulting, LLC
