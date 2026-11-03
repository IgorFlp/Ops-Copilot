# Operational Tool Contracts

These are agent-facing tool contracts. All tool inputs are validated before
operations are attempted. Successful responses serialize their matching
operational records; failures are explicit and must not be phrased as a
successful state change. The schemas and behavior are shared across persistent
and in-memory stores.

| Tool | Input | Success | State change |
|---|---|---|---|
| `list_alerts` | `{ "status"?: "firing" \| "resolved" \| "all" }`; default `firing` | Matching alert records in stable order | None |
| `open_incidente` | `{ "title": string, "service": string, "severity": "critical" \| "high" \| "medium" \| "low" }`; title is trimmed and non-empty; service accepts canonical slug/name or unambiguous supported reference | Created incident with numeric ID, service, severity, and `open` status | Creates incident |
| `resolve_incidente` | `{ "id": positive integer }` | Resolved incident with resolution timestamp | Changes an open incident to resolved |
| `List_incidentes` | `{ "status"?: "open" \| "resolved" \| "all" }`; default `open` | Matching incident records, including summary and resolution timestamp | None |
| `consultar_runbook` | `{ "service": non-empty string }` | Matching service runbook and service reference | None |

## Description requirements

Each registered tool's description and each schema field description MUST cover
the applicable items below:

1. State the operation's purpose.
2. Explain when the operator should use it.
3. Describe every input field.
4. State valid enum values and default values.
5. Distinguish read-only operations from state-changing operations.
6. For `open_incidente`, explicitly say to use it only when the operator
   requests opening/tracking an incident; do not infer a mutation from a
   request to inspect, summarize, or recommend.

## Error behavior

- Invalid arguments fail validation before storage is changed.
- Unknown services, incidents, or runbooks are reported explicitly.
- Resolving an already-resolved incident is a conflict, not a successful no-op.
- Persistence errors are surfaced and never converted to success-shaped data.
- Alert/incident status and severity values outside the listed sets are rejected.
