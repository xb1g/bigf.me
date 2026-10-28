import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState } from '../core/types.ts';
import { createSeedState, emptyState } from '../core/seed.ts';
import { migrate } from '../core/store.ts';
import { decryptJSON, encryptJSON, WrongPassphraseError, BadEnvelopeError } from '../core/crypto.ts';
import { MAX_STATE_BYTES } from '../core/constants.ts';
import {
  BACKUP_TOO_BIG_COPY, MAX_IMPORT_BYTES, backupTooBigToRestore, exportText,
  BUILD_TARGET_OPTIONS, IMPORT_COPY, LOCK_AFTER_OPTIONS, SYNC_ERROR_COPY, TOKEN_KEY, PASS_KEY,
  backupCounts, backupFilename, deviceSummary, importErrorCopy, buildTargetSummary, buildTargetValue, classifyHttp, conflictText, errorCodeOf,
  exportPayload, formatBytes, hasUnsyncedChanges, lockAfterLabel, looksLikeAnchor, maxBetsNote, newPassphraseIssue,
  newPinIssue, parseBackupText, parseGetBody, parsePutBody, previewRows, syncErrorCopy, syncStatusText, tokenIssue,
  totalItems, utf8Bytes,
} from './settings.logic.ts';
import type { SyncErrorCode } from './settings.logic.ts';

const NOW = new Date('2026-10-28T05:00:00.000Z'); // 12:00 Bangkok

function withPin(s: AnchorState): AnchorState {
  return { ...s, lock: { pinHash: 'aGFzaA==', pinSalt: 'c2FsdA==', lockAfterMin: 15 }, sync: { rev: 7, lastSyncedAt: NOW.toISOString() } };
}

test('device-local keys use the anchor: prefix so erase removes them', () => {
  assert.ok(TOKEN_KEY.startsWith('anchor:'));
  assert.ok(PASS_KEY.startsWith('anchor:'));
});

test('build target options and lookup', () => {
  assert.deepEqual(BUILD_TARGET_OPTIONS.map((o) => o.label), ['30%', '40%', '50%', '60%', '70%']);
  assert.equal(buildTargetValue(0.5), '0.5');
  assert.equal(buildTargetValue(0.30000000000000004), '0.3');
  assert.equal(buildTargetValue(0.55), '');
  assert.equal(buildTargetSummary(0.5), '50% build · 50% sell & talk');
  assert.equal(buildTargetSummary(0.4), '40% build · 60% sell & talk');
  assert.match(BUILD_TARGET_OPTIONS[0].ariaLabel, /30% build, 70% sell/);
});

test('maxBetsNote only speaks when over the limit', () => {
  assert.equal(maxBetsNote(3, 3), null);
  assert.equal(maxBetsNote(1, 3), null);
  assert.match(maxBetsNote(4, 2) ?? '', /4 active bets.*Park 2/);
});

test('lockAfterLabel and options', () => {
  assert.equal(lockAfterLabel(0), 'as soon as you leave the app');
  assert.equal(lockAfterLabel(1), 'after 1 minute away');
  assert.equal(lockAfterLabel(5), 'after 5 minutes away');
  assert.ok(LOCK_AFTER_OPTIONS.some((o) => o.value === '5'));
});

test('exportPayload strips the PIN hash and sync bookkeeping, keeps the data', () => {
  const s = withPin(createSeedState(NOW));
  s.talks.push({ id: 't1', date: '2026-10-28', role: 'parent', channel: 'call', did: 'Paid', story: '', opinion: '' });
  const out = exportPayload(s);
  assert.equal(out.lock.pinHash, undefined);
  assert.equal(out.lock.pinSalt, undefined);
  assert.equal(out.lock.lockAfterMin, 15);
  assert.deepEqual(out.sync, { rev: 0 });
  assert.equal(out.talks.length, 1);
  assert.equal(out.bets.length, s.bets.length);
  // Does not mutate the input.
  assert.equal(s.lock.pinHash, 'aGFzaA==');
  assert.equal(s.sync.rev, 7);
  // Round-trips through migrate unchanged (apart from what we stripped).
  const back = migrate(JSON.parse(JSON.stringify(out)), NOW);
  assert.deepEqual(back.talks, out.talks);
  assert.deepEqual(back.profile, s.profile);
});

