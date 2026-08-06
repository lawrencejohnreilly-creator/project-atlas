# Project Atlas — CBPI Backbone Instrument

Autonomous agents holding the Web4 constellation under continuous
measurement and attestation, conditioned under **draft-reilly-cbpi-00**
(Cognitive Behavioral Provenance and Integrity for Autonomous AI Agents).

Zero dependencies. Node built-ins only.

## Two tiers of load

**Web4 constellation (overhead)** — the eight live sites Atlas holds up:
remweb4.org, Sentinel Loop, HDRP, Orion, Multilarity, CBPI, Bulk Subtree
Proofs, Pegasus. Live DNS + HTTPS + content digest every epoch.

**Permanence anchor bed (underfoot)** — the external Dual-Layer Digital
Permanence anchors Atlas stands on, verified by the ninth agent
(**Anchor Agent**) every epoch:

| Anchor | Expectation |
| --- | --- |
| IETF Archive (`draft-reilly-atlas-00.txt`) | immutable |
| IETF Datatracker (`/doc/draft-reilly-atlas/`) | dynamic |
| FUNET internet-drafts mirror (Finland) | immutable |
| Zenodo DOI record (HDRP, 21501410) | dynamic |
| IPFS gateway ipfs.io (well-known CID) | immutable |
| IPFS gateway dweb.link (same CID) | immutable |
| OpenTimestamps calendar (alice.btc) | dynamic |
| GitHub profile (source of record) | dynamic |

Expectation semantics:

- **live** — own site. Digest change proposes a rebaseline in the
  Sentinel decision queue (auto-applied in autonomous mode).
- **dynamic** — external page expected to churn. Digest changes are
  rebaselined quietly (`refreshed`), never punished.
- **immutable** — archival object. A digest change is an
  **IMMUTABILITY VIOLATION**: high-magnitude punishment RER on the
  Anchor Agent, an FBA opens, and the rebaseline decision is **forced
  into the operator queue even in Fully Autonomous mode**. Accepting a
  mutated permanence anchor always requires a human.

Pending decisions are deduplicated per subject+action, so a persistent
finding holds one queue entry instead of one per epoch.

## Nine agents

Resolver · Reachability · Integrity · **Anchor** · Provenance ·
Conditioning Authority · Drift · FBA · Sentinel — hash-linked RERs,
Operant Provenance Chain (`/api/chain/verify` recomputes on demand),
per-agent Behavioral Drift Index with FBA at 0.35.

## API

`/api/state` · `/api/constellation` · `/api/epochs` · `/api/chain/verify`
· `/api/rer` · `/api/fba` · `/api/decisions` · `POST /api/mode`
· `POST /api/decisions/:id/approve|reject` · `/healthz`

Epoch payloads now seal `web4Up/web4Total` and `anchorsUp/anchorsTotal`
into the chain.

## Swapping anchors

Edit the `CONSTELLATION` array at the top of `agents.js`. Each entry is
`{ id, tier, expect, host, path, label }`. To pin your own IPFS deposits,
replace the well-known CID paths with your CIDs (content-addressed, so
`expect: 'immutable'` is a real cryptographic check). ftp.otenet.gr is
FTP-only and is not included in the HTTPS checker.

## Run locally

    node server.js
    # http://localhost:8080

State is in-memory per boot (Railway ephemeral); the chain genesis restamps
on each deploy.

— Lawrence John Reilly Jr. · REM Technologies & Consulting, LLC
