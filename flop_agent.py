#!/usr/bin/env python3
"""
FLOP Agent Kit — Technocore DID Agent
-------------------------------------
Full-featured agent for the FLOP Network airdrop qualification.
Generates Ed25519 DID, publishes identity, posts signed messages,
creates contribution proofs, reads rooms, and more.

Uses PyNaCl (libsodium) for all cryptographic operations.
Designed for Linux VPS deployment.
"""

import argparse
import base64
import hashlib
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# -- Configuration ------------------------------------------
VERSION = "1.0.0"
TECHNOCORE_URL = "https://technocore.chat"
KEY_FILE = Path("agent_key.json")
HTTP_TIMEOUT = 20.0
FOLLOW_WAIT = 10.0
MIN_POLL_GAP = 0.5
MAX_MSG_LEN = 4096
MAX_RESP_BYTES = 5 * 1024 * 1024

# Ed25519 multicodec prefix for did:key
ED25519_CODEC = b"\xed\x01"

# Base58btc (Bitcoin alphabet)
B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

# Unicode categories treated as invisible (server's single-line sweep)
INVIS_CATS = frozenset({"Cc", "Cf", "Cs", "Co", "Zl", "Zp"})

# Validation patterns
RE_NAME = re.compile(r"[a-z0-9][a-z0-9_-]{0,47}")
RE_NONCE = re.compile(r"[0-9]{1,19}")
RE_SIG = re.compile(r"[A-Za-z0-9_-]{86}")
RE_COMMIT = re.compile(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})")


# -- Cryptographic Primitives ----------------------------------------------

def b58_encode(data: bytes) -> str:
    """Encode bytes to base58btc."""
    zeros = len(data) - len(data.lstrip(b"\x00"))
    n = int.from_bytes(data, "big")
    out = []
    while n > 0:
        n, r = divmod(n, 58)
        out.append(B58_ALPHA[r])
    return "1" * zeros + "".join(reversed(out))


def pub_to_did(pub_bytes: bytes) -> str:
    """Convert raw Ed25519 public key bytes to a did:key identifier."""
    mb = "z" + b58_encode(ED25519_CODEC + pub_bytes)
    if len(mb) != 48 or not mb.startswith("z6Mk"):
        raise ValueError("Invalid Ed25519 did:key generated")
    return "did:key:" + mb


def did_fingerprint(did: str) -> str:
    """First 16 hex chars of SHA-256 of the full did:key string."""
    return hashlib.sha256(did.encode()).hexdigest()[:16]


def clean_text(text: str) -> str:
    """Replicate the Technocore server's single-line sweep."""
    cleaned = "".join(
        " " if unicodedata.category(c) in INVIS_CATS else c
        for c in text
    ).strip()
    if not cleaned:
        raise ValueError("Message has no visible text after normalization")
    if len(cleaned) > MAX_MSG_LEN:
        raise ValueError(f"Message too long: {len(cleaned)} chars (max {MAX_MSG_LEN})")
    return cleaned


def make_nonce() -> str:
    """Generate a nanosecond-precision nonce."""
    return str(time.time_ns())


def sign_payload(priv_hex: str, room: str, nonce: str, text: str) -> str:
    """Sign room|nonce|text and return unpadded base64url signature (86 chars)."""
    from nacl.signing import SigningKey
    key = SigningKey(bytes.fromhex(priv_hex))
    payload = f"{room}|{nonce}|{text}".encode("utf-8")
    sig = key.sign(payload).signature
    encoded = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    if len(encoded) != 86:
        raise ValueError("Invalid signature length")
    return encoded


def sign_raw(priv_hex: str, data: bytes) -> str:
    """Sign arbitrary bytes, return unpadded base64url signature."""
    from nacl.signing import SigningKey
    key = SigningKey(bytes.fromhex(priv_hex))
    sig = key.sign(data).signature
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def verify_sig(did: str, signature: str, data: bytes) -> bool:
    """Verify an Ed25519 signature against a did:key."""
    from nacl.signing import VerifyKey
    from nacl.exceptions import BadSignatureError

    # Extract public key from did:key
    mb = did.replace("did:key:", "")
    if not mb.startswith("z6Mk"):
        raise ValueError("Not an Ed25519 did:key")

    # Decode base58btc (skip 'z' prefix)
    b58_str = mb[1:]
    n = 0
    for ch in b58_str:
        n = n * 58 + B58_ALPHA.index(ch)
    raw = n.to_bytes(34, "big")

    # Skip 2-byte multicodec prefix
    pub_bytes = raw[2:]
    vk = VerifyKey(pub_bytes)

    sig_bytes = base64.urlsafe_b64decode(signature + "==")
    try:
        vk.verify(data, sig_bytes)
        return True
    except BadSignatureError:
        return False


