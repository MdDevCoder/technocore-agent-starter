import * as C from "./candidate.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const cases = [];
const push = c => (cases.push(c), c);

// ---- identity cases: random keys + leading-zero keys + RFC 8032 vector ----
const keys = [];
for (let i = 0; i < 40; i++) {
  const kp = await crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign','verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const seed = new Uint8Array(Buffer.from(jwk.d,'base64url'));
  const pub  = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  keys.push({seed, pub});
}
// force pubkeys with leading zero bytes (base58 leading-'1' path)
const zeroPub = new Uint8Array(32); zeroPub[31]=1;
const rfcPub  = Uint8Array.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'.match(/../g).map(h=>parseInt(h,16)));
const didPubs = [...keys.map(k=>k.pub), zeroPub, rfcPub, new Uint8Array(32)];
didPubs.forEach((pub,i)=>push({id:`did${i}`, kind:'did', pub:hex(pub)}));

// ---- text normalization torture ----
const texts = [
  "Agent online. Exploring Technocore.",
  "  leading and trailing space  ",
  "tab\there\tand\nnewline\r\n",
  "zero\u200bwidth\u200bspace",              // Cf
  "bom\ufeffinside",                          // Cf
  "line\u2028sep and para\u2029sep",          // Zl, Zp
  "private\ue000use",                         // Co
  "nbsp\u00a0survives\u00a0as\u00a0Zs",       // Zs — must NOT be swept
  "\u00a0\u2003  padded with Zs  \u3000",     // Zs at edges — strip parity
  "emoji 🚀🛰️ and flag 🇯🇵",
  "combining é́́ marks",
  "rtl \u202eoverride\u202c here",            // Cf
  "cjk 技術核心 and кириллица",
  "\u0001\u0002\u0003",                        // Cc only -> becomes spaces -> empty
  "   ",                                       // whitespace only -> empty
  "",                                          // empty
  "\uD800 lone high surrogate",                // Cs
  "trailing lone \uDFFF surrogate",            // Cs
  "quote \" backslash \\ slash / json edge",
  "\u007f delete char",                        // Cc
  "🚀".repeat(4096),                            // 4096 code points, 8192 UTF-16 units
  "🚀".repeat(4097),                            // over limit
  "a".repeat(4096),
  "a".repeat(4097),
  "x\u200b".repeat(3000),                      // Cf expands to spaces
];
texts.forEach((t,i)=>push({id:`clean${i}`, kind:'clean', text:t}));

// ---- signing cases ----
const rooms = ["lobby","technocore","a","a0_-x"];
let si=0;
for (const t of texts.slice(0,20)) for (const room of rooms.slice(0,2)) {
  const k = keys[si % keys.length];
  push({id:`sign${si++}`, kind:'sign', priv:hex(k.seed), pub:hex(k.pub), room, nonce:String(1700000000000000000n + BigInt(si)), text:t});
}

// ---- contribution proof cases ----
const proofs = [
  ["https://x.com/user/status/123", "a".repeat(40)],
  ["https://github.com/o/r/commit/abc", "F".repeat(64)],
  ["https://example.com/p?q=1&r=2#frag", "0123456789abcdef0123456789abcdef01234567"],
  ["https://example.com/üñí√ödé/path", "b".repeat(40)],
  ["https://example.com/\"quote\"\\back", "c".repeat(40)],
  ["https://example.com/line\u2028sep", "d".repeat(40)],
  ["http://insecure.com/x", "e".repeat(40)],       // must reject
  ["https://ok.com", "notahex"],                    // must reject
  ["https://ok.com", "a".repeat(39)],               // must reject
];
proofs.forEach(([url,commit],i)=>{ const k=keys[i%keys.length];
  push({id:`proof${i}`, kind:'proof', priv:hex(k.seed), pub:hex(k.pub), url, commit}); });

