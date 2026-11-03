# Data Model: Persistent Operations Store

The SQLite database contains four operational tables. The persistent and
`.memory` stores use the same schema and validation behavior. All references
below use snake_case database column names; service/tool records may expose
the current TypeScript domain naming conventions.

## Service

Represents a service that can own alerts, incidents, and runbooks.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Integer primary key | Stable numeric identifier |
| `slug` | Text, unique, not null | Canonical lookup reference |
| `name` | Text, not null | Display name |
| `description` | Text, not null | Service description |
| `tier` | Text, not null, CHECK `tier-1`, `tier-2`, `tier-3` | Closed service criticality tier |
| `created_at` | Text timestamp, not null | Creation time |
| `updated_at` | Text timestamp, not null | Last update time |

Seeded service slugs retain the current mock's `payments-api`, `checkout-api`,
`inventory-api`, and `catalog-api`; `auth-api` replaces `orders-api` to include
the requested auth runbook while preserving the five-service count.
`payments-api`, `checkout-api`, and `auth-api` use `tier-1`; `inventory-api`
uses `tier-2`; `catalog-api` uses `tier-3`.

## Alert

Represents a monitoring signal associated with one service.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Integer primary key | Stable numeric identifier |
| `fixture_key` | Text, unique, not null | Stable seed identity |
| `service_id` | Integer foreign key to `services.id`, not null | Owning service |
| `title` | Text, not null | Short signal title |
| `description` | Text, not null | Signal details |
| `status` | Text, not null, CHECK `firing`, `resolved` | Current alert state |
| `severity` | Text, not null, CHECK `critical`, `high`, `medium`, `low` | Alert severity |
| `created_at` | Text timestamp, not null | Creation time |
| `updated_at` | Text timestamp, not null | Last update time |

The six fixtures contain three firing alerts (two critical and one high) and
three resolved alerts (all medium). The chosen auth fixture replaces the
existing order-queue alert without changing this distribution.

## Incident

Represents an operator-created incident associated with one service.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Integer primary key | Incident identifier |
| `service_id` | Integer foreign key to `services.id`, not null | Owning service |
| `title` | Text, not null, non-empty | Incident title |
| `severity` | Text, not null, CHECK `critical`, `high`, `medium`, `low` | Incident severity |
| `status` | Text, not null, CHECK `open`, `resolved` | Incident lifecycle |
| `summary` | Text, nullable | Optional incident summary |
| `created_at` | Text timestamp, not null | Creation time |
| `updated_at` | Text timestamp, not null | Last update time |
| `resolved_at` | Text timestamp, nullable | Resolution time |

An incident transitions once from `open` to `resolved`; the transition stores
`resolved_at`. Open incidents have `resolved_at = NULL`. Re-resolving and
resolving an unknown identifier are explicit domain errors. A service deletion
must not cascade and silently remove associated operational history.

## Runbook

Represents operational guidance associated with one service.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Integer primary key | Runbook identifier |
| `service_id` | Integer foreign key to `services.id`, unique, not null | Service it supports; one seeded runbook per service |
| `title` | Text, not null | Runbook title |
| `content` | Text, not null | Operator guidance |
| `created_at` | Text timestamp, not null | Creation time |
| `updated_at` | Text timestamp, not null | Last update time |

Each seeded runbook is uniquely associated with one of checkout, payments, or
auth. Runbook lookup uses the shared service-reference normalization rules;
missing matches are reported explicitly.

## Relationships and validation

- One service has zero or more alerts, incidents, and runbooks.
- Every alert, incident, and runbook references an existing service.
- Foreign keys are enabled for each database connection.
- All four tables are created idempotently; constraints validate every closed
  tier, severity, and status domain value in SQLite as well as at the
  application boundary.
- Alert/incident queries and tool results preserve the existing public record
  shapes, adding incident summary and resolution time where appropriate.
