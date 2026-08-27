# Faithful oracle: logic copied verbatim from flop_agent.py.
# Ed25519 via `cryptography` (from_private_bytes(seed) == PyNaCl SigningKey(seed)).
import base64, hashlib, json, sys, unicodedata, urllib.parse
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ED25519_CODEC = b"\xed\x01"
B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
INVIS_CATS = frozenset({"Cc", "Cf", "Cs", "Co", "Zl", "Zp"})
MAX_MSG_LEN = 4096

def b58_encode(data: bytes) -> str:
    zeros = len(data) - len(data.lstrip(b"\x00"))
    n = int.from_bytes(data, "big"); out = []
    while n > 0:
        n, r = divmod(n, 58); out.append(B58_ALPHA[r])
    return "1" * zeros + "".join(reversed(out))

def pub_to_did(pub_bytes: bytes) -> str:
    mb = "z" + b58_encode(ED25519_CODEC + pub_bytes)
    if len(mb) != 48 or not mb.startswith("z6Mk"):
        raise ValueError("Invalid Ed25519 did:key generated")
    return "did:key:" + mb

def did_fingerprint(did: str) -> str:
    return hashlib.sha256(did.encode()).hexdigest()[:16]

def clean_text(text: str) -> str:
    cleaned = "".join(" " if unicodedata.category(c) in INVIS_CATS else c for c in text).strip()
    if not cleaned: raise ValueError("EMPTY")
    if len(cleaned) > MAX_MSG_LEN: raise ValueError("TOOLONG:%d" % len(cleaned))
    return cleaned

def sign_payload(priv_hex, room, nonce, text):
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(priv_hex))
    payload = f"{room}|{nonce}|{text}".encode("utf-8")
    sig = key.sign(payload)
    enc = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    if len(enc) != 86: raise ValueError("Invalid signature length")
    return enc

def sign_raw(priv_hex, data: bytes):
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(priv_hex))
    return base64.urlsafe_b64encode(key.sign(data)).decode().rstrip("=")

def contribution_payload(artifact_url, commit):
    import re
    if not artifact_url.startswith("https://"): raise ValueError("BADURL")
    if not re.fullmatch(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})", commit): raise ValueError("BADCOMMIT")
    record = {"artifact_url": artifact_url, "commit": commit.lower(), "schema": "technocore-contribution-v1"}
    return json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def post_body(did, sig, nonce, text):
    return json.dumps({"did": did, "sig": sig, "nonce": nonce, "text": text},
                      ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def kv_set_url(did):
    return f"https://technocore.chat/kv/did/{did_fingerprint(did)}/set/{urllib.parse.quote(did, safe='')}"

# ---- driver: read JSON cases from stdin, emit JSON results ----
out = []
for case in json.load(sys.stdin):
    r = {"id": case["id"]}
    try:
        k = case["kind"]
        if k == "did":
            r["did"] = pub_to_did(bytes.fromhex(case["pub"]))
            r["fp"] = did_fingerprint(r["did"])
            r["kv_url"] = kv_set_url(r["did"])
        elif k == "clean":
            r["clean"] = clean_text(case["text"])
            r["codepoints"] = len(r["clean"])
        elif k == "sign":
            t = clean_text(case["text"])
            r["clean"] = t
            r["sig"] = sign_payload(case["priv"], case["room"], case["nonce"], t)
            r["payload_hex"] = f"{case['room']}|{case['nonce']}|{t}".encode("utf-8").hex()
            pub = bytes.fromhex(case["pub"])
            r["body"] = post_body(pub_to_did(pub), r["sig"], case["nonce"], t).decode("utf-8")
        elif k == "proof":
            p = contribution_payload(case["url"], case["commit"])
            r["canon"] = p.decode("utf-8"); r["canon_hex"] = p.hex()
            r["sig"] = sign_raw(case["priv"], p)
        else: r["error"] = "unknown kind"
    except Exception as e:
        r["error"] = f"{type(e).__name__}:{e}"
    out.append(r)
json.dump(out, sys.stdout, ensure_ascii=False)
