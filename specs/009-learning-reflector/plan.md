# Implementation Plan: Learning Reflector

**Branch**: `main` (active) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-learning-reflector/spec.md`

## Summary

After a chat answer is generated and persisted, asynchronously evaluate only
the latest user message with a structured learning extractor. Save a durable,
non-secret fact through the existing user-scoped memory service. Register a
`forget_preference` operation in both agent strategies; only forget when the
request maps unambiguously to one memory. Explicit corrections are checked
before the normal strategy so an ambiguous target can be clarified in the same
turn; a uniquely matched replacement is committed asynchronously only after a
successful response is persisted.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict mode

**Primary Dependencies**: Existing `@langchain/openai` `ChatOpenAI` wrapper
configured for OpenRouter, LangChain `withStructuredOutput`, Zod, and existing
`MemoryService`

**Storage**: Existing user-scoped SQLite `memories` table; no new entity table
or migration is required. Add a scoped atomic replace operation for corrections.

**Testing**: `node:test` via `tsx`; targeted agent, service, tool, and chat
tests, followed by `npm run typecheck` and `npm test`

**Target Platform**: Node.js 22 server

**Project Type**: TypeScript web service with agent/tool integrations

**Performance Goals**: Deliver ordinary chat responses without waiting for
learning extraction or memory writes; learn asynchronously after assistant
response persistence. Correction preflight may delay explicit correction
messages so ambiguous targets can be clarified before answering.

**Constraints**:
- The extractor sees only the latest user message as evidence for new facts;
  do not provide chat history or the assistant answer as candidate facts.
- Fail closed: no memory write when the result is uncertain, malformed, empty,
  or contains a detected secret.
- Never log the user message, extracted fact, or secret-bearing prompt.
- Carry user identity as request-scoped tool context, never as model-selected
  tool input.
- Track asynchronous work so failures are logged explicitly and shutdown does
  not close the memory store while work is still using it.
- Corrections and preference forgetting must not remove a memory unless the
  requesting user's target is unambiguous.

**Scale/Scope**: One extraction per successful chat response; at most one
eligible fact per extraction; use existing per-user memory and relevance
limits. No new public HTTP endpoint.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers**: PASS. Orchestration remains in services, model
  extraction in the agent/model adapter, memory persistence in the existing
  store, and user-facing errors remain at the chat/tool boundaries.
- **II. Validated External Boundaries**: PASS. Validate structured model
  output and tool input with Zod; bind the user identity from the validated
  chat request rather than accepting it from the model.
- **III. Domain Errors**: PASS. Forget failures and invalid input use existing
  domain error and tool result conventions; asynchronous failures are logged
  without being converted to success.
- **IV. Tested Changes**: PASS when implementation includes unit and
  integration tests and completes typecheck and full test suite.
- **V. Security, Simplicity, and Spec-First Development**: PASS. No secrets or
  raw messages in logs; conservative storage; no new dependency; feature
  follows the Spec Kit sequence.

No constitution violations or exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/009-learning-reflector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── learning-reflector.md
│   └── forget-preference.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── learning-reflector.ts       # Zod structured-output schema and prompt
│   ├── react.ts                    # Request-scoped forget tool context
│   ├── plan-and-execute.ts         # Request-scoped forget tool dispatch
│   └── tools.ts                    # forget_preference tool and scoped handler
├── controllers/
│   └── chat-controller.ts          # Supply validated user identity/services
├── memory/
│   └── memory-store.ts             # Existing default memory-service lifecycle
├── services/
│   ├── chat-service.ts             # Schedule and drain asynchronous learning
│   ├── learning-reflector.ts       # Orchestrate extraction, remember/replace
│   └── memory-service.ts           # Scoped atomic memory replacement
└── store/
    ├── memory-store.ts             # Add user-scoped replace contract
    └── sqlite-memory-store.ts      # Implement replacement transaction
```

**Structure Decision**: Extend the existing single-project MVC and agent
structure. Keep the extractor behind an injectable service boundary; use the
existing tool registry for the new user-scoped preference operation. Do not
create a new HTTP route or storage table.

## Complexity Tracking

No constitution violations; no complexity justification is required.
