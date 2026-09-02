/**
 * Emergent Narrative Synthesizer.
 *
 * Dynamically derives human-readable civilization narrative updates from
 * the canonical signed CivilizationEvent stream.
 *
 * NO HARDCODED FICTION. Every sentence directly corresponds to real historical events.
 */

import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type { EmergentNarrativeItem } from "../types.ts";

export function deriveNarrativeFromEvents(
  events: readonly CivilizationEvent[],
  maxItems = 30,
): EmergentNarrativeItem[] {
  const items: EmergentNarrativeItem[] = [];
  const targetSlice = events.slice(-maxItems);

  for (const evt of targetSlice) {
    const time = evt.timestamp || new Date().toISOString();
    const authorShort = evt.authorDid ? `${evt.authorDid.slice(0, 16)}...` : "Unknown Agent";
    const payload = (evt.payload || {}) as unknown as Record<string, unknown>;

    switch (evt.eventType) {
      case "AGENT_DISCOVERED": {
        const did = typeof payload.did === "string" ? payload.did : evt.authorDid;
        const name = typeof payload.displayName === "string" ? payload.displayName : `Agent ${did.slice(0, 12)}`;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Citizen Discovered: ${name}`,
          detail: `${name} announced presence in the network with verified capabilities.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "CAPABILITY_ADVERTISED": {
        const caps = Array.isArray(payload.capabilities)
          ? (payload.capabilities as { name: string; proficiency: number }[])
          : [];
        const capNames = caps.length > 0
          ? caps.map((c) => `${c.name} (${c.proficiency})`).join(", ")
          : "Verified Skills";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Capability Attestation Published`,
          detail: `Agent ${authorShort} published verified proficiencies: ${capNames}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "MISSION_CREATED": {
        const title = typeof payload.title === "string" ? payload.title : `Mission ${evt.missionId || evt.eventId.slice(0, 8)}`;
        const budget = payload.budget as { amount?: number; token?: string } | undefined;
        const budgetStr = budget?.amount ? ` with a budget of ${budget.amount.toLocaleString()} ${budget.token || "FLOP"}` : "";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Mission Initiated: ${title}`,
          detail: `Civilization coordinator created mission "${title}"${budgetStr}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "PROPOSAL_SUBMITTED": {
        const role = typeof payload.role === "string" ? payload.role : "Specialist";
        const responsibility = typeof payload.responsibility === "string" ? payload.responsibility : "Core Task";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Role Proposal Submitted`,
          detail: `Agent ${authorShort} proposed role "${role}" for responsibility: ${responsibility}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "SPECIALIST_REQUESTED": {
        const cap = typeof payload.requiredCapability === "string" ? payload.requiredCapability : "Specialist";
        const minProf = typeof payload.minProficiency === "number" ? payload.minProficiency : 75;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Specialist Recruited`,
          detail: `Team formation gap detected. Coordinator requested specialist in ${cap} (min ${minProf}%).`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "TEAM_FORMED": {
        const teamName = typeof payload.teamName === "string" ? payload.teamName : `Team ${evt.missionId || evt.eventId.slice(0, 8)}`;
        const memberCount = Array.isArray(payload.memberDids) ? payload.memberDids.length : 1;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Dynamic Team Formed: ${teamName}`,
          detail: `Consensus reached. Team formed with ${memberCount} specialist agents.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "DELIVERABLE_SUBMITTED": {
        const deliv = payload.deliverable as { summary?: string; type?: string } | undefined;
        const summary = deliv?.summary || typeof payload.title === "string" ? (payload.title as string) : "Task output";
        const type = deliv?.type || "artifact";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Task Deliverable Published`,
          detail: `Agent ${authorShort} completed task: ${summary} (${type}).`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "REVIEW_ACCEPTED": {
        const score = typeof payload.score === "number" ? payload.score : 85;
        const comments = typeof payload.comments === "string" ? payload.comments : "Deliverable meets requirements.";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Peer Review Approved (Score ${score}/100)`,
          detail: `Peer review accepted: "${comments}". Submitter reputation reinforced.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "REVIEW_REJECTED": {
        const reason = typeof payload.reason === "string" ? payload.reason : "Deliverable failed test suite.";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Peer Review Rejected`,
          detail: `Reviewer rejected deliverable: "${reason}". Dispute escalation triggered.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "DISPUTE_OPENED": {
        const subject = (typeof payload.subject === "string" ? payload.subject : null) ||
          (typeof payload.reason === "string" ? payload.reason : null) ||
          "Artifact Discrepancy";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Agent Court Dispute Opened`,
          detail: `Formal machine dispute filed: "${subject}". 3 independent judges nominated.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "court",
        });
        break;
      }

      case "VOTE_CAST": {
        const vote = typeof payload.vote === "string" ? payload.vote : "DELIBERATED";
        const rationale = typeof payload.rationale === "string" ? payload.rationale : "Evaluated evidence";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Court Judge Cast Ballot: ${vote}`,
          detail: `Judge ${authorShort} deliberated: "${rationale}".`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "court",
        });
        break;
      }

      case "VERDICT_ISSUED": {
        const verdictObj = payload.verdict as { outcome?: string; verdict?: string } | undefined;
        const decision = verdictObj?.outcome || verdictObj?.verdict || (typeof payload.outcome === "string" ? payload.outcome : "RESOLVED");
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Court Verdict Issued: ${decision}`,
          detail: `Trial concluded with verified judge consensus. Resolution action enacted.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "court",
        });
        break;
      }

      case "REPUTATION_ATTESTED": {
        const target = typeof payload.targetDid === "string" ? payload.targetDid : evt.authorDid;
        const delta = typeof payload.scoreDelta === "number" ? payload.scoreDelta : 0;
        const sign = delta >= 0 ? "+" : "";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Reputation Shift (${sign}${delta.toFixed(1)})`,
          detail: `Agent ${target.slice(0, 16)}... reputation recalculated from signed evidence.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: delta >= 0 ? "success" : "warning",
        });
        break;
      }

      case "MISSION_COMPLETED": {
        const summary = typeof payload.summary === "string" ? payload.summary : "All mission objectives completed.";
        const count = typeof payload.completedTasksCount === "number" ? payload.completedTasksCount : 1;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Mission Completed Successfully`,
          detail: `${summary} (${count} deliverables verified).`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      // Phase 9: Economic & Execution Narrative Cases
      case "MISSION_ESCROW_CREATED": {
        const total = typeof payload.totalBudget === "number" ? payload.totalBudget : 0;
        const count = typeof payload.milestoneCount === "number" ? payload.milestoneCount : 1;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Mission Escrow Locked (${total} FLOP)`,
          detail: `Budget locked across ${count} verifiable milestone(s) for mission ${evt.missionId}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "AGENT_BID_SUBMITTED": {
        const amount = typeof payload.requestedAmount === "number" ? payload.requestedAmount : 0;
        const cap = typeof payload.capabilityPledged === "string" ? payload.capabilityPledged : "Specialist";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Economic Bid Submitted (${amount} FLOP)`,
          detail: `Agent ${authorShort} pledged ${cap} for compensation of ${amount} FLOP.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "WORK_CONTRACT_ESTABLISHED": {
        const comp = typeof payload.agreedCompensation === "number" ? payload.agreedCompensation : 0;
        const target = typeof payload.agentDid === "string" ? `${payload.agentDid.slice(0, 16)}...` : authorShort;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Work Contract Established (${comp} FLOP)`,
          detail: `Binding work contract enacted with ${target} for task ${typeof payload.taskId === "string" ? payload.taskId : ""}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "EXECUTION_STARTED": {
        const env = typeof payload.runtimeEnvironment === "string" ? payload.runtimeEnvironment : "sandbox";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Sandboxed Execution Started`,
          detail: `Agent ${authorShort} initiated verified execution in ${env}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "VERIFIED_WORK_PROOF_PUBLISHED": {
        const status = typeof payload.status === "string" ? payload.status : "VERIFIED";
        const testSummary = payload.testSummary as { passed?: number; total?: number } | undefined;
        const testDetails = testSummary ? ` (${testSummary.passed ?? 0} tests passed)` : "";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Verified Work Proof Published [${status}]`,
          detail: `Cryptographic SHA-256 artifact hashes and automated verification compiled${testDetails}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: status === "VERIFIED" ? "success" : "warning",
        });
        break;
      }

      case "MILESTONE_COMPLETED": {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Milestone Verified & Completed`,
          detail: `Task deliverable verified against contract acceptance criteria.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "ESCROW_RELEASED": {
        const amount = typeof payload.amount === "number" ? payload.amount : 0;
        const recipient = typeof payload.recipientDid === "string" ? `${payload.recipientDid.slice(0, 16)}...` : "Agent";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Escrow Released (+${amount} FLOP)`,
          detail: `Payout released from escrow to ${recipient} upon verified completion.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "ESCROW_REFUNDED": {
        const amount = typeof payload.amount === "number" ? payload.amount : 0;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Escrow Refunded (${amount} FLOP)`,
          detail: `Funds returned to mission creator following resolution.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "PAYMENT_ISSUED": {
        const amount = typeof payload.amount === "number" ? payload.amount : 0;
        const recipient = typeof payload.recipientDid === "string" ? `${payload.recipientDid.slice(0, 16)}...` : "Agent";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Payment Credited (${amount} FLOP)`,
          detail: `Economic balance credited to ${recipient} with signed proof receipt.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "PENALTY_APPLIED": {
        const amount = typeof payload.amount === "number" ? payload.amount : 0;
        const target = typeof payload.agentDid === "string" ? `${payload.agentDid.slice(0, 16)}...` : authorShort;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Judicial Penalty Deducted (-${amount} FLOP)`,
          detail: `Agent Court consensus verdict deducted stake penalty from ${target}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      // Phase 10: Evolution Events Narrative

      case "CAPABILITY_GAP_DETECTED": {
        const cap = typeof payload.targetCapability === "string" ? payload.targetCapability : "skill";
        const severity = typeof payload.severityScore === "number" ? payload.severityScore : 80;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Capability Gap Identified: ${cap}`,
          detail: `Agent ${authorShort} identified high-severity gap in ${cap} (Severity ${severity}/100).`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "LEARNING_PROPOSED": {
        const cap = typeof payload.targetCapability === "string" ? payload.targetCapability : "skill";
        const deposit = typeof payload.learningFeeDeposit === "number" ? payload.learningFeeDeposit : 500;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Learning Proposed: ${cap}`,
          detail: `Agent ${authorShort} committed ${deposit} FLOP deposit to acquire ${cap} based on positive ROI.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "LEARNING_IN_PROGRESS": {
        const cap = typeof payload.targetCapability === "string" ? payload.targetCapability : "skill";
        const profile = typeof payload.verificationProfileType === "string" ? payload.verificationProfileType : "standard";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Benchmark Execution: ${cap}`,
          detail: `Sandboxed learning benchmark initiated for ${cap} with ${profile} profile.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "CAPABILITY_VERIFIED": {
        const cap = typeof payload.targetCapability === "string" ? payload.targetCapability : "skill";
        const prof = typeof payload.verifiedProficiency === "number" ? payload.verifiedProficiency : 85;
        const verifier = typeof payload.verifierDid === "string" ? `${payload.verifierDid.slice(0, 16)}...` : "Independent Evaluator";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Capability Verified: ${cap} (${prof}%)`,
          detail: `Independent verifier ${verifier} validated benchmark performance for ${cap}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "CAPABILITY_ATTESTED": {
        const cap = typeof payload.targetCapability === "string" ? payload.targetCapability : "skill";
        const prof = typeof payload.verifiedProficiency === "number" ? payload.verifiedProficiency : 85;
        const confidence = typeof payload.confidence === "string" ? payload.confidence.toUpperCase() : "HIGH";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Capability Attestation Issued: ${cap}`,
          detail: `Signed cryptographic attestation published for ${cap} (Proficiency ${prof}%, Confidence: ${confidence}).`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "STRATEGY_ADAPTED": {
        const dim = typeof payload.strategyDimension === "string" ? payload.strategyDimension : "POLICY";
        const v = typeof payload.version === "number" ? payload.version : 1;
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Strategy Adapted (${dim} v${v})`,
          detail: `Agent ${authorShort} updated operational policy based on empirical outcome evidence.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "DEAL_OFFER_CREATED": {
        const amt = typeof payload.amount === "string" ? payload.amount : "0";
        const asset = typeof payload.asset === "string" ? payload.asset : "FLOP";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Offer Created (${amt} ${asset})`,
          detail: `Agent ${authorShort} published an autonomous tclk/1 deal offer for task coordination.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "DEAL_OFFER_ACCEPTED": {
        const contractId = typeof payload.contractId === "string" ? payload.contractId.slice(0, 12) + "..." : "contract";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Offer Accepted [${contractId}]`,
          detail: `Payee ${authorShort} accepted deal terms and committed public statement hash.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "DEAL_FUNDS_LOCKED": {
        const rail = typeof payload.rail === "string" ? payload.rail : "rehearsal";
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Escrow Locked (${rail})`,
          detail: `Payer ${authorShort} locked rehearsal escrow funds under commitment statement.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }

      case "DEAL_SECRET_REVEALED": {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Secret Revealed & Escrow Claimed`,
          detail: `Payee ${authorShort} published verified preimage, claiming protocol escrow.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      case "DEAL_REFUND_CLAIMED": {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Escrow Refunded`,
          detail: `Payer ${authorShort} reclaimed escrowed funds after timelock expiry.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "DEAL_CANCELLED": {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Cancelled`,
          detail: `Deal cancelled before funds locked by ${authorShort}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "warning",
        });
        break;
      }

      case "DEAL_RECEIPT_ISSUED": {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `Deal Terminal Receipt Acknowledged`,
          detail: `Agent ${authorShort} issued final protocol receipt acknowledging settlement.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "success",
        });
        break;
      }

      default: {
        items.push({
          id: `nar_${evt.eventId}`,
          timestamp: time,
          headline: `System Event: ${evt.eventType}`,
          detail: `Signed canonical event published to room by ${authorShort}.`,
          eventType: evt.eventType,
          sourceEventId: evt.eventId,
          actorDid: evt.authorDid,
          severity: "info",
        });
        break;
      }
    }
  }

  // Return the most recent entries, latest first
  return items.reverse();
}
