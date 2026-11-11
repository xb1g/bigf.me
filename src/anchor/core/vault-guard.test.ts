import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VAULT_MAX_ATTEMPTS, VAULT_MAX_FAILURES, VAULT_WINDOW_MS, retryAfterSec, utf8ByteLength, windowLimited,
} from './vault-guard.ts';

test('utf8ByteLength counts bytes, not UTF-16 code units', () => {
  assert.equal(utf8ByteLength(''), 0);
  assert.equal(utf8ByteLength('abc'), 3);
  assert.equal(utf8ByteLength('฿'), 3);
  assert.equal('฿'.repeat(10).length, 10);
  assert.equal(utf8ByteLength('฿'.repeat(10)), 30);
  // One emoji is two UTF-16 code units and four UTF-8 bytes.
  assert.equal('🙂'.length, 2);
  assert.equal(utf8ByteLength('🙂'), 4);
});

test('the window refuses the request after the cap, and says how long to wait', () => {
  const open = { start: 5_000, attempts: VAULT_MAX_ATTEMPTS, failures: 0 };
  assert.equal(windowLimited(open), false);
  assert.equal(windowLimited({ ...open, attempts: VAULT_MAX_ATTEMPTS + 1 }), true);
  assert.equal(windowLimited({ start: 5_000, attempts: 1, failures: VAULT_MAX_FAILURES - 1 }), false);
  assert.equal(windowLimited({ start: 5_000, attempts: 1, failures: VAULT_MAX_FAILURES }), true);
  assert.equal(retryAfterSec({ start: 5_000, attempts: 1, failures: 0 }, 5_000), VAULT_WINDOW_MS / 1000);
  assert.equal(retryAfterSec({ start: 5_000, attempts: 1, failures: 0 }, 5_000 + VAULT_WINDOW_MS), 1);
});
