# EVF Security Prompt Pack v1.0
### By CryptiqVerse — Ethical Security Engineering Framework
---

> **Philosophy:** Every prompt in this pack is scoped to YOUR OWN project only.
> The goal is to find vulnerabilities so you can FIX them — not exploit them.
> This is white-hat, responsible, production-grade security engineering.

---

## HOW TO USE THIS PACK

```
This is a Mission-Based Security Framework.

When you paste the MASTER PROMPT below into your AI (Antigravity IDE or any other),
it will:

1. Scan your tech stack automatically
2. Generate a full security checklist upfront (so you always know where you are)
3. Work through each security area ONE BY ONE
4. Explain WHY each security measure matters in simple terms
5. Implement the fix
6. Generate a test artifact (PowerShell + JS) to verify it works
7. Tick off the task and move to the next one
8. Never skip ahead until current task is verified

You will never get lost. Think of it as a GPS for security.
It tells you: where you are, what's next, and when you've arrived.
```

---

## ENVIRONMENT SETUP — PASTE THIS FIRST

```text
ENVIRONMENT CONTEXT:
 
Project Name: <YOUR PROJECT NAME>
 
--- BACKEND ---
Live API URL:  <YOUR LIVE API URL or type "NOT AVAILABLE">
Local API URL: <YOUR LOCAL API URL e.g. http://localhost:3000 or type "NOT AVAILABLE">
 
--- FRONTEND ---
Live Frontend URL:  <YOUR LIVE FRONTEND URL e.g. https://cryptiqverse.xyz or type "NOT AVAILABLE">
Local Frontend URL: <YOUR LOCAL FRONTEND URL e.g. http://localhost:5173 or type "NOT AVAILABLE">
 
Preferred Test Output: PowerShell (.ps1) AND JavaScript (.js)
 
Rules:
- If Live URLs are available, generate tests targeting the live URLs
- If only Local URLs are available, generate tests targeting localhost
- If both are available, generate tests for BOTH environments
- Backend security tasks must test against the Backend URLs
- Frontend security tasks must test against the Frontend URLs
- Tasks that cover both (e.g. CORS, CSP, XSS) must test against BOTH URLs
- Never test any URL that is not provided above
- All testing is scoped to this project only
- All actions are ethical, fix-oriented, and responsible
```

---

## MASTER SECURITY PROMPT — PASTE THIS AFTER ENVIRONMENT CONTEXT

