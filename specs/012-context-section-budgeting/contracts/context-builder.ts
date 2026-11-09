// ContextBuilder Contract
// Function-based section builder used by every strategy prompt.

import type { StrategyHistoryMessage } from "../../agents/types.js";

export type SectionName = "system" | "summary" | "window" | "memories";

export type CutRule =
  | "never"
  | "oldest-first"
  | "lowest-score-first"
  | "truncate-end";

export interface MemoryEntry {
  fact: string;
  score: number;
}

export interface BudgetConfig {
  system: number | null;
  summary: number | null;
  window: number | null;
  memories: number | null;
}

export interface SectionOptions {
  budget: number | null;
  cut: CutRule;
}

export type SectionContent =
  | string
  | readonly StrategyHistoryMessage[]
  | readonly MemoryEntry[];

export interface Section {
  name: SectionName;
  content: SectionContent;
  budget: number | null;
  cut: CutRule;
}

export interface FittedSection extends Section {
  text: string;
  tokens: number;
  truncated: boolean;
}

export interface BuildInput {
  systemPrompt?: string | null;
  summary?: string | null;
  history?: readonly StrategyHistoryMessage[];
  memories?: readonly MemoryEntry[];
  userMessage: string;
  budget?: BudgetConfig;
}

export interface BuildContextResult {
  prompt: string;
  sections: FittedSection[];
  totalTokens: number;
  truncatedSections: SectionName[];
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig;

export function readBudgetConfig(env?: NodeJS.ProcessEnv): BudgetConfig;
export function parseBudget(
  raw: string | undefined,
  fallback: number | null,
): number | null;
export function section(
  name: SectionName,
  content: SectionContent,
  options: SectionOptions,
): Section;
export function fitToBudget(section: Section): FittedSection;
export function sectionText(section: Section | FittedSection): string;
export function assemble(
  fitted: readonly FittedSection[],
  userMessage: string,
): BuildContextResult;
export function buildContext(input: BuildInput): BuildContextResult;
export function createContextBuilder(): {
  build: typeof buildContext;
  getConfig: () => BudgetConfig;
};
