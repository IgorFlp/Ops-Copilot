# Implementation Plan: History Summarization

**Current Branch**: `main` | **Feature Branch Name**: `011-history-summarization`
| **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

## Summary

Keep the eight most recent prior messages verbatim and represent older
messages with one persisted conversation summary of about 150 tokens. Merge
that summary only when eight uncovered messages have left the window, include
it in the strategy context, and record a `summarize` trace event only for a
saved update. Tests use an injected stand-in summarizer and an in-memory
database; no live model call is required.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.17.0 in the
workspace (`package.json` requires >=22.13.0).

**Primary Dependencies**: Existing Express, Zod, `@langchain/openai` via
`createModel()`, and `node:sqlite`. No new dependencies.

**Storage**: SQLite table `conversation_summaries`, one current row per
conversation, created by `SqliteConversationStore` with the same
`node:sqlite` access already used for `messages`.

**Testing**: `node:test` via `tsx`. Pure window tests, in-memory store tests,
and chat tests with a fake summarizer. `npm run typecheck` and `npm test`
during implementation.

**Target Platform**: Node.js 22.13+ Express service.

**Project Type**: Express web service. The chat HTTP contract gains a trace
event and an optional context estimate; there is no new route.

**Performance Goals**: Turns that do not complete a group of eight departed
messages do no summary model call and do no summary write. A normal turn
performs at most one summary call. Catch-up performs one call per overdue
group of eight before the answer.

**Constraints**: Verbatim history is fixed at eight messages and replaces the
previous copy of up to twelve. Summary text must estimate between 1 and 200
tokens (target about 150) using `estimateTokens`. A rejected or failed update
does not replace the saved row. Tests must not call OpenRouter or read `.env`.
`HISTORY_MESSAGES_THRESHOLD` remains validated at startup but no longer selects
prompt history.

**Scale/Scope**: One short summary row per conversation. The uncovered
departed messages for the active conversation are loaded once per turn.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Assessment |
|---|---|---|
| I. Explicit MVC Layers | Persistence stays in the conversation store. Batch selection and the summary prompt are pure. `ChatService` orchestrates. The controller keeps the existing request boundary. | PASS |
| II. Validated External Boundaries | No new chat request field. Existing Zod validation stays. Summary text is checked before it is saved. | PASS |
| III. Domain Errors | An unacceptable or failed summary update throws `DomainError`, leaves the previous row in place, and is not returned as a successful chat. | PASS |
| IV. Tested Changes | Cover the window, batch boundary, merge, persistence, context, and `summarize` event with fakes and `:memory:`. | PASS |
| V. Security, Simplicity, and Spec-First Development | No new secrets, dependencies, or per-request summary calls. Conversation text is treated as untrusted data in the summary prompt. | PASS |

No pre-research gate violations.

## Project Structure

### Documentation (this feature)

```text
specs/011-history-summarization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-context.md
│   └── conversation-summary.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts
│   ├── history-summary.ts
│   └── history-summary.test.ts
├── agents/
│   ├── types.ts
│   ├── model.ts
│   └── conversation-summarizer.ts
├── services/
│   ├── chat-service.ts
│   └── chat-service.test.ts
├── store/
│   ├── conversation-store.ts
│   ├── sqlite-conversation-store.ts
│   └── sqlite-conversation-store.test.ts
└── controllers/
    └── chat-test-helpers.ts
```

**Structure Decision**: Extend the existing conversation store and
`ChatService`. Put the window rule and the summary prompt in
`src/context/history-summary.ts` so they can be tested without a database or
model. Put the OpenRouter adapter beside `createModel()`. Inject that adapter
into `ChatService`; tests supply a fake. Render the summary in
`formatStrategyInput` as its own section, separate from the eight verbatim
messages.

## Complexity Tracking

No constitution violations require justification.

## Post-Design Constitution Check

Research and the Phase 1 contracts keep SQL inside the store, keep the
summarizer behind an injected port, and add no route or dependency. Summary
failures stay domain errors and do not overwrite a saved row. The default
model adapter is constructed only when a batch is actually due, so a short
conversation still does not require a provider call. All gates pass.