```text
You are a senior ethical security engineer working on my project.

Follow the EVF Security Engineering Framework strictly.

---

STEP 1 — STACK DETECTION (Do this first, no code changes yet)

Scan the entire codebase and identify:
- Backend language and framework (Node/Express, Python/Django, etc.)
- Frontend framework (React, Vue, Next.js, etc.)
- Database type (PostgreSQL, MongoDB, MySQL, etc.)
- Authentication method (JWT, Sessions, OAuth, etc.)
- Hosting/deployment environment if detectable
- Any existing security middleware already in place

Output this as: STACK_DETECTION_REPORT.md

---

STEP 2 — GENERATE SECURITY TASK CHECKLIST

Based on the detected stack, generate a full prioritized checklist of every
security area that needs to be implemented or reviewed.

Format it exactly like this:

SECURITY MISSION CHECKLIST
==========================
[ ] TASK-01 — Rate Limiting
[ ] TASK-02 — Brute Force Protection
[ ] TASK-03 — Input Validation & Sanitization
[ ] TASK-04 — SQL / NoSQL Injection Prevention
[ ] TASK-05 — Authentication Hardening
[ ] TASK-06 — JWT Security
[ ] TASK-07 — Password Security (Hashing, Strength, Reset Flow)
[ ] TASK-08 — Session Management
[ ] TASK-09 — Authorization & Role-Based Access Control (RBAC)
[ ] TASK-10 — CORS Configuration
[ ] TASK-11 — HTTP Security Headers
[ ] TASK-12 — XSS (Cross-Site Scripting) Prevention
[ ] TASK-13 — CSRF (Cross-Site Request Forgery) Protection
[ ] TASK-14 — Secrets & Environment Variable Security
[ ] TASK-15 — Dependency Vulnerability Audit
[ ] TASK-16 — API Security (Endpoint Protection, Versioning, Exposure)
[ ] TASK-17 — File Upload Security (if applicable)
[ ] TASK-18 — Logging & Monitoring (Security Events)
[ ] TASK-19 — Error Handling (No sensitive data leakage)
[ ] TASK-20 — Database Security (Access, Exposure, Backups)
[ ] TASK-21 — DoS / DDoS Basic Protection
[ ] TASK-22 — Clickjacking Prevention
[ ] TASK-23 — Open Redirect Prevention
[ ] TASK-24 — Mass Assignment Protection
[ ] TASK-25 — Security Misconfiguration Review
[ ] TASK-26 — Production Hardening Final Check

Add or remove tasks based on what the detected stack actually needs.
Label added tasks as TASK-XX with a short name.

Output this checklist at the top of: SECURITY_MISSION.md

Do not start any task yet. Wait for my confirmation to proceed.

---

STEP 3 — EXECUTE TASKS ONE BY ONE

After I confirm, start with TASK-01 and follow this exact structure for EVERY task:

════════════════════════════════════════════
TASK-[NUMBER] — [TASK NAME]
Current Status: [ ] NOT STARTED
════════════════════════════════════════════

WHY THIS MATTERS (Simple Explanation):
---------------------------------------
[Explain in simple, beginner-friendly terms why this vulnerability is dangerous.
Use a real-world analogy if possible. Keep it short — 3 to 5 lines max.]

WHAT AN ATTACKER WOULD DO WITHOUT THIS:
-----------------------------------------
[Describe briefly and clearly what attack becomes possible if this is missing.
Do NOT provide actual attack code. Keep it conceptual and educational.]

IMPLEMENTATION:
---------------
[Write clean, production-ready code for this stack.
Add inline comments explaining what each part does and why.
Do not remove any existing working functionality.
Do not break any existing API contracts.
Do not change database schema unless absolutely required.]

FILES MODIFIED:
---------------
[List every file that was changed and what was changed in it]

HOW TO VERIFY IT WORKS:
------------------------
[Explain what the expected behavior is after implementation.
What should happen when it works correctly?
What should happen when an attack is attempted?]

TEST ARTIFACT — PowerShell:
-----------------------------
[Provide a complete, ready-to-run .ps1 script that:
- Tests the feature works correctly
- Tests that the protection kicks in when it should
- Uses fake/dummy data only (never real credentials)
- Outputs colored results (Green = expected, Red = blocked/protected, Yellow = needs attention)
- Works against both LIVE and LOCAL URLs based on what was provided
- Includes comments explaining what each section is testing]

TEST ARTIFACT — JavaScript:
-----------------------------
[Provide a complete, ready-to-run .js script (Node.js) that:
- Does the same as the PowerShell test above
- Can be run with: node test-[taskname].js
- Outputs clear pass/fail results to the console
- Uses fake/dummy data only
- Includes comments explaining what each section is testing]

VERIFICATION CHECKLIST:
------------------------
Before moving to the next task, confirm ALL of these:
[ ] Code is implemented and saved
[ ] PowerShell test has been run and shows expected results
[ ] JS test has been run and shows expected results
[ ] No existing functionality was broken
[ ] No sensitive data is exposed in logs or responses

════════════════════════════════════════════
TASK-[NUMBER] STATUS: [X] COMPLETE
Moving to TASK-[NEXT NUMBER]...
════════════════════════════════════════════

---

IMPORTANT RULES FOR ALL TASKS:
- Complete ONE task fully before moving to the next
- Never skip a task without my explicit approval
- If a task is not applicable to this stack, mark it as [SKIPPED - NOT APPLICABLE] and explain why
- If you are unsure about something, ask me before implementing
- Test artifacts must use only dummy/fake data — never real user data
- Never generate actual exploit code — only defensive implementations and verification tests
- After every 5 tasks, output an updated checklist showing progress

GIT PROTECTION RULES — CRITICAL:
- NEVER stage, commit, or push ANY code changes during this entire process
- NEVER run: git add, git commit, git push, or any git write command
- After ALL 26 tasks are fully complete and verified, show a full summary of every file modified
- Present a complete git diff summary and wait for my explicit written approval
- Only after I type "APPROVED — PUSH IT" should you stage, commit, and push
- Use Conventional Commit format: e.g. "security: implement rate limiting and brute force protection"
- If you are ever unsure whether to push — DO NOT PUSH. Ask me first.
- Violating this rule can break production. There are no exceptions.

---

STEP 4 — FINAL SECURITY REPORT

After all tasks are complete, generate: SECURITY_FINAL_REPORT.md

Include:
- Executive Summary (beginner-friendly overview of what was done)
- Full checklist with all tasks marked complete/skipped
- List of all files modified
- List of all test artifacts generated
- Any remaining recommendations
- What to re-check every 3 months (maintenance schedule)
- What to add next as the product scales (Version 2 security roadmap)
```