test('backupFilename', () => {
  assert.equal(backupFilename('2026-10-28', false), 'anchor-backup-2026-10-28.json');
  assert.equal(backupFilename('2026-10-28', true), 'anchor-backup-2026-10-28.encrypted.json');
});

test('looksLikeAnchor', () => {
  assert.equal(looksLikeAnchor(emptyState(NOW)), true);
  assert.equal(looksLikeAnchor({ talks: [] }), true);
  assert.equal(looksLikeAnchor({ hello: 'world' }), false);
  assert.equal(looksLikeAnchor([]), false);
  assert.equal(looksLikeAnchor(null), false);
  assert.equal(looksLikeAnchor('x'), false);
  assert.equal(looksLikeAnchor({ talks: null }), false);
});

test('parseBackupText classifies plain, encrypted and invalid files', async () => {
  const plain = parseBackupText(JSON.stringify(exportPayload(createSeedState(NOW))));
  assert.equal(plain.kind, 'plain');

  const bom = parseBackupText('﻿' + JSON.stringify({ schemaVersion: 1 }));
  assert.equal(bom.kind, 'plain');

  const env = await encryptJSON({ schemaVersion: 1, talks: [] }, 'correct horse');
  const enc = parseBackupText(JSON.stringify(env));
  assert.equal(enc.kind, 'encrypted');
  if (enc.kind === 'encrypted') {
    const data = await decryptJSON(enc.envelope, 'correct horse');
    assert.equal(looksLikeAnchor(data), true);
    await assert.rejects(decryptJSON(enc.envelope, 'wrong one!'), WrongPassphraseError);
  }

  assert.deepEqual(parseBackupText(''), { kind: 'invalid', message: IMPORT_COPY.empty });
  assert.deepEqual(parseBackupText('   '), { kind: 'invalid', message: IMPORT_COPY.empty });
  assert.deepEqual(parseBackupText('{not json'), { kind: 'invalid', message: IMPORT_COPY.notJson });
  assert.deepEqual(parseBackupText('{"a":1}'), { kind: 'invalid', message: IMPORT_COPY.notAnchor });
  assert.deepEqual(parseBackupText('{"v":1,"salt":"x"}'), { kind: 'invalid', message: IMPORT_COPY.notAnchor });
});

test('backupCounts and previewRows', () => {
  const cur = createSeedState(NOW);
  const inc = emptyState(NOW);
  inc.talks.push({ id: 't', date: '2026-10-28', role: 'alum', channel: 'LINE', did: 'x', story: '', opinion: '' });
  inc.days['2026-10-27'] = { date: '2026-10-27', actions: [] };                                   // empty: not counted
  inc.days['2026-10-28'] = { date: '2026-10-28', actions: [{ id: 'a', text: 'Call', done: false }] };
  const counts = backupCounts(inc);
  assert.equal(counts.find((r) => r.key === 'talks')?.count, 1);
  assert.equal(counts.find((r) => r.key === 'days')?.count, 1);
  assert.equal(totalItems(inc), 2);

  const rows = previewRows(cur, inc);
  const bets = rows.find((r) => r.key === 'bets');
  assert.equal(bets?.current, cur.bets.length);
  assert.equal(bets?.incoming, 0);
  assert.equal(rows.find((r) => r.key === 'talks')?.incoming, 1);
  assert.equal(rows.length, counts.length);
});

test('formatBytes and utf8Bytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(formatBytes(-1), '—');
  assert.equal(utf8Bytes('abc'), 3);
  assert.equal(utf8Bytes('฿'), 3);
  assert.equal(utf8Bytes('é'), 2);
  assert.equal(utf8Bytes('😀'), 4);
  assert.equal(utf8Bytes('ไทย'), new TextEncoder().encode('ไทย').length);
});

test('PIN, passphrase and token validation', () => {
  assert.equal(newPinIssue('1234', '1234'), null);
  assert.equal(newPinIssue('12345678', '12345678'), null);
  assert.equal(newPinIssue('123', '123'), 'Use 4 to 8 digits.');
  assert.equal(newPinIssue('123456789', '123456789'), 'Use 4 to 8 digits.');
  assert.equal(newPinIssue('12a4', '12a4'), 'Use 4 to 8 digits.');
  assert.equal(newPinIssue('1234', '1235'), 'Those PINs don’t match.');

  assert.equal(newPassphraseIssue(''), 'Enter a passphrase.');
  assert.match(newPassphraseIssue('short') ?? '', /at least 8/);
  assert.equal(newPassphraseIssue('long enough'), null);
  assert.equal(newPassphraseIssue('long enough', 'long enougH'), 'Those passphrases don’t match.');
  assert.equal(newPassphraseIssue('long enough', 'long enough'), null);

  assert.equal(tokenIssue('  '), 'Add your sync token first.');
  assert.equal(tokenIssue('abc'), null);
});

