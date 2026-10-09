import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

test('API rate limiting returns 429 JSON after the configured budget', async () => {
  const t = await startTestApp({ overrides: { rateLimitPerMinute: 5 } });
  try {
    const statuses = []; for (let i = 0; i < 8; i++) statuses.push((await t.get('/health')).status);
    assert.equal(statuses.filter((s) => s === 200).length, 5); assert.equal(statuses.at(-1), 429);
    const r = await t.get('/health'); assert.equal(r.body.error.code, 'RATE_LIMITED');
  } finally { await t.stop(); }
});
