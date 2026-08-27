import json, sys
# Verbatim from flop_agent.py: cmd_run_all step 3, cmd_contribute.
def checkin_text(did): return f"Agent online. DID: {did}. Participating in the FLOP network."
def contribution_text(url, topic): return f"I published a Technocore contribution: {url}. It helps people understand {topic}."
def share_text(topic, url, did, seq):
    return "\n".join([
        "I published a contribution for Technocore by @flop_labs.",
        f"It helps people understand {topic}.",
        "",
        f"Contribution: {url}",
        f"Agent DID: {did}",
        f"Signed Technocore record: room technocore, sequence {seq}",
    ])
out=[]
for c in json.load(sys.stdin):
    u, t = c["url"].strip(), c["topic"].strip()   # CLI strips both inputs
    out.append({"id":c["id"], "checkin":checkin_text(c["did"]),
                "contrib":contribution_text(u,t), "share":share_text(t,u,c["did"],c["seq"])})
json.dump(out, sys.stdout, ensure_ascii=False)
