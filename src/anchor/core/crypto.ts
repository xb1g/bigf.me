// WebCrypto only (browsers + Node 25). Pure module: no window/document access.
// Envelope: { v: 1, salt, iv, ct } — base64 strings.
// Key: PBKDF2-SHA256 (310,000 iterations, 16-byte salt) → AES-GCM 256, 12-byte random IV per encryption.

export const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface Envelope { v: 1; salt: string; iv: string; ct: string }

/** Thrown by decryptJSON when the passphrase is wrong (or the ciphertext was tampered with). */
export class WrongPassphraseError extends Error {
  readonly code = 'wrong_passphrase';
  constructor() {
    super('Wrong passphrase');
    this.name = 'WrongPassphraseError';
  }
}

/** Thrown when input is not a valid { v:1, salt, iv, ct } envelope or plaintext is not JSON. */
export class BadEnvelopeError extends Error {
  readonly code = 'bad_envelope';
  constructor(message = 'Not an Anchor encrypted file') {
    super(message);
    this.name = 'BadEnvelopeError';
  }
}

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Encryption needs a secure context (https or localhost).');
  return c.subtle;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isB64(s: unknown, minLen = 1): s is string {
  return typeof s === 'string' && s.length >= minLen && s.length % 4 === 0 && B64_RE.test(s);
}

/** Shape check for the encrypted envelope (also used by the server). */
export function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return e.v === 1 && isB64(e.salt, 4) && isB64(e.iv, 4) && isB64(e.ct, 4);
}

/** Random salt as base64 (16 bytes by default). */
export function randomSaltB64(bytes = SALT_BYTES): string {
  return bytesToBase64(randomBytes(bytes));
}

async function pbkdf2Bits(secret: string, salt: Uint8Array<ArrayBuffer>, bits = 256): Promise<ArrayBuffer> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, base, bits);
}

async function deriveAesKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-serialisable value with a passphrase. */
export async function encryptJSON(obj: unknown, passphrase: string): Promise<Envelope> {
  if (!passphrase) throw new Error('Passphrase required');
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveAesKey(passphrase, salt);
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, pt));
  return { v: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ct: bytesToBase64(ct) };
}

/**
 * Decrypt an envelope (object or JSON string).
 * Throws WrongPassphraseError on a wrong passphrase, BadEnvelopeError on malformed input.
 */
export async function decryptJSON<T = unknown>(envelope: Envelope | string, passphrase: string): Promise<T> {
  let env: unknown = envelope;
  if (typeof envelope === 'string') {
    try { env = JSON.parse(envelope); } catch { throw new BadEnvelopeError(); }
  }
  if (!isEnvelope(env)) throw new BadEnvelopeError();
  let salt: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, ct: Uint8Array<ArrayBuffer>;
  try {
    salt = base64ToBytes(env.salt); iv = base64ToBytes(env.iv); ct = base64ToBytes(env.ct);
  } catch {
    throw new BadEnvelopeError();
  }
  if (iv.length !== IV_BYTES) throw new BadEnvelopeError();
  const key = await deriveAesKey(passphrase, salt);
  let pt: ArrayBuffer;
  try {
    pt = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    throw new WrongPassphraseError();
  }
  try {
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    throw new BadEnvelopeError('Decrypted data is not valid JSON');
  }
}

/** PBKDF2-SHA256(pin, salt) → base64. `salt` is base64 (use randomSaltB64()). */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await pbkdf2Bits(pin, base64ToBytes(salt))));
}

/** Constant-time check of a PIN against a stored hash + salt. */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const got = await hashPin(pin, salt);
  if (got.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

/** 4–8 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
