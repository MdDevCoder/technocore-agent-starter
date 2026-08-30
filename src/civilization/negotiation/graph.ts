/**
 * Negotiation Graph & Proposal Lineage Tracking.
 *
 * Implements immutable proposal trees, counter-proposal chain traversal,
 * status transitions, expiration checking, and conflict resolution.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { RoleProposal } from "./types.ts";

export class NegotiationGraph {
  readonly missionId: string;
  private readonly proposals = new Map<string, RoleProposal>();
  private readonly children = new Map<string, string[]>(); // parentProposalId -> childProposalIds[]
  private readonly rootProposals: string[] = [];

  constructor(missionId: string) {
    this.missionId = missionId;
  }

  /**
   * Adds a newly submitted proposal or counter-proposal to the graph.
   */
  addProposal(proposal: RoleProposal): void {
    if (proposal.missionId !== this.missionId) {
      throw new Error(`Proposal missionId "${proposal.missionId}" does not match graph missionId "${this.missionId}"`);
    }

    if (this.proposals.has(proposal.proposalId)) {
      return; // Idempotent
    }

    this.proposals.set(proposal.proposalId, { ...proposal });

    if (proposal.parentProposalId) {
      const parent = this.proposals.get(proposal.parentProposalId);
      if (parent) {
        // Mark parent as countered
        this.proposals.set(parent.proposalId, { ...parent, status: "countered" });
      }
      const siblings = this.children.get(proposal.parentProposalId) ?? [];
      siblings.push(proposal.proposalId);
      this.children.set(proposal.parentProposalId, siblings);
    } else {
      this.rootProposals.push(proposal.proposalId);
    }
  }

  /**
   * Marks a proposal as accepted.
   */
  acceptProposal(proposalId: string): RoleProposal {
    const existing = this.proposals.get(proposalId);
    if (!existing) {
      throw new Error(`Cannot accept non-existent proposal "${proposalId}"`);
    }
    if (existing.status === "expired" || existing.status === "withdrawn") {
      throw new Error(`Cannot accept proposal "${proposalId}" with status "${existing.status}"`);
    }

    const updated: RoleProposal = { ...existing, status: "accepted" };
    this.proposals.set(proposalId, updated);
    return updated;
  }

  /**
   * Marks a proposal as rejected.
   */
  rejectProposal(proposalId: string): RoleProposal {
    const existing = this.proposals.get(proposalId);
    if (!existing) {
      throw new Error(`Cannot reject non-existent proposal "${proposalId}"`);
    }

    const updated: RoleProposal = { ...existing, status: "rejected" };
    this.proposals.set(proposalId, updated);
    return updated;
  }

  /**
   * Marks a proposal as withdrawn by its proposer.
   */
  withdrawProposal(proposalId: string, proposerDid: DidString): RoleProposal {
    const existing = this.proposals.get(proposalId);
    if (!existing) {
      throw new Error(`Cannot withdraw non-existent proposal "${proposalId}"`);
    }
    if (existing.proposerDid !== proposerDid) {
      throw new Error(`Proposer "${proposerDid}" is not authorized to withdraw proposal "${proposalId}"`);
    }

    const updated: RoleProposal = { ...existing, status: "withdrawn" };
    this.proposals.set(proposalId, updated);
    return updated;
  }

  /**
   * Retrieves a proposal by its ID.
   */
  getProposal(proposalId: string): RoleProposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Retrieves all accepted proposals currently in the graph.
   */
  getAcceptedProposals(): readonly RoleProposal[] {
    return Array.from(this.proposals.values()).filter((p) => p.status === "accepted");
  }

  /**
   * Retrieves all proposals currently pending evaluation.
   */
  getPendingProposals(): readonly RoleProposal[] {
    return Array.from(this.proposals.values()).filter((p) => p.status === "pending");
  }

  /**
   * Returns the complete lineage chain from root proposal to target proposal.
   */
  getProposalChain(proposalId: string): readonly RoleProposal[] {
    const chain: RoleProposal[] = [];
    let currentId: string | undefined = proposalId;

    while (currentId) {
      const prop = this.proposals.get(currentId);
      if (!prop) break;
      chain.unshift(prop);
      currentId = prop.parentProposalId;
    }

    return chain;
  }

  /**
   * Checks if a proposal has expired.
   */
  isExpired(proposalId: string, asOfTimestamp?: IsoUtcTimestamp): boolean {
    const prop = this.proposals.get(proposalId);
    if (!prop) return false;
    const ref = asOfTimestamp ? new Date(asOfTimestamp).getTime() : Date.now();
    const expiry = new Date(prop.expiresAt).getTime();
    return ref >= expiry;
  }

  /**
   * Returns all proposals in the graph.
   */
  getAllProposals(): readonly RoleProposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Total proposals count.
   */
  get size(): number {
    return this.proposals.size;
  }
}
