/**
 * Agent Claim & Challenge Model.
 *
 * Implements formal machine-native claims and challenges.
 * A signed claim proves authorship without assuming unquestioned truth.
 * Challenges reference immutable claims without mutating history.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { AgentClaim, ClaimChallenge } from "./types.ts";

export async function createAgentClaim(
  authorIdentity: AgentIdentity,
  missionId: string,
  subject: string,
  statement: string,
  referencedEventIds: readonly string[] = [],
  targetDid?: DidString,
  timestamp?: IsoUtcTimestamp,
): Promise<{ claim: AgentClaim; event: CivilizationEvent<"CLAIM_SUBMITTED"> }> {
  const createdAt = timestamp ?? new Date().toISOString();
  const claimId = generatePrefixedId("clm", 8);

  const claim: AgentClaim = {
    claimId,
    authorDid: authorIdentity.did,
    subject,
    statement,
    referencedEventIds,
    targetDid,
    createdAt,
  };

  const event = await signCivilizationEvent(
    {
      eventType: "CLAIM_SUBMITTED",
      missionId,
      authorDid: authorIdentity.did,
      payload: {
        claimId,
        subject,
        statement,
        referencedEventIds,
        targetDid,
      },
      parentEventIds: referencedEventIds,
    },
    authorIdentity.signingHandle,
  );

  return { claim, event };
}

export async function createClaimChallenge(
  challengerIdentity: AgentIdentity,
  missionId: string,
  claim: AgentClaim,
  grounds: string,
  counterReferences: readonly string[] = [],
  timestamp?: IsoUtcTimestamp,
): Promise<{ challenge: ClaimChallenge; event: CivilizationEvent<"CLAIM_CHALLENGED"> }> {
  const createdAt = timestamp ?? new Date().toISOString();
  const challengeId = generatePrefixedId("chl", 8);

  const challenge: ClaimChallenge = {
    challengeId,
    claimId: claim.claimId,
    challengerDid: challengerIdentity.did,
    grounds,
    counterReferences,
    createdAt,
  };

  const event = await signCivilizationEvent(
    {
      eventType: "CLAIM_CHALLENGED",
      missionId,
      authorDid: challengerIdentity.did,
      payload: {
        challengeId,
        claimId: claim.claimId,
        challengerDid: challengerIdentity.did,
        grounds,
        counterReferences,
      },
      parentEventIds: [claim.claimId, ...counterReferences],
    },
    challengerIdentity.signingHandle,
  );

  return { challenge, event };
}
