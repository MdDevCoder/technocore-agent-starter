/**
 * Sonnet Command Center: Interactive Local Preflight Planning & Rehearsal Studio.
 *
 * Dedicated control interface for the FLOP 100,000 Sonnet Challenge (sonnet-2).
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  TEAM_MEMBERS,
  UNIVERSAL_FALLBACK_WORDS,
  filterCandidatesForAgent,
  type DidTeamMember,
  type CandidateWord,
} from "../sonnet/engine/vocabulary.ts";
import {
  getAllowedLettersFromDid,
  TOKEN_REGEX,
} from "../sonnet/engine/validator.ts";
import sonnetVocabData from "../../docs/sonnet_team_vocab.json";

interface LineWord {
  readonly token: string;
  readonly authorId: string;
  readonly syllables: number;
}

interface LineState {
  readonly lineIndex: number; // 0..13
  readonly stanzaIndex: number; // 0..3
  readonly rhymeFamily: string; // 'A'..'G'
  readonly words: readonly LineWord[];
}

const RHYME_SCHEME: readonly string[] = [
  "A", "B", "A", "B", // Stanza 1
  "C", "D", "C", "D", // Stanza 2
  "E", "F", "E", "F", // Stanza 3
  "G", "G",           // Couplet
];

export const SonnetCommandCenter: React.FC = () => {
  // 1. Initial 14-Line State
  const [lines, setLines] = useState<readonly LineState[]>(() => {
    return Array.from({ length: 14 }, (_, i) => {
      let stanzaIndex = 0;
      if (i >= 4 && i < 8) stanzaIndex = 1;
      else if (i >= 8 && i < 12) stanzaIndex = 2;
      else if (i >= 12) stanzaIndex = 3;

      const rhymeFamily = RHYME_SCHEME[i] ?? "A";

      return {
        lineIndex: i,
        stanzaIndex,
        rhymeFamily,
        words: [],
      };
    });
  });

  const [activeLineIdx, setActiveLineIdx] = useState<number>(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("Agent_1");
  const [proposedWord, setProposedWord] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // In-memory quick lexicon from preflight JSON
  const quickLexicon = useMemo(() => {
    const map = new Map<string, number>();
    for (const fw of UNIVERSAL_FALLBACK_WORDS) {
      map.set(fw.word.toLowerCase(), fw.syllables);
    }
    if (sonnetVocabData?.profiles) {
      for (const prof of sonnetVocabData.profiles) {
        if (prof.sampleWords) {
          for (const sw of prof.sampleWords) {
            map.set(sw.word.toLowerCase(), sw.syllables);
          }
        }
      }
    }
    return map;
  }, []);

  // Compute contribution counts
  const contributionCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Agent_1: 0,
      Agent_2: 0,
      Agent_3: 0,
      Agent_4: 0,
      Agent_5: 0,
    };
    for (const l of lines) {
      for (const w of l.words) {
        counts[w.authorId] = (counts[w.authorId] || 0) + 1;
      }
    }
    return counts;
  }, [lines]);

  // Last contributor across the entire poem
  const lastContributorId = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const currentLine = lines[i];
      if (currentLine && currentLine.words.length > 0) {
        const lastWord = currentLine.words[currentLine.words.length - 1];
        if (lastWord) return lastWord.authorId;
      }
    }
    return null;
  }, [lines]);

  // Next eligible contributors (Any member except last contributor)
  const nextEligibleAgents = useMemo(() => {
    return TEAM_MEMBERS.filter((m) => m.id !== lastContributorId);
  }, [lastContributorId]);

  // Current active line metrics
  const activeLine: LineState = useMemo(() => {
    return (
      lines[activeLineIdx] ??
      lines[0] ?? {
        lineIndex: 0,
        stanzaIndex: 0,
        rhymeFamily: "A",
        words: [],
      }
    );
  }, [lines, activeLineIdx]);

  const activeLineSyllables = useMemo(() => {
    return activeLine.words.reduce((sum, w) => sum + w.syllables, 0);
  }, [activeLine]);
  const syllablesRemaining = Math.max(0, 10 - activeLineSyllables);

  // Total poem syllables
  const totalPoemSyllables = useMemo(() => {
    return lines.reduce((total, l) => total + l.words.reduce((s, w) => s + w.syllables, 0), 0);
  }, [lines]);

  // Active selected member
  const activeMember: DidTeamMember = useMemo(() => {
    const found = TEAM_MEMBERS.find((m) => m.id === selectedAgentId);
    return found ?? TEAM_MEMBERS[0]!;
  }, [selectedAgentId]);

  const activeAllowedLetters = useMemo(() => {
    return Array.from(getAllowedLettersFromDid(activeMember.did)).sort().join("");
  }, [activeMember]);

  // Candidate words for active agent
  const candidatePool = useMemo(() => {
    const profile = sonnetVocabData?.profiles?.find((p: { agentId: string }) => p.agentId === selectedAgentId);
    const sampleWords: CandidateWord[] = (profile?.sampleWords || []).map((sw: { word: string; syllables: number; rhymeKey?: string }) => ({
      word: sw.word,
      syllables: sw.syllables,
      rhymeKey: sw.rhymeKey,
    }));
    const combined = [...UNIVERSAL_FALLBACK_WORDS, ...sampleWords];
    return filterCandidatesForAgent(combined, activeMember.did, syllablesRemaining, searchQuery);
  }, [selectedAgentId, activeMember.did, syllablesRemaining, searchQuery]);

  // Add word action
  const handleAddWord = useCallback(
    (wordToken: string) => {
      setValidationError(null);
      const token = wordToken.trim();
      if (!token) return;

      // 1. Check Non-Consecutive Rule
      if (lastContributorId === selectedAgentId) {
        setValidationError(`Turn Violation: ${activeMember.name} was the last contributor. Next turn must be taken by another team member.`);
        return;
      }

      // 2. Validate token regex
      if (!TOKEN_REGEX.test(token)) {
        setValidationError("Format Error: Word must be an English word optionally followed by [,.;:!?].");
        return;
      }

      // 3. Extract word and validate against DID letters
      const cleanMatch = token.match(TOKEN_REGEX);
      if (!cleanMatch || !cleanMatch[1]) return;
      const cleanWord = cleanMatch[1].toLowerCase();

      // Check letters
      const allowed = getAllowedLettersFromDid(activeMember.did);
      const missing: string[] = [];
      for (const ch of cleanWord) {
        if (ch >= "a" && ch <= "z" && !allowed.has(ch)) {
          if (!missing.includes(ch)) missing.push(ch);
        }
      }
      if (missing.length > 0) {
        setValidationError(`Letter Violation: Letters absent from ${activeMember.name}'s DID: [${missing.sort().join(", ")}]`);
        return;
      }

      // Estimate syllables (from lexicon or fallback heuristic)
      const syllables = quickLexicon.get(cleanWord) || 1;

      // 4. Check Line Overflow
      if (activeLineSyllables + syllables > 10) {
        setValidationError(`Line Overflow: Word '${token}' (${syllables} syl) exceeds remaining capacity (${syllablesRemaining} syl). Line must not exceed 10 syllables.`);
        return;
      }

      // Append word to active line
      setLines((prev) => {
        const next = [...prev];
        const curLine = next[activeLineIdx];
        if (!curLine) return prev;
        const updatedWords: readonly LineWord[] = [
          ...curLine.words,
          {
            token,
            authorId: selectedAgentId,
            syllables,
          },
        ];
        next[activeLineIdx] = {
          lineIndex: curLine.lineIndex,
          stanzaIndex: curLine.stanzaIndex,
          rhymeFamily: curLine.rhymeFamily,
          words: updatedWords,
        };
        return next;
      });

      setProposedWord("");

      // Auto-advance to next line if exactly 10 syllables reached
      if (activeLineSyllables + syllables === 10 && activeLineIdx < 13) {
        setActiveLineIdx((prev) => prev + 1);
      }

      // Auto-switch to next eligible agent
      const nextEligible = TEAM_MEMBERS.filter((m) => m.id !== selectedAgentId);
      if (nextEligible.length > 0 && nextEligible[0]) {
        setSelectedAgentId(nextEligible[0].id);
      }
    },
    [lastContributorId, selectedAgentId, activeMember, activeLineSyllables, syllablesRemaining, activeLineIdx, quickLexicon]
  );

  const handleRemoveLastWord = useCallback(() => {
    setValidationError(null);
    setLines((prev) => {
      const next = [...prev];
      const curLine = next[activeLineIdx];
      if (curLine && curLine.words.length > 0) {
        next[activeLineIdx] = {
          lineIndex: curLine.lineIndex,
          stanzaIndex: curLine.stanzaIndex,
          rhymeFamily: curLine.rhymeFamily,
          words: curLine.words.slice(0, -1),
        };
      } else if (activeLineIdx > 0) {
        setActiveLineIdx(activeLineIdx - 1);
        const prevLine = next[activeLineIdx - 1];
        if (prevLine) {
          next[activeLineIdx - 1] = {
            lineIndex: prevLine.lineIndex,
            stanzaIndex: prevLine.stanzaIndex,
            rhymeFamily: prevLine.rhymeFamily,
            words: prevLine.words.slice(0, -1),
          };
        }
      }
      return next;
    });
  }, [activeLineIdx]);

  const handleResetPoem = useCallback(() => {
    if (typeof window !== "undefined" && window.confirm("Reset all lines in the local planning rehearsal?")) {
      setLines((prev) =>
        prev.map((l) => ({
          lineIndex: l.lineIndex,
          stanzaIndex: l.stanzaIndex,
          rhymeFamily: l.rhymeFamily,
          words: [],
        }))
      );
      setActiveLineIdx(0);
      setValidationError(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 min-h-screen bg-void text-ink font-sans">
      {/* Top Provenance & Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl border border-hairline bg-panel shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="h-3 w-3 rounded-full bg-signal animate-pulse" />
          <h1 className="text-base font-bold tracking-tight uppercase text-ink">
            Technocore Sonnet Command Center
          </h1>
          <span className="rounded bg-signal/15 border border-signal/30 px-2 py-0.5 text-xs font-bold text-signal mono">
            CONTEST: sonnet-2
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mono text-xs">
          <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-sky-400 font-semibold">
            ● LIVE PROTOCOL: READ-ONLY
          </span>
          <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-amber-400 font-semibold">
            ● DERIVED CMUDICT ANALYSIS
          </span>
          <span className="rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-purple-300 font-semibold">
            ● LOCAL PLANNING STATE
          </span>
        </div>
      </div>

      {/* Main Grid: Left Column (Team & Word Engine) + Right Column (Poem Workspace) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Team Matrix, Turn Controls & Candidate Finder (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Team Roster & Contribution Quota Card */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider uppercase text-muted mono">
                Team Roster (5 Writers · Min 1 Word Each)
              </h2>
              <span className="text-xs mono text-signal font-semibold">
                Alphabet: 26/26 (100%)
              </span>
            </div>

            <div className="space-y-2">
              {TEAM_MEMBERS.map((member) => {
                const count = contributionCounts[member.id] || 0;
                const isSelected = selectedAgentId === member.id;
                const isLast = lastContributorId === member.id;
                const hasContributed = count >= 1;

                return (
                  <div
                    key={member.id}
                    onClick={() => setSelectedAgentId(member.id)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? "border-signal/60 bg-signal/10 shadow-sm"
                        : "border-hairline bg-panel-high/50 hover:border-hairline-high"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isLast
                              ? "bg-amber-400"
                              : isSelected
                              ? "bg-signal"
                              : "bg-muted"
                          }`}
                        />
                        <span className="text-xs font-bold text-ink">{member.name}</span>
                        {isLast && (
                          <span className="rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 text-[10px] mono">
                            LAST TURN
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mono text-xs">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            hasContributed
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                          }`}
                        >
                          {count} Words {hasContributed ? "✓" : "(Quota Pending)"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] mono text-muted">
                      <span className="truncate max-w-[220px]" title={member.did}>
                        {member.did.slice(0, 18)}...{member.did.slice(-8)}
                      </span>
                      <span className="text-faint">{member.roleDescription}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Turn Proposal Controller */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider uppercase text-muted mono">
                Turn Proposal Rehearsal
              </h2>
              <span className="mono text-xs text-ink font-semibold">
                Active: <span className="text-signal font-bold">{activeMember.name}</span>
              </span>
            </div>

            {/* Allowed Letters Bar */}
            <div className="p-2 rounded bg-void/60 border border-hairline mono text-xs">
              <div className="text-muted text-[10px] font-semibold uppercase mb-0.5">
                Allowed Letters ({activeMember.name}):
              </div>
              <div className="text-signal tracking-widest break-all font-mono">
                {activeAllowedLetters.split("").join(" ")}
              </div>
            </div>

            {/* Next Eligible Notice */}
            <div className="flex items-center gap-1.5 text-xs mono text-muted">
              <span>Next Eligible Writers:</span>
              <div className="flex items-center gap-1">
                {nextEligibleAgents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgentId(a.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      selectedAgentId === a.id
                        ? "bg-signal/20 text-signal border border-signal/40"
                        : "bg-panel-high text-muted hover:text-ink"
                    }`}
                  >
                    {a.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Word Proposal Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddWord(proposedWord);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={proposedWord}
                onChange={(e) => {
                  setValidationError(null);
                  setProposedWord(e.target.value);
                }}
                placeholder="Type English word (e.g. 'The', 'night,')..."
                className="flex-1 rounded-lg border border-hairline bg-void px-3 py-2 text-xs mono text-ink placeholder:text-muted focus:border-signal focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-signal px-4 py-2 text-xs font-bold text-void hover:bg-signal/90 transition-colors shrink-0"
              >
                + Add Turn
              </button>
            </form>

            {validationError && (
              <div className="p-2.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs mono">
                ⚠ {validationError}
              </div>
            )}
          </div>

          {/* Legal Word Candidate Finder */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider uppercase text-muted mono">
                Legal Word Candidates ({candidatePool.length})
              </h2>
              <span className="mono text-xs text-muted">
                Max Syl: <span className="text-signal font-bold">{syllablesRemaining}</span>
              </span>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate vocabulary..."
              className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-xs mono text-ink placeholder:text-muted focus:border-signal focus:outline-none"
            />

            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {candidatePool.slice(0, 30).map((c, idx) => (
                <div
                  key={`${c.word}_${idx}`}
                  onClick={() => handleAddWord(c.word)}
                  className="flex items-center justify-between p-1.5 px-2 rounded hover:bg-panel-high border border-transparent hover:border-hairline cursor-pointer mono text-xs transition-colors"
                >
                  <span className="text-ink font-semibold">{c.word}</span>
                  <div className="flex items-center gap-2">
                    {c.rhymeKey && (
                      <span className="text-[10px] text-muted truncate max-w-[100px]">
                        /{c.rhymeKey}/
                      </span>
                    )}
                    <span className="rounded bg-signal/15 text-signal px-1.5 text-[10px] font-bold">
                      {c.syllables} syl
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: 14-Line Poem State & Metrical Visualizer (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Poem Header & Progress Bar */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-ink uppercase">
                  14-Line Shakespearean Sonnet (4/4/4/2 Stanzas)
                </h2>
                <div className="mono text-xs text-muted">
                  Rhyme Scheme: <span className="text-signal font-bold">ABAB CDCD EFEF GG</span> (7 Distinct Families)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRemoveLastWord}
                  className="rounded px-2.5 py-1 text-xs mono font-semibold text-muted hover:bg-panel-high hover:text-ink border border-hairline"
                >
                  ⌫ Undo Last Word
                </button>
                <button
                  onClick={handleResetPoem}
                  className="rounded px-2.5 py-1 text-xs mono font-semibold text-rose-400 hover:bg-rose-950/40 border border-rose-500/30"
                >
                  Reset Poem
                </button>
              </div>
            </div>

            {/* Total Syllable Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs mono">
                <span className="text-muted">Total Poem Syllables:</span>
                <span className="font-bold text-ink">
                  {totalPoemSyllables} / 140 Syllables ({Math.round((totalPoemSyllables / 140) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-void overflow-hidden border border-hairline">
                <div
                  className="h-full bg-signal transition-all duration-300"
                  style={{ width: `${Math.min(100, (totalPoemSyllables / 140) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* 14-Line Stanza Grid */}
          <div className="space-y-3">
            {[0, 1, 2, 3].map((stanzaIdx) => {
              const stanzaLines = lines.filter((l) => l.stanzaIndex === stanzaIdx);
              const stanzaLabels = ["Quatrain 1", "Quatrain 2", "Quatrain 3 (Volta)", "Final Couplet"];

              return (
                <div
                  key={`stanza_${stanzaIdx}`}
                  className="p-3.5 rounded-xl border border-hairline bg-panel space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-1">
                    <span className="font-bold uppercase tracking-wider text-ink">
                      {stanzaLabels[stanzaIdx]}
                    </span>
                    <span className="text-faint">
                      {stanzaIdx < 3 ? "4 Lines · 40 Syllables" : "2 Lines · 20 Syllables"}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {stanzaLines.map((line) => {
                      const lineSyllables = line.words.reduce((sum, w) => sum + w.syllables, 0);
                      const isLineActive = activeLineIdx === line.lineIndex;
                      const isComplete = lineSyllables === 10;

                      return (
                        <div
                          key={`line_${line.lineIndex}`}
                          onClick={() => setActiveLineIdx(line.lineIndex)}
                          className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isLineActive
                              ? "border-signal/60 bg-signal/10 shadow-sm"
                              : isComplete
                              ? "border-emerald-500/30 bg-emerald-950/10"
                              : "border-hairline bg-void/60 hover:border-hairline-high"
                          }`}
                        >
                          {/* Line Number & Rhyme Label */}
                          <div className="flex items-center gap-2 mono text-xs shrink-0">
                            <span className="w-5 text-muted font-bold">
                              L{line.lineIndex + 1}
                            </span>
                            <span className="rounded bg-panel-high text-signal border border-signal/30 px-1.5 py-0.5 text-[10px] font-bold">
                              [{line.rhymeFamily}]
                            </span>
                          </div>

                          {/* Line Words */}
                          <div className="flex-1 flex flex-wrap items-center gap-1.5 text-xs">
                            {line.words.length === 0 ? (
                              <span className="text-muted italic text-[11px]">
                                {isLineActive ? "← Awaiting turn proposal..." : "Empty line"}
                              </span>
                            ) : (
                              line.words.map((w, wIdx) => {
                                const agentName = TEAM_MEMBERS.find((m) => m.id === w.authorId)?.name.split(" ")[0] || w.authorId;
                                return (
                                  <span
                                    key={wIdx}
                                    title={`Author: ${w.authorId} (${w.syllables} syl)`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-panel border border-hairline font-medium text-ink"
                                  >
                                    <span>{w.token}</span>
                                    <span className="text-[9px] mono text-signal font-bold">
                                      {agentName}
                                    </span>
                                  </span>
                                );
                              })
                            )}
                          </div>

                          {/* Syllable Counter */}
                          <div className="mono text-xs shrink-0">
                            <span
                              className={`rounded px-1.5 py-0.5 font-bold ${
                                isComplete
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : lineSyllables > 10
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  : "bg-panel-high text-muted"
                              }`}
                            >
                              {lineSyllables} / 10 syl
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
