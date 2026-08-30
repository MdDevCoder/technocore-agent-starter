/**
 * Cryptographic Work Proof Synthesis.
 *
 * Computes deterministic WebCrypto SHA-256 hashes of execution artifacts,
 * test summaries, and build outputs, assembling verifiable `VerifiedWorkProof` records.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type {
  ExecutionArtifact,
  ExecutionReport,
  VerificationPipelineResult,
  VerifiedWorkProof,
} from "./types.ts";

/**
 * Computes a standard hex SHA-256 digest using WebCrypto.
 */
export async function computeSha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds an immutable, typed ExecutionArtifact with verified content hash.
 */
export async function createExecutionArtifact(params: {
  readonly name: string;
  readonly path: string;
  readonly type: ExecutionArtifact["type"];
  readonly content: string;
  readonly timestamp?: IsoUtcTimestamp;
}): Promise<ExecutionArtifact> {
  const contentHash = await computeSha256Hex(params.content);
  return {
    artifactId: generatePrefixedId("art", 8),
    name: params.name,
    path: params.path,
    type: params.type,
    contentHash,
    sizeBytes: new TextEncoder().encode(params.content).length,
    content: params.content,
    createdAt: params.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Assembles a canonical VerifiedWorkProof from execution and verification outcomes.
 */
export async function synthesizeVerifiedWorkProof(params: {
  readonly agentDid: DidString;
  readonly missionId: string;
  readonly taskId: string;
  readonly deliverableId: string;
  readonly contractId: string;
  readonly executionReport: ExecutionReport;
  readonly pipelineResult: VerificationPipelineResult;
  readonly timestamp?: IsoUtcTimestamp;
}): Promise<VerifiedWorkProof> {
  const { executionReport, pipelineResult } = params;

  // 1. Hash all output artifacts
  const artifactHashes = executionReport.artifacts.map((a) => a.contentHash);

  // 2. Hash build / execution log
  const buildLog = `exitCode:${executionReport.exitCode}\nstdout:${executionReport.stdout}\nstderr:${executionReport.stderr}`;
  const buildResultHash = await computeSha256Hex(buildLog);

  // 3. Hash structured test summary
  const testSummaryStr = JSON.stringify(executionReport.testSummary);
  const testResultHash = await computeSha256Hex(testSummaryStr);

  // 4. Hash full execution report
  const executionDigest = await computeSha256Hex(
    `${params.taskId}:${executionReport.executionId}:${artifactHashes.join(",")}:${testResultHash}`,
  );

  return {
    proofId: generatePrefixedId("proof", 8),
    agentDid: params.agentDid,
    missionId: params.missionId,
    taskId: params.taskId,
    deliverableId: params.deliverableId,
    contractId: params.contractId,
    status: pipelineResult.status,
    artifactHashes,
    buildResultHash,
    testResultHash,
    executionResultHash: executionDigest,
    testSummary: executionReport.testSummary,
    pipelineResult,
    timestamp: params.timestamp ?? new Date().toISOString(),
  };
}
