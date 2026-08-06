/*
 * PROJECT ATLAS — CBPI Backbone Instrument
 * Autonomous agents holding up the Web4 constellation, conditioned and
 * attested under draft-reilly-cbpi-00 (Cognitive Behavioral Provenance
 * and Integrity for Autonomous AI Agents).
 *
 * Zero dependencies. Node built-ins only: crypto, dns, https.
 * Author of record: Lawrence John Reilly Jr. — Reilly Protocol Suite.
 */

'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const https = require('https');

/* ------------------------------------------------------------------ */
/* Constellation under load — the live Web4 endpoints Atlas holds up.  */
/* ------------------------------------------------------------------ */

const CONSTELLATION = [
  { id: 'remweb4',      host: 'remweb4.org',                                    path: '/',         label: 'REM Protocol (remweb4.org)' },
  { id: 'sentinel',     host: 'remweb4.org',                                    path: '/sentinel', label: 'Sentinel Loop' },
  { id: 'hdrp',         host: 'hdrp-hypercube-site-production.up.railway.app',  path: '/',         label: 'HDRP / Project Rubik\u2019s Cube' },
  { id: 'orion',        host: 'project-orion-production.up.railway.app',        path: '/',         label: 'Project Orion' },
  { id: 'multilarity',  host: 'multilarity-web4-production.up.railway.app',     path: '/api/state',label: 'Multilarity Instrument' },
  { id: 'cbpi',         host: 'cbpi-web4-production.up.railway.app',            path: '/',         label: 'CBPI Reference Instrument' },
  { id: 'subtree',      host: 'bulk-subtree-proofs-production.up.railway.app',  path: '/',         label: 'Bulk Subtree Proofs Verifier' },
  { id: 'pegasus',      host: 'project-pegasus-demo-production.up.railway.app', path: '/',         label: 'Project Pegasus' }
];

/* ------------------------------------------------------------------ */
/* Caps and tunables                                                   */
/* ------------------------------------------------------------------ */

const EPOCH_MS = parseInt(process.env.EPOCH_MS || '60000', 10);   // one epoch per minute
const MAX_EPOCHS = 720;       // ~12h of chain kept in memory
const MAX_RER = 1500;         // reinforcement event records kept
const MAX_FBA = 200;
const MAX_DECISIONS = 200;
const BDI_WINDOW = 20;        // rolling behavior window per agent
const BDI_THRESHOLD = 0.35;   // FBA trigger
const SLA_MS = 6000;          // reachability SLA per endpoint

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function nowIso() { return new Date().toISOString(); }
function rid(prefix) { return prefix + '-' + crypto.randomBytes(4).toString('hex'); }

function headRequest(host, path) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = https.request(
      { host, path, method: 'GET', timeout: SLA_MS, headers: { 'user-agent': 'atlas-cbpi/1.0' } },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (c) => { bytes += c.length; if (bytes <= 65536) chunks.push(c); });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            ms: Date.now() - started,
            digest: sha256(Buffer.concat(chunks).toString('utf8').slice(0, 65536))
          });
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, ms: SLA_MS, digest: null, err: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, status: 0, ms: Date.now() - started, digest: null, err: e.code || 'error' }));
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  bootAt: nowIso(),
  mode: 'oversight',                 // 'autonomous' | 'oversight'
  epoch: 0,
  epochs: [],                        // hash-linked Operant Provenance Chain
  lastEpochAt: null,
  rers: [],                          // Reinforcement Event Records (hash-linked)
  lastRerHash: 'GENESIS-RER',
  fbas: [],                          // Functional Behavior Assessments
  decisions: [],                     // Sentinel decision queue (oversight mode)
  constellation: {},                 // per-endpoint latest results
  baselines: {},                     // integrity baselines per endpoint
  agents: {},                        // per-agent behavior windows + BDI
  chainHead: 'GENESIS-ATLAS',
  running: false
};