test('classifyHttp maps vault responses', () => {
  assert.deepEqual(classifyHttp(200, { rev: 1 }), { kind: 'ok' });
  assert.deepEqual(classifyHttp(409, { rev: 4 }), { kind: 'conflict', rev: 4 });
  assert.deepEqual(classifyHttp(409, {}), { kind: 'error', code: 'server' });
  assert.deepEqual(classifyHttp(401, { error: 'unauthorized' }), { kind: 'error', code: 'unauthorized' });
  assert.deepEqual(classifyHttp(403, null), { kind: 'error', code: 'unauthorized' });
  assert.deepEqual(classifyHttp(503, { error: 'sync_not_configured' }), { kind: 'error', code: 'not_configured' });
  assert.deepEqual(classifyHttp(503, null), { kind: 'error', code: 'server' });
  assert.deepEqual(classifyHttp(400, { error: 'too_large' }), { kind: 'error', code: 'too_large' });
  assert.deepEqual(classifyHttp(413, null), { kind: 'error', code: 'too_large' });
  assert.deepEqual(classifyHttp(400, { error: 'invalid_envelope' }), { kind: 'error', code: 'bad_request' });
  assert.deepEqual(classifyHttp(500, { error: 'server_error' }), { kind: 'error', code: 'server' });
  assert.deepEqual(classifyHttp(404, null), { kind: 'error', code: 'server' });
});

test('parseGetBody / parsePutBody', () => {
  assert.deepEqual(parseGetBody({ rev: 0, blob: null }), { rev: 0, blob: null });
  assert.deepEqual(parseGetBody({ rev: 3, blob: '{}', updatedAt: 'x' }), { rev: 3, blob: '{}', updatedAt: 'x' });
  assert.equal(parseGetBody({ rev: -1, blob: null }), null);
  assert.equal(parseGetBody({ rev: 1.5, blob: null }), null);
  assert.equal(parseGetBody({ rev: 1, blob: 5 }), null);
  assert.equal(parseGetBody(null), null);
  assert.deepEqual(parsePutBody({ rev: 2, updatedAt: '2026-10-28T00:00:00.000Z' }), { rev: 2, updatedAt: '2026-10-28T00:00:00.000Z' });
  assert.equal(parsePutBody({ rev: 2 }), null);
  assert.equal(parsePutBody('nope'), null);
});

test('errorCodeOf turns thrown errors into friendly codes', () => {
  assert.equal(errorCodeOf(new WrongPassphraseError()), 'wrong_passphrase');
  assert.equal(errorCodeOf(new BadEnvelopeError()), 'bad_envelope');
  const abort = new Error('aborted'); abort.name = 'AbortError';
  assert.equal(errorCodeOf(abort), 'timeout');
  assert.equal(errorCodeOf(new TypeError('Failed to fetch')), 'offline');
  assert.equal(errorCodeOf(new Error('x'), false), 'offline');
  assert.equal(errorCodeOf(new Error('Encryption needs a secure context (https or localhost).')), 'insecure');
  assert.equal(errorCodeOf(new Error('x')), 'unknown');
  assert.equal(errorCodeOf(undefined), 'unknown');
});

test('every sync error has calm copy; wrong passphrase reads exactly', () => {
  const codes = Object.keys(SYNC_ERROR_COPY) as SyncErrorCode[];
  for (const c of codes) {
    const t = syncErrorCopy(c);
    assert.ok(t.length > 0 && t.length < 140, c);
    assert.doesNotMatch(t, /!|failed|error/i, c);
  }
  assert.equal(syncErrorCopy('wrong_passphrase'), 'Wrong passphrase.');
  assert.equal(syncErrorCopy('nope' as SyncErrorCode), SYNC_ERROR_COPY.unknown);
});

