/**
 * An independent Ed25519 implementation, written from the algorithm description in RFC 8032 §5.1 and
 * its Appendix A reference code. Test-only: nothing here is imported by the application.
 *
 * Why this exists. The shipped code signs with `crypto.subtle`, and the Python differential oracle in
 * this directory signs with `cryptography`. Both are OpenSSL underneath, so agreement between them says
 * nothing about the curve arithmetic — it only confirms the *surrounding* work (canonical JSON, payload
 * assembly, base58, base64url, the invisible-character sweep), which is where the real porting risk was.
 *
 * This file closes the remaining gap with arithmetic that shares no code with either: plain BigInt on
 * Edwards25519, extended homogeneous coordinates, point compression per the spec. SHA-512 is taken from
 * `node:crypto` because a hash is not what is under test here and is independently checkable against
 * published digests.
 *
 * Deliberately unoptimised and not constant-time. It never touches a real key, and reads like the spec
 * on purpose so it can be checked by eye against RFC 8032 rather than trusted.
 */

import { createHash } from "node:crypto";

const p = 2n ** 255n - 19n;
const q = 2n ** 252n + 27742317777372353535851937790883648493n;

const mod = (x) => ((x % p) + p) % p;
const modInv = (x) => power(mod(x), p - 2n);

function power(base, exponent) {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % p;
    b = (b * b) % p;
    e >>= 1n;
  }
  return result;
}

const d = mod(-121665n * modInv(121666n));
const sqrtMinusOne = power(2n, (p - 1n) / 4n);

const sha512 = (bytes) => new Uint8Array(createHash("sha512").update(bytes).digest());

function sha512ModQ(bytes) {
  return leToBigInt(sha512(bytes)) % q;
}

function leToBigInt(bytes) {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

function bigIntToLe(value, length) {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = 0; i < length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// Points as (X, Y, Z, T) with x = X/Z, y = Y/Z, xy = T/Z.
function pointAdd(P, Q) {
  const A = mod((P[1] - P[0]) * (Q[1] - Q[0]));
  const B = mod((P[1] + P[0]) * (Q[1] + Q[0]));
  const C = mod(2n * P[3] * Q[3] * d);
  const D = mod(2n * P[2] * Q[2]);
  const E = B - A;
  const F = D - C;
  const G = D + C;
  const H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}

function pointMul(scalar, point) {
  let result = [0n, 1n, 1n, 0n];
  let addend = point;
  let s = scalar;
  while (s > 0n) {
    if (s & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    s >>= 1n;
  }
  return result;
}

function pointEqual(P, Q) {
  return mod(P[0] * Q[2] - Q[0] * P[2]) === 0n && mod(P[1] * Q[2] - Q[1] * P[2]) === 0n;
}

function recoverX(y, sign) {
  if (y >= p) return null;
  const x2 = mod((y * y - 1n) * modInv(d * y * y + 1n));
  if (x2 === 0n) return sign ? null : 0n;

  let x = power(x2, (p + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * sqrtMinusOne);
  if (mod(x * x - x2) !== 0n) return null;
  if ((x & 1n) !== BigInt(sign)) x = p - x;
  return x;
}

const baseY = mod(4n * modInv(5n));
const baseX = recoverX(baseY, 0);
const BASE = [baseX, baseY, 1n, mod(baseX * baseY)];

function pointCompress(P) {
  const zInv = modInv(P[2]);
  const x = mod(P[0] * zInv);
  const y = mod(P[1] * zInv);
  return bigIntToLe(y | ((x & 1n) << 255n), 32);
}

function pointDecompress(bytes) {
  if (bytes.length !== 32) return null;
  const value = leToBigInt(bytes);
  const sign = Number(value >> 255n);
  const y = value & ((1n << 255n) - 1n);
  const x = recoverX(y, sign);
  return x === null ? null : [x, y, 1n, mod(x * y)];
}

function expandSeed(seed) {
  const h = sha512(seed);
  let a = leToBigInt(h.subarray(0, 32));
  a &= (1n << 254n) - 8n;
  a |= 1n << 254n;
  return { scalar: a, prefix: h.subarray(32) };
}

const concat = (...parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** Public key from a 32-byte seed. */
export function referencePublicKey(seed) {
  const { scalar } = expandSeed(seed);
  return pointCompress(pointMul(scalar, BASE));
}

/** Deterministic 64-byte signature. */
export function referenceSign(seed, message) {
  const { scalar, prefix } = expandSeed(seed);
  const A = pointCompress(pointMul(scalar, BASE));
  const r = sha512ModQ(concat(prefix, message));
  const R = pointCompress(pointMul(r, BASE));
  const h = sha512ModQ(concat(R, A, message));
  return concat(R, bigIntToLe((r + h * scalar) % q, 32));
}

export function referenceVerify(publicKey, signature, message) {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const A = pointDecompress(publicKey);
  if (A === null) return false;

  const Rs = signature.subarray(0, 32);
  const R = pointDecompress(Rs);
  if (R === null) return false;

  const s = leToBigInt(signature.subarray(32));
  if (s >= q) return false;

  const h = sha512ModQ(concat(Rs, publicKey, message));
  return pointEqual(pointMul(s, BASE), pointAdd(R, pointMul(h, A)));
}
