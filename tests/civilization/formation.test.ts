import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  constructTeamFormedPayload,
  createAgentIdentity,
  evaluateTeamReadiness,
  handleAgentWithdrawal,
  type CivilizationMission,
  type RoleProposal,
} from "../../src/civilization/index.ts";

describe("Dynamic Team Formation & Reorganization Engine", () => {
  it("evaluates formation readiness and detects capability gaps accurately", async () => {
    const agentArch = await createAgentIdentity({ displayName: "Arch", role: "Architect" });
    const agentCoder = await createAgentIdentity({ displayName: "Coder", role: "Dev" });

    const mission: CivilizationMission = {
      missionId: "mis_form_01",
      creatorDid: agentArch.did,
      genesisAgentDid: agentArch.did,
      title: "Encrypted Messaging API",
      objective: "E2EE Relay",
      requirements: [
        { capability: "architecture", minProficiency: 80, requiredCount: 1 },
        { capability: "node-backend", minProficiency: 85, requiredCount: 1 },
        { capability: "security-audit", minProficiency: 90, requiredCount: 1 }, // Missing initially
      ],
      constraints: [],
      deadline: "2026-09-01T00:00:00Z",
      budget: { token: "FLOP", amount: 30000 },
      status: "team_forming",
      teamDids: [agentArch.did],
      createdAt: "2026-08-29T10:00:00Z",
      updatedAt: "2026-08-29T10:00:00Z",
    };

    const propArch: RoleProposal = {
      proposalId: "prp_arch_01",
      missionId: mission.missionId,
      proposerDid: agentArch.did,
      role: "Lead Architect",
      responsibility: "System design",
      proposedCapabilities: [{ name: "architecture", proficiency: 95 }],
      estimatedEffortMinutes: 30,
      ttlSeconds: 1800,
      expiresAt: "2026-08-29T10:30:00Z",
      createdAt: "2026-08-29T10:00:00Z",
      dependencies: [],
      status: "accepted",
    };

    const propCoder: RoleProposal = {
      proposalId: "prp_coder_01",
      missionId: mission.missionId,
      proposerDid: agentCoder.did,
      role: "Backend Engineer",
      responsibility: "Node relay",
      proposedCapabilities: [{ name: "node-backend", proficiency: 90 }],
      estimatedEffortMinutes: 45,
      ttlSeconds: 1800,
      expiresAt: "2026-08-29T10:30:00Z",
      createdAt: "2026-08-29T10:00:00Z",
      dependencies: [],
      status: "accepted",
    };

    // 1. Partial readiness -> missing security-audit
    const partialReadiness = evaluateTeamReadiness(mission, [propArch, propCoder]);
    assert.equal(partialReadiness.ready, false);
    assert.equal(partialReadiness.missingRequirements.length, 1);
    assert.equal(partialReadiness.missingRequirements[0]?.requiredCapability, "security-audit");

    // 2. Add security specialist
    const agentSec = await createAgentIdentity({ displayName: "Sentinel", role: "Auditor" });
    const propSec: RoleProposal = {
      proposalId: "prp_sec_01",
      missionId: mission.missionId,
      proposerDid: agentSec.did,
      role: "Security Auditor",
      responsibility: "Security review",
      proposedCapabilities: [{ name: "security-audit", proficiency: 95 }],
      estimatedEffortMinutes: 40,
      ttlSeconds: 1800,
      expiresAt: "2026-08-29T10:30:00Z",
      createdAt: "2026-08-29T10:00:00Z",
      dependencies: [],
      status: "accepted",
    };

    const fullReadiness = evaluateTeamReadiness(mission, [propArch, propCoder, propSec]);
    assert.equal(fullReadiness.ready, true);
    assert.equal(fullReadiness.participatingDids.length, 3);

    // 3. Construct verified TeamFormedPayload
    const payload = constructTeamFormedPayload(mission.missionId, "E2EE Core Squad", [
      propArch,
      propCoder,
      propSec,
    ]);
    assert.equal(payload.teamName, "E2EE Core Squad");
    assert.equal(payload.memberDids.length, 3);
    assert.equal(payload.roles[agentArch.did], "Lead Architect");
    assert.equal(payload.roles[agentCoder.did], "Backend Engineer");
    assert.equal(payload.roles[agentSec.did], "Security Auditor");
    assert.equal(payload.referencedProposalIds?.length, 3);
  });

  it("handles agent withdrawal and triggers dynamic replacement recruitment", async () => {
    const withdrawingDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const stayingDid = "did:key:z6MkjqG85QeG9Vz7Jv8b3jM2xH6F4d9L1k7N5p3R2m4T6w8Y";

    const currentMembers = [withdrawingDid, stayingDid];
    const currentRoles = {
      [withdrawingDid]: "Backend Engineer",
      [stayingDid]: "Architect",
    };

    const result = handleAgentWithdrawal(
      withdrawingDid,
      "Hardware node migration",
      currentMembers,
      currentRoles,
      ["node-backend"],
      ["tsk_task_01"],
    );

    assert.equal(result.updatedMembers.length, 1);
    assert.equal(result.updatedMembers[0], stayingDid);
    assert.equal(result.updatedRoles[stayingDid], "Architect");
    assert.equal(result.updatedRoles[withdrawingDid], undefined);

    assert.equal(result.withdrawalPayload.agentDid, withdrawingDid);
    assert.equal(result.withdrawalPayload.vacatedRole, "Backend Engineer");
    assert.deepEqual(result.withdrawalPayload.unassignedTaskIds, ["tsk_task_01"]);

    assert.ok(result.specialistRequestPayload);
    assert.equal(result.specialistRequestPayload.requiredCapability, "node-backend");
  });
});
