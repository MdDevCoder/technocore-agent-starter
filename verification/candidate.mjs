// Candidate browser implementation — WebCrypto + zero dependencies.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58MAP = new Map([...B58].map((c, i) => [c, i]));
const ED = Uint8Array.of(0xed, 0x01);
const MAX_MSG_CODEPOINTS = 4096;
const te = new TextEncoder();

export function b58encode(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let s = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
  return s;
}
export function b58decode(str) {
  let zeros = 0; while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes = [];
  for (let i = zeros; i < str.length; i++) {
    const v = B58MAP.get(str[i]);
    if (v === undefined) throw new Error("MALFORMED_DID:bad base58 character");
    let carry = v;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
  return out;
}

export function publicKeyToDid(pub) {
  if (!(pub instanceof Uint8Array) || pub.length !== 32) throw new Error("MALFORMED_KEY:public key must be 32 bytes");
  const mb = "z" + b58encode(Uint8Array.of(...ED, ...pub));
  // Same invariants the CLI asserts.
  if (mb.length !== 48 || !mb.startsWith("z6Mk")) throw new Error("MALFORMED_DID:invalid Ed25519 did:key generated");
  return "did:key:" + mb;
}
export function didToPublicKey(did) {
  if (typeof did !== "string" || !did.startsWith("did:key:")) throw new Error("MALFORMED_DID:missing did:key prefix");
  const mb = did.slice("did:key:".length);
  if (!mb.startsWith("z")) throw new Error("MALFORMED_DID:not base58btc multibase");
  if (mb.length !== 48) throw new Error("MALFORMED_DID:unexpected length");
  const raw = b58decode(mb.slice(1));
  if (raw.length !== 34) throw new Error("MALFORMED_DID:payload must be 34 bytes");
  if (raw[0] !== 0xed || raw[1] !== 0x01) throw new Error("MALFORMED_DID:not ed25519-pub multicodec");
  return raw.slice(2);
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function didFingerprint(did) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(did)));
  return hex(d).slice(0, 16);
}

// Replicates the server's single-line sweep exactly: Cc Cf Cs Co Zl Zp -> space, then strip.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;
export function cleanText(text) {
  const cleaned = text.replace(INVISIBLE, " ").trim();
  if (!cleaned) throw new Error("EMPTY_MESSAGE:message has no visible text after normalization");
  const n = [...cleaned].length;                      // code points, not UTF-16 units
  if (n > MAX_MSG_CODEPOINTS) throw new Error(`MESSAGE_TOO_LONG:${n}`);
  return cleaned;
}

export const b64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function b64urlDecode(s) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(p); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const roomMessagePayload = (room, nonce, text) => te.encode(`${room}|${nonce}|${text}`);

const RE_SIG = /^[A-Za-z0-9_-]{86}$/;
const RE_ROOM = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const RE_NONCE = /^[0-9]{1,19}$/;
const RE_COMMIT = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
export const validateRoom = (r) => { if (!RE_ROOM.test(r)) throw new Error("INVALID_ROOM"); return r; };
export const validateNonce = (n) => { if (!RE_NONCE.test(n)) throw new Error("INVALID_NONCE"); return n; };

async function importSigningKey(seed, pub) {
  return crypto.subtle.importKey("jwk",
    { kty: "OKP", crv: "Ed25519", d: b64url(seed), x: b64url(pub), key_ops: ["sign"], ext: true },
    { name: "Ed25519" }, true, ["sign"]);
}
export async function signBytes(seed, pub, data) {
  const k = await importSigningKey(seed, pub);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, k, data));
  const enc = b64url(sig);
  if (enc.length !== 86) throw new Error("SIGNATURE_ENCODING_ERROR");
  return enc;
}
export async function verifyBytes(did, signature, data) {
  if (!RE_SIG.test(signature)) throw new Error("MALFORMED_SIGNATURE:expected 86 base64url characters");
  const pub = didToPublicKey(did);
  const sig = b64urlDecode(signature);
  if (sig.length !== 64) throw new Error("MALFORMED_SIGNATURE:expected 64 bytes");
  const k = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, k, sig, data);
}

// Room post body: compact separators, insertion order did,sig,nonce,text — matches the CLI.
export const roomPostBody = (did, sig, nonce, text) => JSON.stringify({ did, sig, nonce, text });

// Detached contribution proof: canonical record with sorted keys, compact separators.
export function contributionPayload(artifactUrl, commit) {
  if (!artifactUrl.startsWith("https://")) throw new Error("INVALID_URL:artifact URL must start with https://");
  if (!RE_COMMIT.test(commit)) throw new Error("INVALID_COMMIT:must be 40 or 64 hex characters");
  const record = { artifact_url: artifactUrl, commit: commit.toLowerCase(), schema: "technocore-contribution-v1" };
  const sorted = Object.fromEntries(Object.keys(record).sort().map((k) => [k, record[k]]));
  return te.encode(JSON.stringify(sorted));
}
export async function createProof(seed, pub, artifactUrl, commit) {
  const payload = contributionPayload(artifactUrl, commit);
  return { schema: "technocore-contribution-proof-v1", did: publicKeyToDid(pub),
           artifact_url: artifactUrl, commit: commit.toLowerCase(), signature: await signBytes(seed, pub, payload) };
}
export async function verifyProof(proof) {
  if (proof?.schema !== "technocore-contribution-proof-v1") throw new Error("UNSUPPORTED_SCHEMA");
  for (const f of ["did", "artifact_url", "commit", "signature"])
    if (typeof proof[f] !== "string") throw new Error(`MISSING_FIELD:${f}`);
  return verifyBytes(proof.did, proof.signature, contributionPayload(proof.artifact_url, proof.commit));
}

export async function kvSetUrl(base, did) {
  return `${base}/kv/did/${await didFingerprint(did)}/set/${encodeURIComponent(did)}`;
}

// Nanosecond-precision, strictly monotonic nonce.
let lastNonce = 0n;
export function makeNonce() {
  const ms = typeof performance !== "undefined" && performance.timeOrigin
    ? performance.timeOrigin + performance.now() : Date.now();
  let ns = BigInt(Math.round(ms * 1e6));
  if (ns <= lastNonce) ns = lastNonce + 1n;
  lastNonce = ns;
  const s = ns.toString();
  if (!RE_NONCE.test(s)) throw new Error("INVALID_NONCE:generated nonce out of range");
  return s;
}