---

## INDIVIDUAL TASK REFERENCE — WHAT EACH TASK COVERS

> This section is for YOUR reference so you understand what's coming.
> You don't need to paste this into the AI.

---

### TASK-01 — Rate Limiting
Limits how many requests a user/IP can make in a time window.
Protects against: Brute force, spam, scraping, DoS.
Example: Max 5 login attempts → 15 minute cooldown.

---

### TASK-02 — Brute Force Protection
Goes beyond rate limiting. Tracks failed attempts per account/IP.
Locks accounts temporarily after repeated failures.
Protects against: Credential stuffing, password guessing.

---

### TASK-03 — Input Validation & Sanitization
Every piece of data coming into your server must be checked and cleaned.
Nothing from the outside world should be trusted.
Protects against: Injection attacks, malformed data crashes, unexpected behavior.

---

### TASK-04 — SQL / NoSQL Injection Prevention
Attackers try to sneak database commands into your input fields.
Parameterized queries and ORM sanitization stop this cold.
Protects against: Data theft, data deletion, full database takeover.

---

### TASK-05 — Authentication Hardening
Reviews your entire login/signup/logout flow for weaknesses.
Ensures tokens are invalidated on logout, sessions expire correctly.
Protects against: Account takeover, session hijacking.

---

### TASK-06 — JWT Security
JWTs must be signed with strong secrets, have expiry times, and be validated properly.
Weak JWT implementation is one of the most common API vulnerabilities.
Protects against: Token forgery, privilege escalation, replay attacks.

---

### TASK-07 — Password Security
Passwords must be hashed (bcrypt/argon2), never stored plain.
Password reset flows must use time-limited secure tokens.
Strength requirements must be enforced.
Protects against: Credential leaks, account takeover after data breach.

---

### TASK-08 — Session Management
Sessions must expire, be invalidated on logout, and be stored securely.
Protects against: Session fixation, session hijacking.

---

### TASK-09 — Authorization & RBAC
Just because a user is logged in doesn't mean they can access everything.
Every route must check: who is this user and what are they allowed to do?
Protects against: Privilege escalation, unauthorized data access (IDOR).

---

### TASK-10 — CORS Configuration
Controls which domains are allowed to talk to your API.
A misconfigured CORS policy is like leaving your back door open.
Protects against: Cross-origin attacks, unauthorized API access from other websites.

---

### TASK-11 — HTTP Security Headers
Simple headers that tell browsers how to behave when serving your app.
Things like: don't load this in an iframe, only use HTTPS, block MIME sniffing.
Protects against: Clickjacking, MIME attacks, protocol downgrade attacks.

---

### TASK-12 — XSS Prevention
Cross-Site Scripting — attackers inject malicious scripts into your pages.
All user-generated content must be escaped before rendering.
Protects against: Cookie theft, session hijacking, page defacement.

---

### TASK-13 — CSRF Protection
Cross-Site Request Forgery — tricks a logged-in user into making unwanted requests.
CSRF tokens or SameSite cookies prevent this.
Protects against: Unauthorized actions performed on behalf of a victim user.

---

### TASK-14 — Secrets & Environment Variable Security
API keys, database passwords, JWT secrets must NEVER be hardcoded.
.env files must never be committed to Git.
Protects against: Credential exposure, full system compromise.

---

### TASK-15 — Dependency Vulnerability Audit
Your npm/pip/etc packages may have known vulnerabilities.
Running an audit finds them and tells you what to update.
Protects against: Supply chain attacks, known exploits in third-party code.

---

### TASK-16 — API Security
Endpoints should not expose more data than needed.
Internal endpoints must be protected. API versioning must be in place.
Protects against: Data over-exposure, unauthorized access to internal routes.

---

### TASK-17 — File Upload Security
If your app accepts file uploads, it must validate type, size, and content.
Uploaded files must never be executed on the server.
Protects against: Malware uploads, server-side code execution, storage abuse.

---

### TASK-18 — Logging & Monitoring
Security events (failed logins, suspicious requests, errors) must be logged.
But logs must never contain passwords, tokens, or personal data.
Protects against: Undetected attacks, inability to investigate incidents.