test('hasUnsyncedChanges', () => {
  const at = '2026-10-28T05:00:00.000Z';
  assert.equal(hasUnsyncedChanges({ updatedAt: at, sync: { rev: 0 } }), true);
  assert.equal(hasUnsyncedChanges({ updatedAt: '2026-10-28T05:00:00.010Z', sync: { rev: 2, lastSyncedAt: at } }), false);
  assert.equal(hasUnsyncedChanges({ updatedAt: '2026-10-28T05:10:00.000Z', sync: { rev: 2, lastSyncedAt: at } }), true);
  assert.equal(hasUnsyncedChanges({ updatedAt: 'bad', sync: { rev: 2, lastSyncedAt: at } }), true);
});

test('hasUnsyncedChanges: exact once a push/pull recorded the updatedAt it matched', () => {
  const sent = '2026-10-28T05:00:00.000Z';
  const synced = { rev: 3, lastSyncedAt: '2026-10-28T05:00:20.000Z', syncedUpdatedAt: sent };
  assert.equal(hasUnsyncedChanges({ updatedAt: sent, sync: synced }), false);
  // An edit made while the push was in flight (before lastSyncedAt) still counts as unsynced.
  assert.equal(hasUnsyncedChanges({ updatedAt: '2026-10-28T05:00:05.000Z', sync: synced }), true);
});

test('syncStatusText and conflictText', () => {
  assert.equal(syncStatusText({ rev: 0 }), 'Not synced from this device yet.');
  assert.match(syncStatusText({ rev: 4 }), /revision 4/);
  assert.equal(syncStatusText({ rev: 3, lastSyncedAt: '2026-10-28T07:05:00.000Z' }), 'Last synced Wed 28 Oct, 14:05 · revision 3');
  assert.match(conflictText(2, 5), /revision 5.*synced revision 2/);
  assert.match(conflictText(0, 1), /hasn’t synced yet/);
});

test('importErrorCopy and deviceSummary', () => {
  assert.equal(importErrorCopy('wrong_passphrase'), 'Wrong passphrase.');
  assert.equal(importErrorCopy('bad_envelope'), IMPORT_COPY.damaged);
  assert.equal(importErrorCopy('insecure'), SYNC_ERROR_COPY.insecure);
  assert.equal(importErrorCopy('timeout'), SYNC_ERROR_COPY.unknown);
  const s = emptyState(NOW);
  s.talks.push({ id: 't', date: '2026-10-28', role: 'alum', channel: 'LINE', did: 'x', story: '', opinion: '' });
  assert.equal(deviceSummary(s, 2048), '0 bets · 1 talk · 0 funnel rows · about 2 KB');
});

test('a backup of the largest state Anchor keeps fits under the import limit, plain or encrypted', async () => {
  // Thai text: 3 bytes a character in UTF-8, the worst case for file size.
  const s = emptyState(NOW);
  const did = 'ก'.repeat(4000);
  while (utf8Bytes(exportText(s)) < MAX_STATE_BYTES - 20_000) {
    s.talks.push({ id: `t${s.talks.length}`, date: '2026-10-28', role: 'parent', channel: 'LINE', did, story: '', opinion: '' });
  }
  const plain = exportText(s);
  assert.ok(utf8Bytes(plain) <= MAX_STATE_BYTES);
  assert.ok(!plain.includes('\n'), 'compact JSON, not indented');
  assert.deepEqual(JSON.parse(plain), exportPayload(s));
  assert.ok(utf8Bytes(plain) <= MAX_IMPORT_BYTES, 'plain file is readable by import');
  assert.equal(backupTooBigToRestore(plain), false);

  const env = JSON.stringify(await encryptJSON(exportPayload(s), 'correct horse battery'));
  assert.ok(utf8Bytes(env) <= MAX_IMPORT_BYTES, `encrypted file (${utf8Bytes(env)} bytes) is readable by import`);
  // Even a state right at the limit fits once encrypted (base64 is 4/3 of the bytes).
  assert.ok(Math.ceil(MAX_STATE_BYTES * 4 / 3) + 1024 <= MAX_IMPORT_BYTES);

  s.talks.push({ id: 'over', date: '2026-10-28', role: 'parent', channel: 'LINE', did: 'ก'.repeat(10_000), story: '', opinion: '' });
  assert.equal(backupTooBigToRestore(exportText(s)), true, 'over the limit: the export warns');
  assert.match(BACKUP_TOO_BIG_COPY, /bigger than Anchor can restore/);
});
