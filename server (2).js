/*
 * PROJECT ATLAS — server
 * Zero-dependency Node HTTP server. Serves the watch-floor dashboard
 * and the CBPI API surface. Port 8080 (Railway PORT respected).
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { state, CONSTELLATION, start, verifyChain, resolveDecision, EPOCH_MS } = require('./agents.js');

const PORT = process.env.PORT || 8080;
const OPERATOR_KEY = process.env.OPERATOR_KEY || null; // optional; if set, control endpoints require x-operator-key

const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function authorized(req) {
  if (!OPERATOR_KEY) return true;
  return req.headers['x-operator-key'] === OPERATOR_KEY;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(INDEX);
  }

  if (p === '/healthz') return json(res, 200, { ok: true, epoch: state.epoch, mode: state.mode });

  if (p === '/api/state') {
    return json(res, 200, {
      instrument: 'Project Atlas \u2014 CBPI Backbone Instrument',
      draft: 'draft-reilly-cbpi-00',
      bootAt: state.bootAt,
      mode: state.mode,
      epoch: state.epoch,
      epochMs: EPOCH_MS,
      lastEpochAt: state.lastEpochAt,
      chainHead: state.chainHead,
      rerHead: state.lastRerHash,
      agents: state.agents,
      constellation: state.constellation,
      baselines: state.baselines,
      pendingDecisions: state.decisions.filter((d) => d.status === 'pending').length,
      counts: { epochs: state.epochs.length, rers: state.rers.length, fbas: state.fbas.length, decisions: state.decisions.length }
    });
  }

  if (p === '/api/constellation') return json(res, 200, { endpoints: CONSTELLATION, latest: state.constellation });

  if (p === '/api/epochs') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 720);
    return json(res, 200, { head: state.chainHead, epochs: state.epochs.slice(-limit) });
  }

  if (p === '/api/chain/verify') return json(res, 200, verifyChain());

  if (p === '/api/rer') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1500);
    return json(res, 200, { head: state.lastRerHash, records: state.rers.slice(-limit) });
  }

  if (p === '/api/fba') return json(res, 200, { records: state.fbas.slice(-100) });

  if (p === '/api/decisions' && req.method === 'GET') {
    return json(res, 200, { mode: state.mode, decisions: state.decisions.slice(-100).reverse() });
  }

  if (p === '/api/mode' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 401, { error: 'operator key required' });
    const body = await readBody(req);
    if (body.mode === 'autonomous' || body.mode === 'oversight') {
      state.mode = body.mode;
      return json(res, 200, { mode: state.mode });
    }
    return json(res, 400, { error: 'mode must be "autonomous" or "oversight"' });
  }

  const decisionMatch = p.match(/^\/api\/decisions\/(DEC-[0-9a-f]+)\/(approve|reject)$/);
  if (decisionMatch && req.method === 'POST') {
    if (!authorized(req)) return json(res, 401, { error: 'operator key required' });
    const d = resolveDecision(decisionMatch[1], decisionMatch[2] === 'approve' ? 'approved' : 'rejected', 'operator');
    if (!d) return json(res, 404, { error: 'no pending decision with that id' });
    return json(res, 200, { decision: d });
  }

  json(res, 404, { error: 'not found', paths: ['/', '/api/state', '/api/constellation', '/api/epochs', '/api/chain/verify', '/api/rer', '/api/fba', '/api/decisions', 'POST /api/mode', 'POST /api/decisions/:id/approve|reject'] });
});

server.listen(PORT, () => {
  console.log('[atlas] CBPI Backbone Instrument listening on :' + PORT);
  start();
});
