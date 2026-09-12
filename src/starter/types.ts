/**
 * First Agent Builder: Types and Data Models.
 *
 * Defines the archetype specifications, language scaffolding options,
 * generated file structures, and interactive builder state.
 */

export type AgentArchetypeId =
  | "TCLK_TRADER"
  | "TELEMETRY_INDEXER"
  | "LOBBY_BOT"
  | "CUSTOM_AGENT";

export type AgentLanguageId = "TYPESCRIPT" | "PYTHON";

export interface AgentArchetype {
  readonly id: AgentArchetypeId;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly badge: string;
  readonly defaultRoom: string;
  readonly defaultPayloadTemplate: string;
  readonly recommendedLanguage: AgentLanguageId;
  readonly capabilities: readonly string[];
}

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
  readonly language: "typescript" | "python" | "json" | "markdown" | "shell" | "env";
  readonly isEntrypoint?: boolean;
}

export interface StarterProject {
  readonly archetypeId: AgentArchetypeId;
  readonly languageId: AgentLanguageId;
  readonly agentName: string;
  readonly targetRoom: string;
  readonly publicDid: string;
  readonly files: readonly GeneratedFile[];
  readonly installCommand: string;
  readonly testCommand: string;
  readonly runCommand: string;
}

export interface StarterGenerationParams {
  readonly archetypeId: AgentArchetypeId;
  readonly languageId: AgentLanguageId;
  readonly agentName?: string;
  readonly targetRoom?: string;
  readonly publicDid?: string;
  readonly sampleMessageText?: string;
}
