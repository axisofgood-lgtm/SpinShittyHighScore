// SPIN SH*TTY high score board — Netlify Function + Netlify Blobs
//   GET  /api/scores            -> { top: [{ n, s }, ...] }            the worldwide top 10
//   GET  /api/scores?start=1    -> { token }                           handed out when a shift starts
//   POST /api/scores            { name, score, token } -> { top, rank }
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const STORE = 'life-cycle-scores';
const MAX_ROWS = 10;
const MIN_SHIFT_SECONDS = 30;          // a score can't arrive sooner than this after its shift began
const MAX_TOKEN_AGE = 60 * 60;         // tokens expire after an hour
const POINTS_PER_SECOND = 600;         // generous ceiling on how fast points can be earned
const BONUS_ALLOWANCE = 8000;          // end-of-shift tips + bonuses
const SUBMIT_GAP_SECONDS = 20;         // one submission per address per 20 s

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

async function secretFor(store) {
  if (process.env.SCORE_SECRET) return process.env.SCORE_SECRET;
  let s = await store.get('secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); await store.set('secret', s); }
  return s;
}
const sign = (secret, msg) => crypto.createHmac('sha256', secret).update(msg).digest('hex').slice(0, 32);

async function readTop(store) {
  const top = await store.get('top', { type: 'json' });
  return Array.isArray(top) ? top : [];
}
const publicTop = top => top.map(r => ({ n: r.n, s: r.s }));

export default async (req, context) => {
  // strong consistency: a score is visible to everyone the moment it is saved (the default can lag up to a minute)
  const store = getStore({ name: STORE, consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.searchParams.has('start')) {
      const secret = await secretFor(store);
      const ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(9).toString('hex');
      return json({ token: `${ts}.${nonce}.${sign(secret, ts + '.' + nonce)}` });
    }
    return json({ top: publicTop(await readTop(store)) });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const name = String(body.name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const score = Number(body.score);
  if (!name) return json({ error: 'initials needed' }, 400);
  if (!Number.isInteger(score) || score <= 0 || score > 99999) return json({ error: 'bad score' }, 400);

  // the shift token: signed by us, old enough, not too old, and only used once
  const secret = await secretFor(store);
  const [ts, nonce, sig] = String(body.token || '').split('.');
  const age = Math.floor(Date.now() / 1000) - Number(ts);
  if (!ts || !nonce || sig !== sign(secret, ts + '.' + nonce)) return json({ error: 'no shift found' }, 403);
  if (age < MIN_SHIFT_SECONDS || age > MAX_TOKEN_AGE) return json({ error: 'shift too short or too old' }, 403);
  if (score > age * POINTS_PER_SECOND + BONUS_ALLOWANCE) return json({ error: 'score too high' }, 403);
  if (await store.get('used/' + nonce)) return json({ error: 'already saved' }, 409);

  // light rate limit per address
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const ipKey = 'ip/' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
  const last = Number(await store.get(ipKey)) || 0;
  if (Date.now() / 1000 - last < SUBMIT_GAP_SECONDS) return json({ error: 'slow down' }, 429);
  await store.set(ipKey, String(Math.floor(Date.now() / 1000)));
  await store.set('used/' + nonce, '1');

  // insert and keep the top 10 (retry if two people save at the same moment)
  const row = { n: name.padEnd(3, ' '), s: score, t: Date.now(), id: nonce };
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata('top', { type: 'json' });
    const top = Array.isArray(cur && cur.data) ? cur.data : [];
    const next = [...top, row].sort((a, b) => b.s - a.s || a.t - b.t).slice(0, MAX_ROWS);
    const opts = cur && cur.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON('top', next, opts);
    if (!res || res.modified !== false) {
      const rank = next.findIndex(r => r.id === nonce);
      return json({ top: publicTop(next), rank });
    }
  }
  return json({ error: 'busy, try again' }, 503);
};

export const config = { path: '/api/scores' };
