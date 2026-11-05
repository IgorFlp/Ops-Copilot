# Research: Context Token Metrics

## Decision 1: Use LangChain-reported prompt usage as actual usage

**Decision**: Read the normalized input token count from each returned
`AIMessage.usage_metadata.input_tokens`. For structured model calls, retain the
raw `AIMessage` using `withStructuredOutput(..., { includeRaw: true })`. A
provider's `response_metadata.tokenUsage.promptTokens` may be used only as an
actual reported count when normalized usage metadata is absent and the value is
a valid non-negative integer. Never derive actual usage from text length.

**Rationale**: LangChain documents `usage_metadata` as the standard message
field for input/output/total usage. The OpenAI integration also documents
`response_metadata.tokenUsage` in the provider's camel-cased shape. Structured
output can return both parsed data and the raw message, preserving usage
metadata for parsing/validation paths.

**Alternatives considered**:

- Estimating model tokens from the prompt: rejected because the API must not
  label estimates as actual provider usage.
- Depending only on provider-specific metadata: rejected because the standard
  LangChain usage field is preferable when available.

## Decision 2: Aggregate actual usage over the complete chat run

**Decision**: Sum actual prompt/input usage for every LLM invocation belonging
to the strategy run, including ReAct tool cycles, structured-output retries,
replanning, and reflection critics. Expose the sum only when every invocation
has a valid reported input-token count; otherwise omit `metrics.promptTokens`.
Do not expose a partial sum as the run's actual total.

**Rationale**: A single `/chat` request can cause multiple model invocations,
and the existing `metrics.calls` describes the whole run. Summing only the
last AI response would under-report actual usage. A completeness rule preserves
the meaning of the public field when some provider responses lack usage.

**Alternatives considered**:

- Return only the final model invocation's prompt count: rejected because it
  hides the usage of earlier tool/plan/reflection calls.
- Sum only calls that provide usage: rejected because a partial total would
  look complete and actual.
- Return zero when usage is absent: rejected because zero is not evidence that
  the provider reported zero tokens.

## Decision 3: Estimate application-visible chat input sources once per turn

**Decision**: Return estimates for the current request and, when included,
conversation history and recalled memories. Count each source's raw text as
Unicode code points, sum its text lengths, and apply floor(chars / 4) once per
source. Do not include role labels, separators, static agent instructions,
tool schemas, structured prompt wrappers, or provider-side serialization in
these source estimates.

**Rationale**: `ChatService` assembles these source values directly and can
measure them without duplicating agent prompt construction. Labeling them as
estimates and excluding system/tool framing keeps them distinct from actual
provider usage and avoids pretending the estimated breakdown equals the model
prompt.

**Alternatives considered**:

- Count UTF-16 code units: rejected because supplementary Unicode characters
  would count as two characters.
- Count UTF-8 bytes: rejected because byte length is not character count and
  varies for accented text.
- Include all agent/tool prompt framing: rejected for this feature because
  framework-generated and strategy-specific formatting varies by invocation;
  actual provider usage already accounts for it.
- Multiply the input-source estimate by the number of model calls: rejected
  because it would be an estimate of repeated strategy consumption rather
  than the requested per-turn input-source breakdown.

## Decision 4: Keep usage collection inside existing strategy flows

**Decision**: ReAct aggregates usage from the returned graph `messages`.
Plan-and-execute carries per-call usage from the raw structured outputs through
its existing graph state, including retries. Reflection includes raw usage
from each critic call and combines it with the decorated strategy's usage.
`ChatService` adds the breakdown for the input it assembles and passes the
strategy's actual aggregate through to the response.

**Rationale**: The repository already returns complete ReAct message state,
uses `includeRaw: true` for plan/executor/replanner calls, and has a reflection
decorator that aggregates call counts. These seams allow the feature without
new provider calls, global callbacks, or a new dependency.

**Alternatives considered**:

- Global LangChain callbacks: rejected for this change because they add
  cross-cutting state and per-request callback propagation where strategies
  already expose invocation results.
- Adding another model call solely to calculate usage: rejected because the
  usage must come from the original calls and an extra call changes behavior
  and cost.

## References

- [LangChain JS messages and usage metadata](https://docs.langchain.com/oss/javascript/langchain/messages)
- [LangChain JS ChatOpenAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/openai)
- [LangChain JS structured output and raw AIMessage](https://docs.langchain.com/oss/javascript/langchain/models)
- [LangGraph JS graph invocation and message state](https://docs.langchain.com/oss/javascript/langgraph/quickstart)
