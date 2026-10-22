import { TraceEvent } from "../agents/types.js";

export function formatTrace(trace: readonly TraceEvent[]): string {
  return trace
    .map((event, index) => {
      const action =
        event.type === "action"
          ? ` tools=${JSON.stringify(event.tools ?? [])} args=${JSON.stringify(event.args ?? {})}`
          : "";
      const approval =
        event.type === "critique" && event.approved !== undefined
          ? ` approved=${event.approved}`
          : "";
      return `${String(index + 1).padStart(2, "0")} ${event.type}: ${event.content}${approval}${action}`;
    })
    .join("\n");
}