const AGENT_IDS = ['resolver', 'reachability', 'integrity', 'provenance', 'conditioning', 'drift', 'fba', 'sentinel'];
const AGENT_LABELS = {
  resolver: 'Resolver Agent', reachability: 'Reachability Agent', integrity: 'Integrity Agent',
  provenance: 'Provenance Agent', conditioning: 'Conditioning Authority', drift: 'Drift Agent',
  fba: 'FBA Agent', sentinel: 'Sentinel Agent'
};
for (const a of AGENT_IDS) state.agents[a] = { id: a, label: AGENT_LABELS[a], window: [], bdi: 0, status: 'idle', lastMs: 0, successRate: 1 };

/* ------------------------------------------------------------------ */
/* CBPI: Reinforcement Event Records (draft-reilly-cbpi-00)            */
/* ------------------------------------------------------------------ */

function issueRER(agentId, type, reason, magnitude) {
  // type: 'R+' (positive reinforcement) | 'P' (punishment) | 'EXT' (extinction)
  const rer = {
    id: rid('RER'),
    at: nowIso(),
    epoch: state.epoch,
    agent: agentId,
    type, reason,
    magnitude: Math.round(magnitude * 1000) / 1000,
    prev: state.lastRerHash
  };
  rer.hash = sha256(JSON.stringify({ ...rer, hash: undefined }));
  state.lastRerHash = rer.hash;
  state.rers.push(rer);
  if (state.rers.length > MAX_RER) state.rers.splice(0, state.rers.length - MAX_RER);
  return rer;
}

function recordBehavior(agentId, ok, ms) {
  const a = state.agents[agentId];
  a.window.push({ ok: ok ? 1 : 0, ms });
  if (a.window.length > BDI_WINDOW) a.window.shift();
  a.lastMs = ms;
  a.successRate = a.window.reduce((s, w) => s + w.ok, 0) / a.window.length;
  a.status = ok ? 'nominal' : 'faulted';
}

/* Behavioral Drift Index: deviation of recent behavior from the agent's
 * own established baseline (first half of window vs second half),
 * blended with failure rate. 0 = fully conditioned, 1 = full drift.   */
function computeBDI(agentId) {
  const a = state.agents[agentId];
  const w = a.window;
  if (w.length < 6) { a.bdi = 0; return 0; }
  const half = Math.floor(w.length / 2);
  const early = w.slice(0, half), late = w.slice(half);
  const mean = (arr) => arr.reduce((s, x) => s + x.ms, 0) / arr.length;
  const mEarly = Math.max(mean(early), 1), mLate = Math.max(mean(late), 1);
  const latencyDrift = Math.min(Math.abs(mLate - mEarly) / mEarly, 1);
  const failRate = 1 - a.successRate;
  a.bdi = Math.round((0.5 * latencyDrift + 0.5 * failRate) * 1000) / 1000;
  return a.bdi;
}

/* ------------------------------------------------------------------ */
/* Sentinel remediation + human oversight queue                        */
/* ------------------------------------------------------------------ */

function proposeRemediation(subject, action, detail) {
  const d = {
    id: rid('DEC'),
    at: nowIso(),
    epoch: state.epoch,
    subject, action, detail,
    status: state.mode === 'autonomous' ? 'auto-applied' : 'pending',
    resolvedAt: state.mode === 'autonomous' ? nowIso() : null,
    resolvedBy: state.mode === 'autonomous' ? 'sentinel (autonomous)' : null
  };
  state.decisions.push(d);
  if (state.decisions.length > MAX_DECISIONS) state.decisions.splice(0, state.decisions.length - MAX_DECISIONS);
  if (d.status === 'auto-applied') applyRemediation(d);
  return d;
}

