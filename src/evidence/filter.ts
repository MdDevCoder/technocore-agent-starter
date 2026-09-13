/**
 * Technocore Contribution Evidence Vault — Case-Insensitive Search & Filter Engine
 *
 * Normalizes both search query and target hash (and metadata fields) with `.toLowerCase()`.
 * Stored SHA-256 values remain canonical lowercase hexadecimal.
 */

import type { ContributionEvidenceV1 } from "./types.ts";

/**
 * Filter evidence records case-insensitively by SHA-256 integrity hash,
 * payload hash, topic, DID, room, sequence, or message text.
 *
 * @param records Array of preserved evidence records
 * @param query Search query string (case-insensitive)
 * @returns Filtered array of matching records (unmutated stored representations)
 */
export function filterEvidenceRecords(
  records: ContributionEvidenceV1[],
  query: string,
): ContributionEvidenceV1[] {
  if (!query || typeof query !== "string") {
    return records;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return records;
  }

  return records.filter((item) => {
    // Normalize both stored values and search query with .toLowerCase()
    const hash = (item.evidenceSha256 || "").toLowerCase();
    const payloadHash = (item.canonicalPayloadSha256 || "").toLowerCase();
    const topic = (item.topic || "").toLowerCase();
    const did = (item.did || "").toLowerCase();
    const room = (item.room || "").toLowerCase();
    const text = (item.text || "").toLowerCase();
    const seqStr = String(item.seq || "");
    const projectName = (item.projectName || "").toLowerCase();
    const gitCommit = (item.gitCommit || "").toLowerCase();

    return (
      hash.includes(normalizedQuery) ||
      payloadHash.includes(normalizedQuery) ||
      topic.includes(normalizedQuery) ||
      did.includes(normalizedQuery) ||
      room.includes(normalizedQuery) ||
      text.includes(normalizedQuery) ||
      seqStr.includes(normalizedQuery) ||
      projectName.includes(normalizedQuery) ||
      gitCommit.includes(normalizedQuery)
    );
  });
}
