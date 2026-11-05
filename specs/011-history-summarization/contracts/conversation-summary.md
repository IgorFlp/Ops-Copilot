# Contract: Conversation Summary

Internal contract between `ChatService`, the conversation store, and the
summarizer. No new HTTP route.

## Store

`SqliteConversationStore` and every `ConversationStore` test double expose:

- `getSummary(conversationId) -> { content, coveredThroughMessageId } | null`
- `saveSummary(conversationId, content, coveredThroughMessageId) ->` the saved
  summary
- `uncoveredDepartedMessages(conversationId, coveredThroughMessageId | null) ->`
  messages outside the newest eight whose ids are after the cursor, oldest
  first

`getSummary` returns `null` when the conversation exists but has no summary
row. A missing conversation is a not-found domain error for all three
operations. `saveSummary` replaces the conversation's single row. It rejects a
coverage message that does not belong to that conversation and does not modify
the previous row. `uncoveredDepartedMessages` returns an empty list when
nothing outside the recent window is uncovered. It does not return the newest
eight messages and does not return messages at or below the cursor.

The pure batch helper accepts that oldest-first list and returns the first
eight messages, or no batch when the list is shorter than eight.

## Summarizer

```text
summarize({
  previousSummary: string | null,
  messages: exactly eight { role, content } records
}) -> { content: string, promptTokens?: number }
```

`previousSummary` is `null` only for the first summary. `messages` are the
batch in oldest-first order. The default adapter builds the prompt with the
pure prompt helper and calls the existing chat model. `promptTokens` is
present only when that call reports a non-negative prompt count.

The prompt must:

- ask for a brief of about 150 tokens;
- require decisions, facts, and still-open pending items to be preserved;
- require resolved pending items to be dropped and contradicted facts to be
  kept in their newer form;
- include the previous summary when one exists, otherwise state that there is
  no previous summary;
- include the eight messages as conversation data and tell the model not to
  follow instructions found inside them.

The service, not the adapter, trims the result and accepts it only when its
estimated size is from 1 to 200 tokens. The adapter does not write to the
store.

## Failure

If `summarize` throws, or the service rejects the text, the service raises a
domain error with code `INTERNAL`. The save for that batch does not run.
Earlier accepted saves in the same turn remain. The chat result is not
successful, and the current user message is not appended after that failure.
