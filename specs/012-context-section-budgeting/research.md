# Research: Context Section Budgeting

## Decision 1: Environment variable configuration for section budgets

**Decision**: Read section budgets from environment variables prefixed with `CONTEXT_BUDGET_` (e.g., `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, `CONTEXT_BUDGET_MEMORIES`). Use sensible defaults (summary: 200, window: 1200, memories: 300) when unset. Treat unset, 0, or negative values as "no limit" for that section.

**Rationale**: Environment variables are the existing pattern for configuration in this project (e.g., `HISTORY_MESSAGES_THRESHOLD`). They allow deployment-time configuration without code changes and work across all strategies. Defaults match the spec requirements.

**Alternatives considered**:
- Configuration file: rejected because env vars are the established pattern.
- Programmatic API: rejected because the requirement is env-driven for all strategies.
- Per-strategy budgets: rejected because the spec says "ALL strategies with the same budget configuration."

## Decision 2: ContextBuilder as a pure utility class

**Decision**: Create a `ContextBuilder` class in `src/context/context-builder.ts` that:
- Reads budgets from `process.env` at construction or build time
- Accepts pre-assembled section content (system, summary, history, memories, user message)
- Applies truncation strategies independently per section
- Returns the final assembled prompt string
- Uses the existing `estimateTokens` for token counting

**Rationale**: Keeps budget logic separate from strategy execution and chat service assembly. Pure utility is easily testable with deterministic inputs. The existing `formatStrategyInput` in `types.ts` can delegate to `ContextBuilder` for the final assembly.

**Alternatives considered**:
- Extend `formatStrategyInput` directly: rejected because it mixes assembly with budget logic and isn't easily testable in isolation.
- Add budget logic to `ChatService`: rejected because it couples the service to strategy prompt formatting.
- Global singleton: rejected because it makes testing with different budgets harder.

## Decision 3: Truncation strategies per section

**Decision**: Each section has its own truncation strategy:
- **System prompt**: Never truncated (untouchable)
- **User message**: Never truncated (untouchable)
- **Summary**: Truncate content from the end to fit budget (simple substring truncation at token boundary)
- **Window (history)**: Remove oldest messages first until within budget
- **Memories**: Remove lowest-scored memories first until within budget (requires score metadata)

**Rationale**: Matches the spec exactly. Summary truncation preserves the beginning (most important context). Window dropping oldest preserves recent context. Memories dropping lowest score preserves most relevant facts.

**Alternatives considered**:
- Uniform truncation for all sections: rejected because different sections have different semantic importance.
- Truncate from beginning for summary: rejected because the start of a summary typically has higher-level conclusions.
- Random removal for memories: rejected because score-based retention is explicitly required.

## Decision 4: Token estimation at section level

**Decision**: Estimate tokens per section using the existing `estimateTokens(text)` (Unicode code points / 4, floor). Apply the estimation to each section's concatenated content independently. Truncation operates on the section's text to meet the token budget.

**Rationale**: Consistent with the project's existing estimation method (used in `tokens.ts` and `chat-service.ts` for contextBreakdown). Section-level estimation matches the spec's requirement for independent section budgets.

**Alternatives considered**:
- Estimate on the full assembled prompt then proportionally allocate: rejected because sections have independent budgets and different truncation strategies.
- Use a tokenizer library: rejected because the project uses character-based estimation and adding a tokenizer would be a new dependency.

## Decision 5: Integration with existing strategy input format

**Decision**: The `ContextBuilder` will accept the same data that `formatStrategyInput` currently assembles (system prompt, summary, history array, memories array, user message). It will be called at the end of `formatStrategyInput` or from `ChatService` before passing to the strategy. Strategies receive the final prompt string as they do today.

**Rationale**: Minimal change to existing strategy interfaces. `ChatStrategyInput` already contains all needed sections. The `ReasoningStrategy.run` method receives a string prompt (via `formatStrategyInput`).

**Alternatives considered**:
- Pass structured sections to strategies: rejected because it would require changing all strategy implementations.
- Modify `ChatStrategyInput` to include budgets: rejected because budgets are global config, not per-request data.

## Decision 6: Memory scoring for truncation

**Decision**: Memories passed to `ContextBuilder` must include a score field. The `MemoryRecall` interface in `memory-service.ts` returns `{ fact: string, score: number }`. The builder will sort by score ascending and drop from the lowest until within budget.

**Rationale**: The spec requires "cuts lowest score" for memories. The existing `MemoryRecall` type already includes a score from the semantic recall implementation.

**Alternatives considered**:
- Add score to `ChatStrategyInput.memoryFacts`: rejected because it changes the public interface.
- Assume equal scores: rejected because it defeats the purpose of score-based truncation.

## References

- [Existing token estimation](src/context/tokens.ts)
- [History summary utilities](src/context/history-summary.ts)
- [ChatService context assembly](src/services/chat-service.ts)
- [Strategy input formatting](src/agents/types.ts)
- [MemoryRecall interface](src/services/memory-service.ts)