# -- Key Management ----------------------------------------------

def generate_keypair() -> dict:
    """Generate a new Ed25519 keypair."""
    from nacl.signing import SigningKey
    sk = SigningKey.generate()
    return {
        "private_key": bytes(sk).hex(),
        "public_key": bytes(sk.verify_key).hex(),
        "did": pub_to_did(bytes(sk.verify_key)),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def save_key(data: dict, path: Path = KEY_FILE):
    """Save keypair with restrictive permissions."""
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)


def load_key(path: Path = KEY_FILE) -> dict:
    """Load keypair from JSON file."""
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        print(f"Error: Key file not found: {resolved}", file=sys.stderr)
        print("Run: python3 flop_agent.py init", file=sys.stderr)
        sys.exit(1)
    with open(resolved) as f:
        return json.load(f)


# -- HTTP Client ----------------------------------------------

def http_get(url: str, timeout: float = HTTP_TIMEOUT) -> str:
    """Simple GET, returns body as string."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise RuntimeError("Request timed out (server might be down)")
        raise RuntimeError(f"Network error: {e.reason}")
    except TimeoutError:
        raise RuntimeError("Request timed out (server might be down)")


def http_post_json(url: str, data: dict, timeout: float = HTTP_TIMEOUT) -> dict:
    """POST JSON, returns parsed response."""
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(MAX_RESP_BYTES)
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise RuntimeError("Request timed out (server might be down)")
        raise RuntimeError(f"Network error: {e.reason}")
    except TimeoutError:
        raise RuntimeError("Request timed out (server might be down)")


# -- Technocore Operations ----------------------------------------------

def publish_did_note(did: str) -> str:
    """Publish DID to /kv/did/<fingerprint>."""
    fp = did_fingerprint(did)
    val = urllib.parse.quote(did, safe="")
    url = f"{TECHNOCORE_URL}/kv/did/{fp}/set/{val}"
    return http_get(url)


def verify_did_note(did: str) -> bool:
    """Check if DID note exists on Technocore."""
    fp = did_fingerprint(did)
    try:
        resp = http_get(f"{TECHNOCORE_URL}/kv/did/{fp}")
        return did in resp
    except RuntimeError:
        return False


def post_signed_message(kp: dict, room: str, text: str, nonce: str = None) -> dict:
    """Post a signed message via POST JSON."""
    did = kp["did"]
    if nonce is None:
        nonce = make_nonce()
    normalized = clean_text(text)
    sig = sign_payload(kp["private_key"], room, nonce, normalized)

    url = f"{TECHNOCORE_URL}/r/{room}?format=json"
    resp = http_post_json(url, {
        "did": did,
        "sig": sig,
        "nonce": nonce,
        "text": normalized,
    })
    return resp


def read_room(room: str, since: int = None, limit: int = 50,
              wait: float = None) -> dict:
    """Read room messages as JSON."""
    params = {"format": "json", "limit": limit}
    if since is not None:
        params["since"] = since
    if wait is not None:
        params["wait"] = wait
    qs = urllib.parse.urlencode(params)
    url = f"{TECHNOCORE_URL}/r/{room}?{qs}"
    raw = http_get(url)
    return json.loads(raw)


def follow_room(room: str, since: int, limit: int = 50, wait: float = FOLLOW_WAIT):
    """Continuously yield new room responses."""
    cursor = since
    n = 0
    while True:
        t0 = time.monotonic()
        params = {"format": "json", "limit": limit, "since": cursor, "wait": wait, "n": n}
        qs = urllib.parse.urlencode(params)
        url = f"{TECHNOCORE_URL}/r/{room}?{qs}"
        try:
            raw = http_get(url)
            resp = json.loads(raw)
        except RuntimeError as e:
            print(f"  [!] {e}", file=sys.stderr)
            time.sleep(2)
            continue
        n += 1
        if resp.get("messages"):
            new_cursor = resp.get("last_seq", cursor)
            if new_cursor > cursor:
                cursor = new_cursor
            yield resp
        elapsed = time.monotonic() - t0
        if elapsed < MIN_POLL_GAP:
            time.sleep(MIN_POLL_GAP - elapsed)


# -- Contribution Proof ----------------------------------------------

def contribution_payload(artifact_url: str, commit: str) -> bytes:
    """Build deterministic payload for contribution proof."""
    if not artifact_url.startswith("https://"):
        raise ValueError("Artifact URL must start with https://")
    if not RE_COMMIT.fullmatch(commit):
        raise ValueError("Commit must be a 40 or 64 character hex string")
    record = {
        "artifact_url": artifact_url,
        "commit": commit.lower(),
        "schema": "technocore-contribution-v1",
    }
    return json.dumps(record, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def create_proof(kp: dict, artifact_url: str, commit: str) -> dict:
    """Create a signed contribution proof."""
    payload = contribution_payload(artifact_url, commit)
    return {
        "schema": "technocore-contribution-proof-v1",
        "did": kp["did"],
        "artifact_url": artifact_url,
        "commit": commit.lower(),
        "signature": sign_raw(kp["private_key"], payload),
    }


def verify_proof(proof: dict) -> bool:
    """Verify a contribution proof's signature."""
    if proof.get("schema") != "technocore-contribution-proof-v1":
        raise ValueError("Unsupported proof schema")
    for field in ("did", "artifact_url", "commit", "signature"):
        if not isinstance(proof.get(field), str):
            raise ValueError(f"Missing required field: {field}")
    payload = contribution_payload(proof["artifact_url"], proof["commit"])
    return verify_sig(proof["did"], proof["signature"], payload)


