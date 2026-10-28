import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadEnvelopeError, base64ToBytes, bytesToBase64, decryptJSON, encryptJSON, hashPin, isEnvelope, isValidPin,
  randomSaltB64, verifyPin, WrongPassphraseError,
} from './crypto.ts';

const SAMPLE = { schemaVersion: 1, talks: [{ who: 'ครูเอ', did: 'Paid ฿500', quote: 'emoji ok 🙂' }], n: 3 };

test('encryptJSON → decryptJSON round-trips (unicode included)', async () => {
  const env = await encryptJSON(SAMPLE, 'correct horse battery staple');
  assert.equal(env.v, 1);
  assert.ok(isEnvelope(env));
  assert.equal(base64ToBytes(env.salt).length, 16);
  assert.equal(base64ToBytes(env.iv).length, 12);
  assert.ok(!JSON.stringify(env).includes('ครูเอ'), 'ciphertext must not contain plaintext');
  assert.deepEqual(await decryptJSON(env, 'correct horse battery staple'), SAMPLE);
  // Also accepts the envelope as a JSON string (file / server blob).
  assert.deepEqual(await decryptJSON(JSON.stringify(env), 'correct horse battery staple'), SAMPLE);
});

test('each encryption uses a fresh salt and IV', async () => {
  const a = await encryptJSON(SAMPLE, 'pw');
  const b = await encryptJSON(SAMPLE, 'pw');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('wrong passphrase throws WrongPassphraseError', async () => {
  const env = await encryptJSON(SAMPLE, 'right');
  await assert.rejects(() => decryptJSON(env, 'wrong'), (err: unknown) => {
    assert.ok(err instanceof WrongPassphraseError);
    assert.equal(err.code, 'wrong_passphrase');
    assert.equal(err.message, 'Wrong passphrase');
    return true;
  });
});

test('tampered ciphertext is rejected', async () => {
  const env = await encryptJSON(SAMPLE, 'pw');
  const ct = base64ToBytes(env.ct);
  ct[0] ^= 0xff;
  await assert.rejects(() => decryptJSON({ ...env, ct: bytesToBase64(ct) }, 'pw'), WrongPassphraseError);
});

test('malformed envelopes throw BadEnvelopeError', async () => {
  await assert.rejects(() => decryptJSON('not json', 'pw'), BadEnvelopeError);
  await assert.rejects(() => decryptJSON(JSON.stringify({ v: 2, salt: 'AAAA', iv: 'AAAA', ct: 'AAAA' }), 'pw'), BadEnvelopeError);
  await assert.rejects(() => decryptJSON({ v: 1, salt: 'AAAA', iv: 'AAAA', ct: 'AAAA' }, 'pw'), BadEnvelopeError); // iv too short
  assert.equal(isEnvelope(null), false);
  assert.equal(isEnvelope({ v: 1, salt: 'a', iv: 'b', ct: 'c' }), false);
  assert.equal(isEnvelope({ v: 1, salt: 'AAAA', iv: 'AAAA', ct: '!!!!' }), false);
});

test('encryptJSON requires a passphrase', async () => {
  await assert.rejects(() => encryptJSON(SAMPLE, ''));
});

test('hashPin is deterministic per salt; verifyPin checks it', async () => {
  const salt = randomSaltB64();
  assert.equal(base64ToBytes(salt).length, 16);
  const h1 = await hashPin('2580', salt);
  const h2 = await hashPin('2580', salt);
  assert.equal(h1, h2);
  assert.equal(base64ToBytes(h1).length, 32);
  assert.notEqual(await hashPin('2580', randomSaltB64()), h1);
  assert.equal(await verifyPin('2580', salt, h1), true);
  assert.equal(await verifyPin('0000', salt, h1), false);
  assert.equal(await verifyPin('2580', salt, 'short'), false);
});

test('isValidPin: 4–8 digits', () => {
  assert.ok(isValidPin('1234'));
  assert.ok(isValidPin('12345678'));
  assert.ok(!isValidPin('123'));
  assert.ok(!isValidPin('123456789'));
  assert.ok(!isValidPin('12a4'));
});

test('base64 helpers round-trip large buffers', () => {
  const big = new Uint8Array(200_000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});
