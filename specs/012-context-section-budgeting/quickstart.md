# Quickstart: Context Section Budgeting

## Prerequisites

- Node.js >= 22.13.0
- Project dependencies installed (`npm install`)
- TypeScript typecheck passes (`npm run typecheck`)
- Tests pass (`npm test`)

## Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Verify the current test suite passes:
   ```bash
   npm test
   ```

## Validation Scenarios

### Scenario 1: Default Budgets (Summary: 200, Window: 1200, Memories: 300)

**Purpose**: Verify that with default budgets, oversized sections are correctly truncated per their strategy.

**Setup**:
```bash
# No env vars needed - defaults apply
```

**Test**:
```bash
node --import tsx --test src/context/context-builder.test.ts
```

**Expected**:
- Summary content truncated to a 200-token ceiling if exceeding
- Window drops oldest messages to fit the 1200-token ceiling
- Memories drops lowest-scored entries to fit the 300-token ceiling
- System prompt and user message included in full

### Scenario 2: Minimal Budgets (Priority Order Test)

**Purpose**: Verify truncation occurs in correct priority order when all budgets are very low.

**Setup**:
```bash
export CONTEXT_BUDGET_SUMMARY=10
export CONTEXT_BUDGET_WINDOW=50
export CONTEXT_BUDGET_MEMORIES=20
```

**Test**:
```bash
node --import tsx --test src/context/context-builder.test.ts
```

**Expected**:
- System prompt: FULL (untouchable)
- User message: FULL (untouchable)
- Summary: Truncated to ~10 tokens (first to be cut)
- Window: Oldest messages dropped to fit ~50 tokens (second)
- Memories: Lowest-scored dropped to fit ~20 tokens (third)
- `truncatedSections` array contains ["summary", "window", "memories"] in that order

### Scenario 3: Unlimited Budgets (Zero/Negative Values)

**Purpose**: Verify that 0, negative, or unset budgets mean "no limit".

**Setup**:
```bash
export CONTEXT_BUDGET_SUMMARY=0
export CONTEXT_BUDGET_WINDOW=-1
export CONTEXT_BUDGET_MEMORIES=0
```

**Test**:
```bash
node --import tsx --test src/context/context-builder.test.ts
```

**Expected**:
- No truncation occurs on any budgeted section
- `truncatedSections` is empty
- All content included (subject only to model's actual context limit)

### Scenario 4: Integration with ChatService

**Purpose**: Verify ChatService uses ContextBuilder for all strategies.

**Setup**:
```bash
# Use default budgets
```

**Test**:
```bash
node --import tsx --test src/services/chat-service.test.ts
```

**Expected**:
- ChatServiceResult.metrics.contextBreakdown reflects post-truncation token counts
- Works with both "react" and "plan-and-execute" strategies
- No change to existing chat behavior (answer, trace, metrics.calls, latencyMs)

### Scenario 5: Token Estimation Accuracy

**Purpose**: Verify token estimation matches the project's character-based method.

**Setup**:
```bash
# No special setup
```

**Test**:
```bash
node --import tsx --test src/context/tokens.test.ts
```

**Expected**:
- `estimateTokens("abcd") === 1` (4 code points = 1 token)
- `estimateTokens("abc") === 0` (3 code points = 0 tokens, floored)
- Unicode code points counted correctly (e.g., emoji = 1 code point)
- Non-negative integer always returned

## Running All Validation

```bash
# Run typecheck
npm run typecheck

# Run all tests
npm test

# Run specific feature tests
npm test -- --grep "ContextBuilder"
```

## Expected Test File Structure

```
src/context/
├── context-builder.ts          # Implementation
├── context-builder.test.ts     # Unit tests for ContextBuilder
├── tokens.ts                   # Existing: estimateTokens
├── tokens.test.ts              # Existing: estimateTokens tests
├── history-summary.ts          # Existing: history selection
└── history-summary.test.ts     # Existing: history tests
```

## Key Test Cases to Verify

1. **Budget parsing**: Invalid env values -> defaults; <=0 -> unlimited
2. **Summary truncation**: Content cut from end at token boundary
3. **Window truncation**: Oldest messages removed first, order preserved
4. **Memories truncation**: Sorted by score ascending, lowest dropped first
5. **Untouchable sections**: System and user message never modified
6. **Priority order**: With minimal budgets, summary -> window -> memories
7. **All strategies**: React and Plan-and-Execute both use budgeted prompts
8. **ContextBreakdown**: ChatService reports post-truncation estimates
9. **No regression**: Existing tests still pass without modification

## Troubleshooting

- **Tests fail with "ContextBuilder not found"**: Ensure `src/context/context-builder.ts` exists and exports `createContextBuilder`
- **Budget not respected**: Check `readBudgetConfig()` parses env vars correctly
- **Wrong truncation order**: Verify each section's `truncationStrategy` is set correctly in `build()`
- **Type errors**: Run `npm run typecheck` to catch interface mismatches

## References

- [Spec](spec.md)
- [Plan](plan.md)
- [Data Model](data-model.md)
- [Contract](contracts/context-builder.ts)
- [Existing token utility](../src/context/tokens.ts)
- [ChatService](../src/services/chat-service.ts)