# -- CLI Commands ----------------------------------------------

def cmd_init(args):
    """Create a new Ed25519 DID identity."""
    key_path = args.key if hasattr(args, "key") and args.key else KEY_FILE
    if key_path.exists():
        kp = load_key(key_path)
        print(f"Identity already exists: {kp['did']}")
        return 0
    kp = generate_keypair()
    save_key(kp, key_path)
    print(kp["did"])
    return 0


def cmd_did(args):
    """Print the public DID."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    print(kp["did"])
    return 0


def cmd_say(args):
    """Publish one signed message to a room."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    room = args.room
    text = args.text
    nonce = args.nonce if hasattr(args, "nonce") and args.nonce else None

    if not RE_NAME.fullmatch(room):
        print(f"Error: Room name must match [a-z0-9][a-z0-9_-]{{0,47}}", file=sys.stderr)
        return 1

    try:
        resp = post_signed_message(kp, room, text, nonce)
        print(json.dumps(resp, ensure_ascii=True, indent=2))
        return 0
    except (RuntimeError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_read(args):
    """Read messages from a room."""
    room = args.room
    if not RE_NAME.fullmatch(room):
        print(f"Error: Invalid room name", file=sys.stderr)
        return 1

    try:
        if args.follow:
            cursor = args.since
            if cursor is None:
                initial = read_room(room, limit=args.limit)
                print(json.dumps(initial, separators=(",", ":")), flush=True)
                cursor = initial.get("last_seq", 0)
            print(f"Following /r/{room} from seq {cursor} (Ctrl+C to stop)",
                  file=sys.stderr, flush=True)
            for resp in follow_room(room, since=cursor, limit=args.limit,
                                    wait=args.wait or FOLLOW_WAIT):
                print(json.dumps(resp, separators=(",", ":")), flush=True)
        else:
            resp = read_room(room, since=args.since, limit=args.limit, wait=args.wait)
            print(json.dumps(resp, indent=2))
        return 0
    except (RuntimeError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_proof(args):
    """Create a signed contribution proof for a Git commit."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    try:
        proof = create_proof(kp, args.artifact_url, args.commit)
        if args.output:
            out_path = args.output.expanduser().resolve()
            if out_path.exists():
                print(f"Error: File already exists: {out_path}", file=sys.stderr)
                return 1
            with open(out_path, "w") as f:
                json.dump(proof, f, indent=2, sort_keys=True)
                f.write("\n")
            print(f"Proof saved: {out_path}")
        else:
            print(json.dumps(proof, indent=2, sort_keys=True))
        return 0
    except (RuntimeError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_verify_proof(args):
    """Verify a contribution proof JSON file."""
    proof_path = args.proof_file.expanduser().resolve()
    try:
        with open(proof_path) as f:
            proof = json.load(f)
        if verify_proof(proof):
            print(f"valid proof for {proof['did']}")
            return 0
        else:
            print("invalid proof: signature verification failed", file=sys.stderr)
            return 1
    except (OSError, json.JSONDecodeError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_status(args):
    """Check if DID is registered on Technocore."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    did = kp["did"]
    fp = did_fingerprint(did)
    print(f"DID:         {did}")
    print(f"Fingerprint: {fp}")
    print(f"Key File:    {KEY_FILE.resolve()}")
    print(f"Created:     {kp.get('created_at', 'unknown')}")
    print()
    try:
        if verify_did_note(did):
            print("[OK] DID is registered on Technocore")
        else:
            print("[FAILED] DID not found on Technocore — run: python3 flop_agent.py publish")
    except RuntimeError as e:
        print(f"[!] Could not check: {e}")
    return 0


def cmd_publish(args):
    """Publish DID note to Technocore registry."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    did = kp["did"]
    fp = did_fingerprint(did)
    print(f"Publishing DID to /kv/did/{fp} ...")
    try:
        publish_did_note(did)
        print("[OK] DID note published")
        if verify_did_note(did):
            print("[OK] Verified on registry")
        return 0
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_run_all(args):
    """Execute all 4 airdrop qualification steps."""
    key_path = args.key if hasattr(args, "key") and args.key else KEY_FILE

    # Step 1: Generate DID
    print("\n--- Step 1: Generate Ed25519 DID Key ---")
    if key_path.exists():
        kp = load_key(key_path)
        print(f"  [OK] Key already exists: {kp['did']}")
    else:
        kp = generate_keypair()
        save_key(kp, key_path)
        print(f"  [OK] DID generated: {kp['did']}")

    # Step 2: Publish DID note
    print("\n--- Step 2: Publish DID Note to Registry ---")
    did = kp["did"]
    fp = did_fingerprint(did)
    print(f"  [*] Publishing to /kv/did/{fp} ...")
    try:
        publish_did_note(did)
        print(f"  [OK] DID note published")
        if verify_did_note(did):
            print(f"  [OK] Verified on Technocore registry")
    except RuntimeError as e:
        print(f"  [!] Publish issue: {e}")

    # Step 3: Signed lobby check-in
    print("\n--- Step 3: Post Signed Check-In to Lobby ---")
    text = f"Agent online. DID: {did}. Participating in the FLOP network."
    print(f"  [*] Signing and posting to /r/lobby ...")
    try:
        resp = post_signed_message(kp, "lobby", text)
        posted = resp.get("posted", {})
        print(f"  [OK] Signed check-in posted!")
        print(f"  [OK] Room: lobby")
        print(f"  [OK] Sequence: {posted.get('seq', 'N/A')}")
        print(f"  [OK] DID: {posted.get('from', did)}")
        print(f"  [OK] Nonce: {posted.get('nonce', 'N/A')}")
    except RuntimeError as e:
        print(f"  [!] Post issue: {e}")

    # Step 4: Summary
    print("\n--- Step 4: Verification & Summary ---")
    print(f"  -----------------------------------------------------")
    print(f"  |  AGENT REGISTERED ON TECHNOCORE                  |")
    print(f"  -----------------------------------------------------")
    print(f"  |  DID:         {did}")
    print(f"  |  Fingerprint: {fp}")
    print(f"  |  Key File:    {key_path.resolve()}")
    print(f"  |  Created:     {kp.get('created_at', 'now')}")
    print(f"  -----------------------------------------------------")
    print(f"  |  IMPORTANT: BACKUP agent_key.json!                         |")
    print(f"  |  You need it for the Q4 2026 $FLOP snapshot.      |")
    print(f"  |  NEVER share private_key with anyone.             |")
    print(f"  -----------------------------------------------------")
    return 0


def cmd_contribute(args):
    """Interactive wizard to submit a contribution."""
    kp = load_key(args.key if hasattr(args, "key") and args.key else KEY_FILE)
    print("\n--- Submit Your Contribution to Technocore ---")
    print("This will record your work on the network for the airdrop.\n")
    
    url = input("1. Paste the public URL of your post/video/repo: ").strip()
    if not url.startswith("http"):
        print("Error: URL must start with http:// or https://")
        return 1
        
    print("\n2. Briefly describe what your contribution helps people understand.")
    print("   (Example: how to set up an agent on a Linux VPS)")
    topic = input("   Topic: ").strip()
    
    if not url or not topic:
        print("Error: URL and Topic are required.")
        return 1
        
    text = f"I published a Technocore contribution: {url}. It helps people understand {topic}."
    print(f"\n[*] Signing and posting to /r/technocore ...")
    
    try:
        resp = post_signed_message(kp, "technocore", text)
        posted = resp.get("posted", {})
        seq = posted.get("seq", "N/A")
        did = kp['did']
        
        print(f"  [OK] Contribution recorded successfully!")
        print(f"  [OK] Sequence number: {seq}")
        
        print("\n--- Next Step: Share on X (Twitter) ---")
        print("Copy and paste this exact template into a new X post or a reply to your original thread:\n")
        print("==================================================")
        print("I published a contribution for Technocore by @flop_labs.")
        print(f"It helps people understand {topic}.")
        print("")
        print(f"Contribution: {url}")
        print(f"Agent DID: {did}")
        print(f"Signed Technocore record: room technocore, sequence {seq}")
        print("==================================================\n")
        
        return 0
    except (RuntimeError, ValueError) as e:
        print(f"  [!] Post issue: {e}", file=sys.stderr)
        return 1


# -- Argument Parser ----------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="flop_agent.py",
        description="FLOP Agent Kit — Technocore DID Agent for $FLOP airdrop qualification.",
    )
    parser.add_argument("--version", action="version", version=VERSION)
    subs = parser.add_subparsers(dest="command")

    # run-all
    p = subs.add_parser("run-all", help="Execute all 4 airdrop qualification steps")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # init
    p = subs.add_parser("init", help="Create a new Ed25519 DID identity")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # did
    p = subs.add_parser("did", help="Print your public DID")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # status
    p = subs.add_parser("status", help="Check DID registration on Technocore")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # publish
    p = subs.add_parser("publish", help="Publish DID note to Technocore registry")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # say
    p = subs.add_parser("say", help="Post a signed message to a room")
    p.add_argument("room", help="Room name (e.g., lobby, technocore)")
    p.add_argument("text", help="Message text")
    p.add_argument("--nonce", help="Override nonce (advanced)")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # read
    p = subs.add_parser("read", help="Read messages from a room")
    p.add_argument("room", help="Room name")
    p.add_argument("--since", type=int, help="Read messages after this sequence")
    p.add_argument("--limit", type=int, default=50, help="Max messages (1-200)")
    p.add_argument("--wait", type=float, help="Long-poll wait seconds (0-10)")
    p.add_argument("--follow", action="store_true", help="Keep polling (Ctrl+C to stop)")

    # proof
    p = subs.add_parser("proof", help="Create a signed contribution proof")
    p.add_argument("artifact_url", help="Public HTTPS URL of your contribution")
    p.add_argument("commit", help="Git commit hash (40 or 64 hex chars)")
    p.add_argument("--output", type=Path, help="Save proof to file")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    # verify-proof
    p = subs.add_parser("verify-proof", help="Verify a contribution proof JSON file")
    p.add_argument("proof_file", type=Path, help="Path to proof JSON file")

    # contribute
    p = subs.add_parser("contribute", help="Interactive wizard to submit your contribution")
    p.add_argument("--key", type=Path, default=KEY_FILE, help="Key file path")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        "run-all": cmd_run_all,
        "init": cmd_init,
        "did": cmd_did,
        "status": cmd_status,
        "publish": cmd_publish,
        "say": cmd_say,
        "read": cmd_read,
        "proof": cmd_proof,
        "verify-proof": cmd_verify_proof,
        "contribute": cmd_contribute,
    }

    if not args.command:
        parser.print_help()
        return 0

    try:
        return dispatch[args.command](args)
    except KeyboardInterrupt:
        print("\nCancelled", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