function applyRemediation(d) {
  if (d.action === 'rebaseline' && state.baselines[d.subject]) {
    state.baselines[d.subject] = { digest: state.constellation[d.subject] && state.constellation[d.subject].digest, setAt: nowIso() };
  }
  if (d.action === 'reset-window' && state.agents[d.subject]) {
    state.agents[d.subject].window = [];
    state.agents[d.subject].bdi = 0;
  }
  issueRER('sentinel', 'R+', 'remediation applied: ' + d.action + ' \u2192 ' + d.subject, 0.5);
}

function resolveDecision(id, verdict, who) {
  const d = state.decisions.find((x) => x.id === id && x.status === 'pending');
  if (!d) return null;
  d.status = verdict; // 'approved' | 'rejected'
  d.resolvedAt = nowIso();
  d.resolvedBy = who || 'operator';
  if (verdict === 'approved') applyRemediation(d);
  else issueRER('sentinel', 'EXT', 'remediation rejected by operator: ' + d.action + ' \u2192 ' + d.subject, 0.3);
  return d;
}

/* ------------------------------------------------------------------ */
/* Epoch loop — the eight agents                                       */
/* ------------------------------------------------------------------ */

async function runEpoch() {
  if (state.running) return;
  state.running = true;
  state.epoch += 1;
  const epochStart = Date.now();
  const results = { endpoints: {} };

  /* 1 + 2 + 3: Resolver, Reachability, Integrity — per endpoint */
  await Promise.all(CONSTELLATION.map(async (ep) => {
    const r = { id: ep.id, host: ep.host, path: ep.path, label: ep.label };

    // Resolver Agent — live DNS
    const t0 = Date.now();
    try {
      const addr = await dns.lookup(ep.host);
      r.address = addr.address;
      r.resolved = true;
    } catch (e) {
      r.resolved = false; r.address = null;
    }
    r.resolveMs = Date.now() - t0;

    // Reachability Agent — live HTTPS
    if (r.resolved) {
      const h = await headRequest(ep.host, ep.path);
      r.reachable = h.ok; r.status = h.status; r.latencyMs = h.ms; r.digest = h.digest; r.err = h.err || null;
    } else {
      r.reachable = false; r.status = 0; r.latencyMs = 0; r.digest = null; r.err = 'unresolved';
    }

    // Integrity Agent — digest vs baseline
    if (r.digest) {
      const base = state.baselines[ep.id];
      if (!base) {
        state.baselines[ep.id] = { digest: r.digest, setAt: nowIso() };
        r.integrity = 'baselined';
      } else if (base.digest === r.digest) {
        r.integrity = 'stable';
      } else {
        r.integrity = 'changed';
      }
    } else {
      r.integrity = 'unknown';
    }

    r.at = nowIso();
    results.endpoints[ep.id] = r;
    state.constellation[ep.id] = r;
  }));

  const eps = Object.values(results.endpoints);
  const up = eps.filter((e) => e.reachable).length;

  // Record agent behaviors for the three field agents
  const resolveOk = eps.every((e) => e.resolved);
  const resolveMs = Math.round(eps.reduce((s, e) => s + e.resolveMs, 0) / eps.length);
  recordBehavior('resolver', resolveOk, resolveMs);

  const reachOk = up === eps.length;
  const reachMs = Math.round(eps.reduce((s, e) => s + (e.latencyMs || SLA_MS), 0) / eps.length);
  recordBehavior('reachability', up > 0, reachMs);

  const changed = eps.filter((e) => e.integrity === 'changed');
  recordBehavior('integrity', true, 5);

  /* 5: Conditioning Authority — issue RERs against observed behavior */
  const condStart = Date.now();
  if (resolveOk) issueRER('resolver', 'R+', 'all hosts resolved', 0.2);
  else issueRER('resolver', 'P', 'resolution failure on one or more hosts', 0.6);
  if (reachOk) issueRER('reachability', 'R+', up + '/' + eps.length + ' endpoints reachable within SLA', 0.2);
  else issueRER('reachability', 'P', 'reachability degraded: ' + up + '/' + eps.length, Math.min(1, (eps.length - up) / eps.length));
  if (changed.length === 0) issueRER('integrity', 'R+', 'all digests stable against baseline', 0.2);
  else issueRER('integrity', 'P', 'content digest changed: ' + changed.map((c) => c.id).join(', '), 0.4);
  recordBehavior('conditioning', true, Date.now() - condStart);

  /* 6: Drift Agent — BDI per agent */
  const driftStart = Date.now();
  const bdis = {};
  for (const a of AGENT_IDS) bdis[a] = computeBDI(a);
  recordBehavior('drift', true, Date.now() - driftStart);

  /* 7: FBA Agent — Functional Behavior Assessment on drift breach */
  const fbaStart = Date.now();
  for (const a of ['resolver', 'reachability', 'integrity']) {
    if (bdis[a] > BDI_THRESHOLD) {
      const fba = {
        id: rid('FBA'), at: nowIso(), epoch: state.epoch, agent: a, bdi: bdis[a],
        antecedent: 'behavior window shift beginning epoch ' + Math.max(1, state.epoch - BDI_WINDOW),
        behavior: 'BDI ' + bdis[a] + ' exceeds threshold ' + BDI_THRESHOLD,
        consequence: 'endpoint attestations from this agent flagged low-confidence until reconditioned',
        proposed: 'reset-window'
      };
      state.fbas.push(fba);
      if (state.fbas.length > MAX_FBA) state.fbas.splice(0, state.fbas.length - MAX_FBA);
      issueRER(a, 'EXT', 'FBA opened: ' + fba.id, bdis[a]);
      proposeRemediation(a, 'reset-window', 'FBA ' + fba.id + ': recondition agent behavior window (BDI ' + bdis[a] + ')');
    }
  }
  for (const c of changed) {
    proposeRemediation(c.id, 'rebaseline', 'Integrity digest changed on ' + c.label + '; accept new content as baseline');
  }
  recordBehavior('fba', true, Date.now() - fbaStart);
  recordBehavior('sentinel', true, 2);

  /* 4: Provenance Agent — seal the epoch into the Operant Provenance Chain */
  const payload = {
    epoch: state.epoch,
    at: nowIso(),
    mode: state.mode,
    up, total: eps.length,
    endpoints: eps.map((e) => ({ id: e.id, resolved: e.resolved, reachable: e.reachable, status: e.status, ms: e.latencyMs, integrity: e.integrity, digest: e.digest })),
    bdis,
    rerHead: state.lastRerHash,
    pendingDecisions: state.decisions.filter((d) => d.status === 'pending').length,
    epochMs: Date.now() - epochStart
  };
  const record = { ...payload, prev: state.chainHead };
  record.hash = sha256(JSON.stringify({ ...record, hash: undefined }));
  state.chainHead = record.hash;
  state.epochs.push(record);
  if (state.epochs.length > MAX_EPOCHS) state.epochs.splice(0, state.epochs.length - MAX_EPOCHS);
  recordBehavior('provenance', true, 3);
  issueRER('provenance', 'R+', 'epoch ' + state.epoch + ' sealed at ' + record.hash.slice(0, 12), 0.2);

  state.lastEpochAt = nowIso();
  state.running = false;
}

function verifyChain() {
  let prev = null;
  for (let i = 0; i < state.epochs.length; i++) {
    const r = state.epochs[i];
    if (prev !== null && r.prev !== prev) return { valid: false, brokenAt: r.epoch };
    const recomputed = sha256(JSON.stringify({ ...r, hash: undefined }));
    if (recomputed !== r.hash) return { valid: false, brokenAt: r.epoch };
    prev = r.hash;
  }
  return { valid: true, length: state.epochs.length, head: state.chainHead };
}

function start() {
  runEpoch();
  setInterval(runEpoch, EPOCH_MS);
}

module.exports = { state, CONSTELLATION, start, verifyChain, resolveDecision, EPOCH_MS };