function getPythonCommand() {
  const candidates = [process.env.PYTHON, "python3", "python", "py"].filter(Boolean);
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["-c", "import sys; sys.exit(0)"], { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return "python3";
}

// ---- run oracle ----
const pyCmd = getPythonCommand();
let oracleOut;
try {
  oracleOut = execFileSync(pyCmd, [fileURLToPath(new URL('./oracle.py', import.meta.url))], {input: JSON.stringify(cases), maxBuffer: 1<<28}).toString();
} catch (err) {
  const output = String(err.stderr || err.stdout || err.message || '');
  if (output.includes("No module named 'cryptography'") || output.includes("ModuleNotFoundError")) {
    console.log("DIFFERENTIAL ORACLE: SKIPPED (python 'cryptography' package not installed in current environment)");
    console.log("To run 117-case differential check: python -m pip install cryptography");
    process.exit(0);
  }
  throw err;
}
const oracle = JSON.parse(oracleOut);
const byId = Object.fromEntries(oracle.map(r=>[r.id,r]));

// ---- run candidate ----
const norm = e => String(e.message||e).split(':')[0];
let pass=0, fail=0; const failures=[];
for (const c of cases) {
  const exp = byId[c.id]; const got = {id:c.id};
  try {
    if (c.kind==='did') {
      const pub = Uint8Array.from(c.pub.match(/../g).map(h=>parseInt(h,16)));
      got.did = C.publicKeyToDid(pub);
      got.fp  = await C.didFingerprint(got.did);
      got.kv_url = await C.kvSetUrl('https://technocore.chat', got.did);
    } else if (c.kind==='clean') {
      got.clean = C.cleanText(c.text); got.codepoints = [...got.clean].length;
    } else if (c.kind==='sign') {
      const t = C.cleanText(c.text); got.clean=t;
      const seed=Uint8Array.from(c.priv.match(/../g).map(h=>parseInt(h,16)));
      const pub =Uint8Array.from(c.pub.match(/../g).map(h=>parseInt(h,16)));
      got.sig = await C.signBytes(seed, pub, C.roomMessagePayload(c.room,c.nonce,t));
      got.payload_hex = hex(C.roomMessagePayload(c.room,c.nonce,t));
      got.body = C.roomPostBody(C.publicKeyToDid(pub), got.sig, c.nonce, t);
    } else if (c.kind==='proof') {
      const p = C.contributionPayload(c.url,c.commit);
      got.canon = Buffer.from(p).toString('utf8'); got.canon_hex = hex(p);
      const seed=Uint8Array.from(c.priv.match(/../g).map(h=>parseInt(h,16)));
      const pub =Uint8Array.from(c.pub.match(/../g).map(h=>parseInt(h,16)));
      got.sig = await C.signBytes(seed,pub,p);
    }
  } catch(e){ got.error = String(e.message||e); }

  // compare
  let ok=true, why=[];
  if (('error' in exp) !== ('error' in got)) { ok=false; why.push(`error mismatch py=${exp.error} js=${got.error}`); }
  else if ('error' in exp) {
    const a=exp.error.replace(/^\w+Error:/,''), b=got.error;
    const tag = s => /EMPTY/.test(s)?'EMPTY':/TOOLONG|TOO_LONG/.test(s)?'LONG':/BADURL|INVALID_URL/.test(s)?'URL':/BADCOMMIT|INVALID_COMMIT/.test(s)?'COMMIT':'OTHER';
    if (tag(a)!==tag(b)) { ok=false; why.push(`error class py=${a} js=${b}`); }
  } else {
    for (const k of Object.keys(exp)) { if (k==='id') continue;
      if (exp[k] !== got[k]) { ok=false; why.push(`${k}: py=${JSON.stringify(exp[k])?.slice(0,90)} js=${JSON.stringify(got[k])?.slice(0,90)}`); } }
  }
  if (ok) pass++; else { fail++; failures.push({id:c.id, kind:c.kind, why}); }
}
console.log(`\nDIFFERENTIAL TEST: ${pass} pass / ${fail} fail  (${cases.length} cases)\n`);
for (const f of failures.slice(0,25)) console.log(`FAIL ${f.id} [${f.kind}]\n   ${f.why.join('\n   ')}`);
