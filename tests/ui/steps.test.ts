/**
 * The onboarding step machine.
 *
 * One rule in this module is a safety rule rather than a navigation rule: **`introduce` and `contribute`
 * stay closed until the backup has been restored once.** Producing a file proves nothing about whether it
 * opens, so `backup === "exported"` is not enough — and since losing the key means losing the identity
 * permanently, a gate that could be skipped by typing a URL would be a gate in name only.
 *
 * The tests therefore sweep every reachable combination of flow state rather than checking a happy path,
 * and assert three invariants that must hold for all of them: a step reported as `ready` is genuinely open,
 * the step offered on resume is genuinely open, and the furthest reachable step never sits behind a closed
 * gate.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BackupState } from "../../src/identity/session.ts";
import {
  EMPTY_FLOW_STATE,
  furthestReachable,
  gateFor,
  isStepComplete,
  isStepSlug,
  nextStepSlug,
  NUMBERED_STEPS,
  previousStepSlug,
  resumeStepSlug,
  statusFor,
  stepBySlug,
  STEP_SLUGS,
  STEPS,
  type FlowState,
} from "../../src/ui/steps.ts";

const state = (overrides: Partial<FlowState> = {}): FlowState => ({ ...EMPTY_FLOW_STATE, ...overrides });

/** Identity created, backup proven to restore. The state every later step is written against. */
const protectedState = (overrides: Partial<FlowState> = {}): FlowState =>
  state({ hasIdentity: true, backup: "verified", ...overrides });

/** Every combination of the five flags. 48 states, which is small enough to check exhaustively. */
function allStates(): readonly FlowState[] {
  const out: FlowState[] = [];
  for (const hasIdentity of [false, true]) {
    for (const backup of ["none", "exported", "verified"] as readonly BackupState[]) {
      for (const introduced of [false, true]) {
        for (const contributed of [false, true]) {
          for (const verified of [false, true]) {
            out.push({ hasIdentity, backup, introduced, contributed, verified });
          }
        }
      }
    }
  }
  return out;
}

describe("the step list", () => {
  it("numbers five steps and treats completion as an outcome rather than a step", () => {
    assert.deepEqual(
      NUMBERED_STEPS.map((step) => [step.ordinal, step.name]),
      [
        [1, "Create"],
        [2, "Protect"],
        [3, "Introduce"],
        [4, "Contribute"],
        [5, "Verify"],
      ],
    );
    assert.equal(stepBySlug("complete").ordinal, null);
    assert.equal(NUMBERED_STEPS.some((step) => step.slug === "complete"), false);
  });

  it("describes every step in one line, in the second person", () => {
    for (const step of STEPS) {
      assert.equal(step.title.length > 0, true, step.slug);
      assert.equal(step.purpose.length > 0, true, step.slug);
      assert.equal(step.purpose.includes("\n"), false, step.slug);
      assert.equal(step.name.includes(" "), false, `${step.slug}: rail labels are one word`);
    }
  });

  it("recognises only its own slugs, since the route hands it arbitrary text", () => {
    for (const slug of STEP_SLUGS) assert.equal(isStepSlug(slug), true, slug);
    for (const value of ["", "Identity", "backup/", "../identity", "complete ", "dashboard"]) {
      assert.equal(isStepSlug(value), false, JSON.stringify(value));
    }
  });

  it("walks forwards and backwards, ending at the edges", () => {
    assert.equal(previousStepSlug("identity"), null);
    assert.equal(nextStepSlug("identity"), "backup");
    assert.equal(nextStepSlug("verify"), "complete");
    assert.equal(nextStepSlug("complete"), null);
    assert.equal(previousStepSlug("complete"), "verify");
  });
});

describe("the backup gate", () => {
  it("stays closed after an export, and opens only once the file has been restored", () => {
    for (const slug of ["introduce", "contribute"] as const) {
      const exported = gateFor(slug, state({ hasIdentity: true, backup: "exported" }));
      assert.equal(exported.open, false, slug);
      if (exported.open) return;
      assert.equal(exported.requires, "backup");

      assert.equal(gateFor(slug, protectedState()).open, true, slug);
    }
  });

  it("explains why, because someone arriving from a URL has no other context", () => {
    const gate = gateFor("introduce", state({ hasIdentity: true, backup: "exported" }));
    assert.equal(gate.open, false);
    if (gate.open) return;

    assert.equal(gate.reason.includes("has not been opened"), true, gate.reason);
    assert.equal(gate.reason.includes("decrypted once"), true, gate.reason);
  });

  it("is not satisfied by having posted something already", () => {
    // A stale tab could hold `introduced: true` with an unverified backup. The gate is about the key.
    const gate = gateFor("contribute", state({ hasIdentity: true, introduced: true, contributed: true }));
    assert.equal(gate.open, false);
  });
});

