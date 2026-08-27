import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// Candidate — must be byte-identical to the CLI templates.
export const checkinText = (did) => `Agent online. DID: ${did}. Participating in the FLOP network.`;
export const contributionText = (url, topic) =>
  `I published a Technocore contribution: ${url}. It helps people understand ${topic}.`;
export const shareText = (topic, url, did, seq) => [
  "I published a contribution for Technocore by @flop_labs.",
  `It helps people understand ${topic}.`,
  "",
  `Contribution: ${url}`,
  `Agent DID: ${did}`,
  `Signed Technocore record: room technocore, sequence ${seq}`,
].join("\n");

const did = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
const cases = [
  ["https://x.com/u/status/1", "how to set up an agent on a Linux VPS", 120684],
  ["  https://x.com/u/2  ", "  padded topic  ", 1],
  ["https://ex.com/ünï√öde", "unicode 技術 topic 🚀", 999999],
  ["https://ex.com/a?b=1&c=2#d", "query strings & ampersands", 42],
  ["https://ex.com/x", "topic with | pipe and \"quotes\"", 7],
  ["https://ex.com/y", "multi\nline topic", 8],
  ["https://ex.com/z", "", 0],
].map(([url, topic, seq], i) => ({ id: `t${i}`, url, topic, did, seq }));

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

const oracle = JSON.parse(execFileSync(getPythonCommand(), [fileURLToPath(new URL("./templates_oracle.py", import.meta.url))],
  { input: JSON.stringify(cases) }).toString());

let pass = 0, fail = 0;
for (const [i, c] of cases.entries()) {
  const u = c.url.trim(), t = c.topic.trim();
  const got = { checkin: checkinText(c.did), contrib: contributionText(u, t), share: shareText(t, u, c.did, c.seq) };
  for (const k of ["checkin", "contrib", "share"]) {
    if (oracle[i][k] === got[k]) pass++;
    else { fail++; console.log(`FAIL ${c.id}.${k}\n  py=${JSON.stringify(oracle[i][k])}\n  js=${JSON.stringify(got[k])}`); }
  }
}
console.log(`TEMPLATE DIFFERENTIAL: ${pass} pass / ${fail} fail`);
console.log("\n--- exact X share proof, as the CLI emits it ---");
console.log(shareText("how to set up an agent on a Linux VPS", "https://x.com/u/status/1", did, 120684));
console.log("--- end ---");