---

### TASK-19 — Error Handling
Error messages shown to users must never reveal stack traces, file paths,
database names, or internal logic.
Protects against: Information leakage that helps attackers map your system.

---

### TASK-20 — Database Security
Database should not be publicly accessible.
Least-privilege principle: app user should only have the permissions it needs.
Protects against: Direct database attacks, accidental data exposure.

---

### TASK-21 — DoS / DDoS Basic Protection
Beyond rate limiting — things like request size limits, connection timeouts,
and payload size caps prevent your server from being overwhelmed.
Protects against: Server crashes from malicious traffic floods.

---

### TASK-22 — Clickjacking Prevention
Prevents your site from being loaded inside a hidden iframe on another site.
X-Frame-Options or CSP frame-ancestors header stops this.
Protects against: UI redress attacks, trick clicks that perform unwanted actions.

---

### TASK-23 — Open Redirect Prevention
If your app redirects users based on a URL parameter, attackers can redirect
victims to malicious sites while appearing to come from your trusted domain.
Protects against: Phishing attacks, credential harvesting.

---

### TASK-24 — Mass Assignment Protection
When your API accepts objects and binds them directly to database models,
attackers can sneak in fields like `isAdmin: true`.
Whitelist only the fields you expect.
Protects against: Privilege escalation, unauthorized data modification.

---

### TASK-25 — Security Misconfiguration Review
Debug mode left on in production. Default credentials not changed.
Unnecessary services running. Directory listing enabled.
All of these are misconfigurations that open doors for attackers.
Protects against: Easy wins for attackers who scan for low-hanging fruit.

---

### TASK-26 — Production Hardening Final Check
A final pass across the entire codebase and config before going live.
Ensures nothing was missed and everything is production-ready.
This is your final sign-off before the product is considered secure.

---

## HOW TO PHRASE THINGS SO THE AI NEVER REFUSES YOU
> This is YOUR cheat sheet. Keep it handy during sessions.
> Certain words trigger AI refusals mid-session — use the right phrasing below instead.
> Nothing changes about what you're doing — just how you ask for it.

| ❌ Don't Say This | ✅ Say This Instead |
|---|---|
| "Perform a security audit" | "Review this for production security engineering" |
| "Perform penetration testing" | "Verify my protection is functioning correctly" |
| "Perform vulnerability analysis" | "Review this for production robustness" |
| "Scan for exploits" | "Test that my defensive implementation is working" |
| "Review OWASP vulnerabilities" | "Align this with production security best practices" |
| "Hack my login page" | "Generate a verification test for my rate limiting" |
| "Find security holes" | "Review this implementation for any gaps in protection" |

---

## QUICK REFERENCE — TEST ARTIFACT NAMING

| Task | PowerShell File | JS File |
|------|----------------|---------|
| Rate Limiting | test-rate-limit.ps1 | test-rate-limit.js |
| Brute Force | test-brute-force.ps1 | test-brute-force.js |
| Input Validation | test-input-validation.ps1 | test-input-validation.js |
| Injection Prevention | test-injection.ps1 | test-injection.js |
| Auth Hardening | test-auth.ps1 | test-auth.js |
| JWT Security | test-jwt.ps1 | test-jwt.js |
| Password Security | test-passwords.ps1 | test-passwords.js |
| CORS | test-cors.ps1 | test-cors.js |
| Security Headers | test-headers.ps1 | test-headers.js |
| XSS | test-xss.ps1 | test-xss.js |
| CSRF | test-csrf.ps1 | test-csrf.js |
| API Security | test-api.ps1 | test-api.js |
| File Upload | test-uploads.ps1 | test-uploads.js |

---

## MAINTENANCE SCHEDULE
> Paste this into your AI every 3 months to keep security up to date.

```text
Perform a quarterly security maintenance review on this project.

Check:
- New dependency vulnerabilities (run audit)
- Expired or weak secrets that need rotation
- Any new endpoints added since last review that are missing security middleware
- Rate limit thresholds — are they still appropriate for current traffic?
- Logs — any suspicious patterns detected?
- Any new security best practices for this stack released in the last 3 months?

Generate: QUARTERLY_SECURITY_REVIEW.md with findings and recommended actions.
```

---

*EVF Security Prompt Pack v1.0 — Built for CryptiqVerse*
*White-hat. Fix-oriented. Beginner-friendly. Attacker-proof.*