describe("gateFor", () => {
  it("always lets someone start", () => {
    for (const flowState of allStates()) assert.equal(gateFor("identity", flowState).open, true);
  });

  it("sends someone with no identity to create or import one", () => {
    for (const slug of ["backup", "introduce", "contribute", "verify", "complete"] as const) {
      const gate = gateFor(slug, state({ introduced: true, contributed: true, verified: true }));
      assert.equal(gate.open, false, slug);
      if (gate.open) return;
      assert.equal(gate.requires, "identity");
      assert.equal(gate.reason.includes("import"), true, gate.reason);
    }
  });

  it("opens backup as soon as there is an identity to protect", () => {
    assert.equal(gateFor("backup", state({ hasIdentity: true })).open, true);
  });

  it("needs a posted record before verification, and a verification before the summary", () => {
    const beforeContribution = gateFor("verify", protectedState({ introduced: true }));
    assert.equal(beforeContribution.open, false);
    if (beforeContribution.open) return;
    assert.equal(beforeContribution.requires, "contribute");

    const beforeVerification = gateFor("complete", protectedState({ contributed: true }));
    assert.equal(beforeVerification.open, false);
    if (beforeVerification.open) return;
    assert.equal(beforeVerification.requires, "verify");

    assert.equal(gateFor("verify", protectedState({ contributed: true })).open, true);
    assert.equal(gateFor("complete", protectedState({ contributed: true, verified: true })).open, true);
  });

  it("names a real step and gives a reason whenever it closes", () => {
    for (const flowState of allStates()) {
      for (const slug of STEP_SLUGS) {
        const gate = gateFor(slug, flowState);
        if (gate.open) continue;
        assert.equal(isStepSlug(gate.requires), true, `${slug}: ${gate.requires}`);
        assert.notEqual(gate.requires, slug, `${slug} cannot unlock itself`);
        assert.equal(gate.reason.trim().length > 0, true, slug);
      }
    }
  });
});

describe("statusFor", () => {
  it("shows the step being viewed as current, even when it is already done", () => {
    assert.equal(statusFor("identity", protectedState(), "identity"), "current");
    assert.equal(statusFor("backup", protectedState(), "backup"), "current");
  });

  it("marks finished steps done and reachable ones ready", () => {
    const now = protectedState();
    assert.equal(statusFor("identity", now, "introduce"), "done");
    assert.equal(statusFor("backup", now, "introduce"), "done");
    assert.equal(statusFor("contribute", now, "introduce"), "ready");
  });

  it("marks a gated step locked", () => {
    assert.equal(statusFor("contribute", state({ hasIdentity: true }), "backup"), "locked");
    assert.equal(statusFor("verify", protectedState({ introduced: true }), "introduce"), "locked");
  });

  it("never calls the completion screen done, because it is a summary and not a task", () => {
    const finished = protectedState({ introduced: true, contributed: true, verified: true });
    assert.equal(isStepComplete("complete", finished), false);
    assert.equal(statusFor("complete", finished, "verify"), "ready");
  });

  it("never reports ready for a step whose gate is closed", () => {
    for (const flowState of allStates()) {
      for (const slug of STEP_SLUGS) {
        if (statusFor(slug, flowState, "identity") !== "ready") continue;
        assert.equal(gateFor(slug, flowState).open, true, `${slug} reported ready behind a closed gate`);
      }
    }
  });
});

describe("furthestReachable and resumeStepSlug", () => {
  it("stops at the first closed gate rather than reporting a step it cannot open", () => {
    assert.equal(furthestReachable(EMPTY_FLOW_STATE), "identity");
    assert.equal(furthestReachable(state({ hasIdentity: true })), "backup");
    assert.equal(furthestReachable(state({ hasIdentity: true, backup: "exported" })), "backup");
    assert.equal(furthestReachable(protectedState()), "contribute");
    assert.equal(furthestReachable(protectedState({ contributed: true })), "verify");
    assert.equal(
      furthestReachable(protectedState({ contributed: true, verified: true })),
      "complete",
    );
  });

  it("resumes at the first unfinished step, not at the furthest one", () => {
    assert.equal(resumeStepSlug(EMPTY_FLOW_STATE), "identity");
    assert.equal(resumeStepSlug(state({ hasIdentity: true })), "backup");
    assert.equal(resumeStepSlug(state({ hasIdentity: true, backup: "exported" })), "backup");
    assert.equal(resumeStepSlug(protectedState()), "introduce");
    assert.equal(resumeStepSlug(protectedState({ introduced: true })), "contribute");
    assert.equal(resumeStepSlug(protectedState({ introduced: true, contributed: true })), "verify");
    assert.equal(
      resumeStepSlug(protectedState({ introduced: true, contributed: true, verified: true })),
      "complete",
    );
  });

  it("only ever offers a step that is actually open", () => {
    for (const flowState of allStates()) {
      const label = JSON.stringify(flowState);
      assert.equal(gateFor(furthestReachable(flowState), flowState).open, true, label);
      assert.equal(gateFor(resumeStepSlug(flowState), flowState).open, true, label);
    }
  });
});
