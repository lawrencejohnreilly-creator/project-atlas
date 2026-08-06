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

/* tier: 'web4'   — Lawrence's live constellation, held overhead.
 * tier: 'anchor' — external permanence anchors Atlas stands on
 *                  (Dual-Layer Digital Permanence: IETF, mirrors,
 *                  Zenodo DOI, IPFS, OpenTimestamps, GitHub).
 * expect: 'live'      — own site; digest change goes to the decision queue
 *         'dynamic'   — external page expected to churn; auto-rebaselined
 *         'immutable' — archival object; digest change = violation      */

const CONSTELLATION = [
  { id: 'remweb4',      tier: 'web4', expect: 'live', host: 'www.remweb4.org',                                path: '/',         label: 'REM Protocol (remweb4.org)' },
  { id: 'sentinel',     tier: 'web4', expect: 'live', host: 'www.remweb4.org',                                path: '/sentinel', label: 'Sentinel Loop' },
  { id: 'hdrp',         tier: 'web4', expect: 'live', host: 'hdrp-hypercube-site-production.up.railway.app',  path: '/',         label: 'HDRP / Project Rubik\u2019s Cube' },
  { id: 'orion',        tier: 'web4', expect: 'live', host: 'project-orion-production.up.railway.app',        path: '/',         label: 'Project Orion' },
  { id: 'multilarity',  tier: 'web4', expect: 'live', host: 'multilarity-web4-production.up.railway.app',     path: '/api/state',label: 'Multilarity Instrument' },
  { id: 'cbpi',         tier: 'web4', expect: 'live', host: 'cbpi-web4-production.up.railway.app',            path: '/',         label: 'CBPI Reference Instrument' },
  { id: 'subtree',      tier: 'web4', expect: 'live', host: 'bulk-subtree-proofs-production.up.railway.app',  path: '/',         label: 'Bulk Subtree Proofs Verifier' },
  { id: 'pegasus',      tier: 'web4', expect: 'live', host: 'project-pegasus-demo-production.up.railway.app', path: '/',         label: 'Project Pegasus' },

  /* Permanence anchor bed */
  { id: 'ietf-archive', tier: 'anchor', expect: 'immutable', host: 'www.ietf.org',                          path: '/archive/id/draft-reilly-atlas-00.txt', label: 'IETF Archive \u00b7 draft-reilly-atlas-00' },
  { id: 'datatracker',  tier: 'anchor', expect: 'dynamic',   host: 'datatracker.ietf.org',                  path: '/api/v1/doc/document/draft-reilly-atlas/?format=json', sla: 12000, label: 'IETF Datatracker (API)' },
  { id: 'funet',        tier: 'anchor', expect: 'immutable', host: 'www.nic.funet.fi',                      path: '/index/internet-drafts/draft-reilly-cogsov-00.txt', label: 'FUNET Mirror (Finland)' },
  { id: 'zenodo',       tier: 'anchor', expect: 'dynamic',   host: 'zenodo.org',                            path: '/records/21501410',                     label: 'Zenodo DOI Record (HDRP)' },
  { id: 'ipfs-io',      tier: 'anchor', expect: 'immutable', host: 'ipfs.io',                               path: '/ipfs/QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o', label: 'IPFS Gateway (ipfs.io)' },
  { id: 'dweb-link',    tier: 'anchor', expect: 'immutable', host: 'dweb.link',                             path: '/ipfs/QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o', label: 'IPFS Gateway (dweb.link)' },
  { id: 'ots-calendar', tier: 'anchor', expect: 'dynamic',   host: 'alice.btc.calendar.opentimestamps.org', path: '/',                                     label: 'OpenTimestamps Calendar' },
  { id: 'github',       tier: 'anchor', expect: 'dynamic',   host: 'github.com',                            path: '/lawrencejohnreilly-creator',           label: 'GitHub (source of record)' }
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

function headRequest(host, path, slaMs) {
  const SLA = slaMs || SLA_MS;
  return new Promise((resolve) => {
    const started = Date.now();
    const req = https.request(
      { host, path, method: 'GET', timeout: SLA, headers: { 'user-agent': 'atlas-cbpi/1.0' } },
      (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
          try {
            const loc = new URL(res.headers.location, 'https://' + host + path);
            res.resume();
            const started2 = Date.now();
            const req2 = https.request(
              { host: loc.host, path: loc.pathname + loc.search, method: 'GET', timeout: SLA, headers: { 'user-agent': 'atlas-cbpi/1.0' } },
              (res2) => {
                const chunks2 = []; let bytes2 = 0;
                res2.on('data', (c) => { bytes2 += c.length; if (bytes2 <= 65536) chunks2.push(c); });
                res2.on('end', () => resolve({
                  ok: res2.statusCode >= 200 && res2.statusCode < 400,
                  status: res2.statusCode,
                  ms: (Date.now() - started) ,
                  digest: sha256(Buffer.concat(chunks2).toString('utf8').slice(0, 65536)),
                  via: loc.host
                }));
              }
            );
            req2.on('timeout', () => { req2.destroy(); resolve({ ok: false, status: 0, ms: SLA, digest: null, err: 'timeout' }); });
            req2.on('error', (e) => resolve({ ok: false, status: 0, ms: Date.now() - started2, digest: null, err: e.code || 'error' }));
            req2.end();
            return;
          } catch (e) { /* fall through to normal handling */ }
        }
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
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, ms: SLA, digest: null, err: 'timeout' }); });
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

const AGENT_IDS = ['resolver', 'reachability', 'integrity', 'anchor', 'provenance', 'conditioning', 'drift', 'fba', 'sentinel'];
const AGENT_LABELS = {
  resolver: 'Resolver Agent', reachability: 'Reachability Agent', integrity: 'Integrity Agent',
  anchor: 'Anchor Agent', provenance: 'Provenance Agent', conditioning: 'Conditioning Authority',
  drift: 'Drift Agent', fba: 'FBA Agent', sentinel: 'Sentinel Agent'
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

function proposeRemediation(subject, action, detail, forcePending) {
  const existing = state.decisions.find((x) => x.subject === subject && x.action === action && x.status === 'pending');
  if (existing) return existing;
  const auto = state.mode === 'autonomous' && !forcePending;
  const d = {
    id: rid('DEC'),
    at: nowIso(),
    epoch: state.epoch,
    subject, action, detail,
    forced: !!forcePending,
    status: auto ? 'auto-applied' : 'pending',
    resolvedAt: auto ? nowIso() : null,
    resolvedBy: auto ? 'sentinel (autonomous)' : null
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
      const h = await headRequest(ep.host, ep.path, ep.sla);
      r.reachable = h.ok; r.status = h.status; r.latencyMs = h.ms; r.digest = h.digest; r.err = h.err || null;
    } else {
      r.reachable = false; r.status = 0; r.latencyMs = 0; r.digest = null; r.err = 'unresolved';
    }

    // Integrity Agent — digest vs baseline, judged by what the endpoint is.
    // Baselines seal ONLY on reachable responses: an error/404 body must
    // never become an archival baseline (false violation on recovery).
    r.tier = ep.tier; r.expect = ep.expect;
    if (r.reachable && r.digest) {
      const base = state.baselines[ep.id];
      if (!base) {
        state.baselines[ep.id] = { digest: r.digest, setAt: nowIso() };
        r.integrity = 'baselined';
      } else if (base.digest === r.digest) {
        r.integrity = 'stable';
      } else if (ep.expect === 'dynamic') {
        // External page expected to churn: refresh the baseline quietly.
        state.baselines[ep.id] = { digest: r.digest, setAt: nowIso() };
        r.integrity = 'refreshed';
      } else if (ep.expect === 'immutable') {
        // Archival object mutated under us. This is the one thing that
        // must never happen to a permanence anchor.
        r.integrity = 'violated';
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
  const web4 = eps.filter((e) => e.tier === 'web4');
  const anchors = eps.filter((e) => e.tier === 'anchor');
  const up = eps.filter((e) => e.reachable).length;
  const web4Up = web4.filter((e) => e.reachable).length;
  const anchorsUp = anchors.filter((e) => e.reachable).length;

  // Record agent behaviors for the field agents
  const resolveOk = eps.every((e) => e.resolved);
  const resolveMs = Math.round(eps.reduce((s, e) => s + e.resolveMs, 0) / eps.length);
  recordBehavior('resolver', resolveOk, resolveMs);

  const reachOk = web4Up === web4.length;
  const reachMs = Math.round(web4.reduce((s, e) => s + (e.latencyMs || SLA_MS), 0) / web4.length);
  recordBehavior('reachability', web4Up > 0, reachMs);

  const changed = eps.filter((e) => e.integrity === 'changed');
  const violated = eps.filter((e) => e.integrity === 'violated');
  recordBehavior('integrity', violated.length === 0, 5);

  // Anchor Agent — holds the permanence anchor bed (Dual-Layer Digital Permanence)
  const anchorOk = anchorsUp === anchors.length && violated.length === 0;
  const anchorMs = anchors.length ? Math.round(anchors.reduce((s, e) => s + (e.latencyMs || SLA_MS), 0) / anchors.length) : 0;
  recordBehavior('anchor', anchorOk, anchorMs);

  /* 5: Conditioning Authority — issue RERs against observed behavior */
  const condStart = Date.now();
  if (resolveOk) issueRER('resolver', 'R+', 'all hosts resolved', 0.2);
  else issueRER('resolver', 'P', 'resolution failure on one or more hosts', 0.6);
  if (reachOk) issueRER('reachability', 'R+', web4Up + '/' + web4.length + ' constellation endpoints reachable within SLA', 0.2);
  else issueRER('reachability', 'P', 'constellation reachability degraded: ' + web4Up + '/' + web4.length, Math.min(1, (web4.length - web4Up) / web4.length));
  if (changed.length === 0 && violated.length === 0) issueRER('integrity', 'R+', 'all digests conforming to expectation', 0.2);
  else if (changed.length) issueRER('integrity', 'P', 'content digest changed: ' + changed.map((c) => c.id).join(', '), 0.4);
  if (anchorsUp === anchors.length) issueRER('anchor', 'R+', anchorsUp + '/' + anchors.length + ' permanence anchors verified (IETF \u00b7 mirror \u00b7 Zenodo \u00b7 IPFS \u00b7 OTS \u00b7 GitHub)', 0.2);
  else issueRER('anchor', 'P', 'anchor bed degraded: ' + anchors.filter((a) => !a.reachable).map((a) => a.id).join(', '), Math.min(1, (anchors.length - anchorsUp) / anchors.length));
  for (const v of violated) {
    issueRER('anchor', 'P', 'IMMUTABILITY VIOLATION: archival digest changed on ' + v.id, 0.9);
  }
  recordBehavior('conditioning', true, Date.now() - condStart);

  /* 6: Drift Agent — BDI per agent */
  const driftStart = Date.now();
  const bdis = {};
  for (const a of AGENT_IDS) bdis[a] = computeBDI(a);
  recordBehavior('drift', true, Date.now() - driftStart);

  /* 7: FBA Agent — Functional Behavior Assessment on drift breach */
  const fbaStart = Date.now();
  for (const a of ['resolver', 'reachability', 'integrity', 'anchor']) {
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
  for (const v of violated) {
    const fba = {
      id: rid('FBA'), at: nowIso(), epoch: state.epoch, agent: 'anchor', bdi: state.agents.anchor.bdi,
      antecedent: 'archival object ' + v.id + ' (' + v.label + ') expected immutable',
      behavior: 'content digest deviated from sealed baseline',
      consequence: 'permanence attestation for ' + v.id + ' suspended pending operator review',
      proposed: 'rebaseline'
    };
    state.fbas.push(fba);
    if (state.fbas.length > MAX_FBA) state.fbas.splice(0, state.fbas.length - MAX_FBA);
    proposeRemediation(v.id, 'rebaseline', 'IMMUTABILITY VIOLATION on ' + v.label + ' \u2014 accepting a new baseline for an archival object requires the operator, even in autonomous mode', true);
  }
  recordBehavior('fba', true, Date.now() - fbaStart);
  recordBehavior('sentinel', true, 2);

  /* 4: Provenance Agent — seal the epoch into the Operant Provenance Chain */
  const payload = {
    epoch: state.epoch,
    at: nowIso(),
    mode: state.mode,
    up, total: eps.length,
    web4Up, web4Total: web4.length,
    anchorsUp, anchorsTotal: anchors.length,
    endpoints: eps.map((e) => ({ id: e.id, tier: e.tier, resolved: e.resolved, reachable: e.reachable, status: e.status, ms: e.latencyMs, integrity: e.integrity, digest: e.digest })),
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
