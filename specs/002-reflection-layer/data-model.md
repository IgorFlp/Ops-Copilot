# Data Model: Reflection Layer

## Reasoning strategy

A named operation that maps an input and run options to a reasoning result.

| Field | Type | Rules |
|---|---|---|
| `name` | string | Existing names are `react` and `plan-and-execute`; reflected variants are `reflect:react` and `reflect:plan-and-execute`. |
| `input` | string | Non-empty after trimming at the arena boundary. |
| `options.maxIterations` | integer | Existing strategy-specific limit; unchanged by reflection. |
| `options.maxReflection` | integer | Reflection only; defaults to 2 and is valid from 0 through 100 inclusive. |
| `options.reflectionContext` | internal context | Carries prior observations, feedback, and successfully completed actions to a regeneration; not a new HTTP input field. |

## Critique decision

One structured evaluation of the current candidate answer.

| Field | Type | Rules |
|---|---|---|
| `approved` | boolean | Required; true ends reflection, false requests regeneration if a retry remains. |
| `feedback` | string | Required; supplied to the next generation when a rejection triggers regeneration. |
| evaluated answer | string | The current base-strategy result answer. |
| observations | trace observations | Only `observation` entries from the current and preserved prior attempt traces; empty observations do not constitute evidence. |

Invalid or missing structured fields fail the reflected run; they are not coerced
to an approval decision.

## Trace event

An ordered, externally inspectable event in a reasoning result.

| Field | Type | Rules |
|---|---|---|
| `type` | enum | Existing values: `thought`, `action`, `observation`, `plan`, `critique`, `answer`. |
| `content` | string | For reflection critique events, contains critic feedback. Existing event meanings remain intact. |
| `approved` | boolean, optional | Present on reflection-generated critique events and records the critic decision. Other existing critique events, such as plan replanning, may omit it. |
| `timestamp` | string, optional | Existing timestamp semantics; preserve if supplied. |
| `tools`, `args` | optional | Existing action details; preserve unchanged. |

Trace assembly retains each attempt's events and inserts its critique event
after the candidate it evaluates. The terminal final regeneration has no
subsequent reflection critique when the limit is exhausted.

## Reasoning result and metrics

| Field | Type | Rules |
|---|---|---|
| `answer` | string | The latest candidate answer, including the last allowed regeneration. |
| `trace` | ordered `TraceEvent[]` | Attempt events and reflection critique events in chronological order. |
| `metrics.calls` | integer | Sum of all base-strategy calls across attempts plus one call for each critic decision. |
| `metrics.latencyMs` | number | Complete elapsed wall-clock duration of the reflected run. |

## Reflection state transitions

1. Validate `maxReflection`; default it to 2.
2. Run the wrapped strategy once and collect its answer, trace, and metrics.
3. Critique the answer against all observations available to the run; append one
   critique event and increment the critique call count.
4. If approved, return the current answer and accumulated trace/metrics.
5. If rejected and fewer than `maxReflection` regenerations have occurred,
   regenerate with feedback and preserved context, then return to step 3.
6. If rejected after the final permitted regeneration, return that regeneration
   without another critique.
7. A zero limit still reaches step 3 for the initial answer, then returns that
   initial candidate if rejected.
8. Any base run, critic, validation, or regeneration error ends the run as a
   failure.

Previously successful state-changing operations are carried in reflection
context and must not be executed a second time solely due to answer
regeneration.
