# Data Model: Context Section Budgeting

## Entities

### SectionBudgetConfig

Configuration for token budgets per context section.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| system | number \| null | No | null (unlimited) | Budget for system prompt. Null = no limit. Always untouchable. |
| summary | number \| null | No | 200 | Budget for conversation summary. Null = no limit. |
| window | number \| null | No | 1200 | Budget for conversation history window. Null = no limit. |
| memories | number \| null | No | 300 | Budget for recalled memories. Null = no limit. |
| userMessage | number \| null | No | null (unlimited) | Budget for user message. Null = no limit. Always untouchable. |

**Validation Rules**:
- Values <= 0 are treated as null (no limit)
- Non-integer values are floored
- Missing environment variables default to the values above

**Source**: `CONTEXT_BUDGET_SYSTEM`, `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, `CONTEXT_BUDGET_MEMORIES`, `CONTEXT_BUDGET_USER_MESSAGE` environment variables.

### ContextSection

A single section of the assembled prompt with its content and metadata.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | "system" \| "summary" \| "window" \| "memories" \| "userMessage" | Yes | Section identifier |
| content | string | Yes | The text content of this section |
| estimatedTokens | number | Yes | Token estimate using `estimateTokens(content)` |
| budget | number \| null | Yes | Token budget for this section (null = unlimited) |
| isUntouchable | boolean | Yes | True for system and userMessage; never truncated |
| truncationStrategy | "none" \| "truncate-end" \| "drop-oldest" \| "drop-lowest-score" | Yes | How to reduce content when over budget |

### MemoryEntry

A recalled memory fact with relevance score.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| fact | string | Yes | The memory fact text |
| score | number | Yes | Relevance score (higher = more relevant) |

### ContextBuilderInput

Input data for building a budgeted prompt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| systemPrompt | string | Yes | The system prompt / agent instructions |
| summary | string \| null | No | Conversation summary (optional) |
| history | StrategyHistoryMessage[] | Yes | Recent conversation history |
| memories | MemoryEntry[] | No | Recalled memories with scores |
| userMessage | string | Yes | The current user message |

### ContextBuilderOutput

Result of building a budgeted prompt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prompt | string | Yes | The final assembled prompt string |
| sections | ContextSection[] | Yes | Per-section details after budget enforcement |
| totalEstimatedTokens | number | Yes | Sum of estimatedTokens across all sections |
| truncatedSections | string[] | Yes | Names of sections that were truncated |

### TruncationResult

Result of applying a truncation strategy to a section.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | Yes | Truncated content |
| estimatedTokens | number | Yes | Token estimate of truncated content |
| wasTruncated | boolean | Yes | True if content was modified |
| removedCount | number | Yes | Number of items removed (messages for window, memories for memories) or characters removed (for summary) |

## Relationships

```
SectionBudgetConfig (from env)
       |
       v
ContextBuilder (reads config)
       |
       +---> ContextBuilderInput (from ChatService/formatStrategyInput)
       |       |
       |       +---> systemPrompt (string)
       |       +---> summary (string | null)
       |       +---> history (StrategyHistoryMessage[])
       |       +---> memories (MemoryEntry[])
       |       +---> userMessage (string)
       |
       v
ContextBuilderOutput
       |
       +---> prompt (string) ----> Strategy.run(prompt)
       +---> sections (ContextSection[])
       +---> totalEstimatedTokens (number)
       +---> truncatedSections (string[])
```

## State Transitions

### Budget Enforcement Flow

```
1. READ config from environment (with defaults)
2. ESTIMATE tokens for each input section
3. FOR each section:
   IF section.isUntouchable OR section.estimatedTokens <= section.budget:
      KEEP content as-is
   ELSE:
      APPLY truncationStrategy:
        - "truncate-end": Remove chars from end until within budget
        - "drop-oldest": Remove oldest history messages until within budget
        - "drop-lowest-score": Sort memories by score asc, drop lowest until within budget
4. ASSEMBLE final prompt in order: system, summary, window, memories, userMessage
5. RETURN ContextBuilderOutput with details
```

### Truncation Priority Order (when all budgets are low)

The spec requires that with very low budgets, truncation occurs in this order:
1. Summary (truncate content)
2. Window (drop oldest messages)
3. Memories (drop lowest score)
4. System prompt and user message: NEVER truncated

This is enforced by the independent per-section budgets. The builder does not "borrow" budget from one section to another.

## Validation Rules

1. **Budget parsing**: Invalid/non-numeric env values -> default. Values <= 0 -> unlimited.
2. **Token estimation**: Always non-negative integer (floor of codePoints / 4).
3. **Truncation**: Must not produce negative token counts. Must preserve order of remaining items.
4. **Untouchable sections**: System and userMessage are never modified regardless of budget.
5. **Empty sections**: If a section has no content, it contributes 0 tokens and is not in output.
6. **Memory scores**: Memories must have numeric scores. Missing scores default to 0.