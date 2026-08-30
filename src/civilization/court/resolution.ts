/**
 * Court Resolution Engine.
 *
 * Translates judicial verdicts into binding civilization state transitions.
 * Keeps resolution execution strictly decoupled from judicial deliberation.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { generatePrefixedId, type IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CourtResolution, CourtVerdict } from "./types.ts";

export async function applyCourtResolution(
  executorIdentity: AgentIdentity,
  missionId: string,
  verdict: CourtVerdict,
  verdictEvent: CivilizationEvent<"VERDICT_ISSUED">,
  timestamp?: IsoUtcTimestamp,
): Promise<{ resolution: CourtResolution; event: CivilizationEvent<"RESOLUTION_APPLIED"> }> {
  const appliedAt = timestamp ?? new Date().toISOString();
  const resolutionId = generatePrefixedId("res", 8);

  let executionDetails = "";
  switch (verdict.bindingAction) {
    case "accept_deliverable":
      executionDetails = "Deliverable marked accepted; review approved per court verdict.";
      break;
    case "revise_deliverable":
      executionDetails = "Deliverable rejected with required revisions; task returned to active development.";
      break;
    case "reassign_task":
      executionDetails = "Task unassigned from respondent and returned to dynamic recruitment pool.";
      break;
    case "request_additional_evidence":
      executionDetails = "Court requires supplemental evidence before issuing final binding judgment.";
      break;
    case "dismiss_dispute":
    default:
      executionDetails = "Dispute formally dismissed with no state mutation.";
      break;
  }

  const resolution: CourtResolution = {
    resolutionId,
    disputeId: verdict.disputeId,
    verdictId: verdict.verdictId,
    appliedAction: verdict.bindingAction,
    executionDetails,
    appliedAt,
  };

  const event = await signCivilizationEvent(
    {
      eventType: "RESOLUTION_APPLIED",
      missionId,
      authorDid: executorIdentity.did,
      payload: {
        resolutionId,
        disputeId: verdict.disputeId,
        verdictEventId: verdictEvent.eventId,
        appliedAction: verdict.bindingAction,
        executionDetails,
      },
      parentEventIds: [verdictEvent.eventId],
    },
    executorIdentity.signingHandle,
  );

  return { resolution, event };
}
