# Quickstart: Persistent Operations Store

## Prerequisites

- Node.js `>=22.13.0`, for built-in `node:sqlite`
  without an experimental command-line flag.
- Project dependencies installed with `npm install`.
- No model-provider credentials are needed for store-only tests.

## Validate in-memory SQLite behavior

1. Construct the operations SQLite store with the `.memory` sentinel. It must
   use an isolated in-memory database, not create a `.memory` file.
2. Initialize the schema and seed twice.
3. Verify the four tables (`services`, `alerts`, `incidents`, `runbooks`),
   five services, six alerts (three firing and three resolved), and
   checkout/payments/auth runbooks with no duplicate fixtures.
4. Open an incident, list incidents with no filter and with `resolved`/`all`,
   resolve the incident, then verify open/resolved filtering and `resolved_at`.
5. Attempt an invalid status/severity/tier, unknown service, unknown incident,
   and repeated resolution; verify each fails without reporting success.

Run the targeted store and tool test files as they are added, then run:

```powershell
npm run typecheck
npm test
```

The store/tool tests must pass without network access and must not create or
modify the configured persistent database.

## Validate persistent behavior

Set `OPSPILOT_DB` to a disposable local path and start the application. When
unset, the application uses `./data/opspilot.db`. Verify:

1. The schema and seed are initialized without manual DDL steps.
2. A created and resolved incident remains resolved after closing and
   reopening the application against the same path.
3. Re-running seed creates no duplicate fixtures and removes no unrelated
   records.
4. Local `data/` files are ignored by Git.

## Validate tool composition

Use the contracts in [contracts/ops-tools.md](contracts/ops-tools.md) to
exercise all five tools: `list_alerts`, `open_incidente`,
`resolve_incidente`, `List_incidentes`, and `consultar_runbook`. Verify
descriptions include purpose, usage guidance, all fields, closed
values/defaults, and state-change intent. Run deterministic benchmark
scenarios against an isolated SQLite `.memory` store and compare their answers
and side effects with baseline expectations.

For the entity fields and constraints, see [data-model.md](data-model.md).
