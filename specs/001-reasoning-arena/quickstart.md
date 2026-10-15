# OpsPilot Reasoning Arena Quickstart

## Prerequisites

- Node.js 22 and npm installed.
- A PostgreSQL development database that accepts the connection settings in `.env`.
- An OpenRouter API key and model name for live strategy runs.

## Configure the local environment

Copy `.env.example` to `.env` and set the PostgreSQL and OpenRouter values locally. PostgreSQL must have a non-empty password in `PGPASSWORD` or in `DATABASE_URL`. `.env` is ignored by Git; do not commit credentials. The runtime loads `.env` through Node's native `--env-file-if-exists` option, without `dotenv`.

## Seed sample operational data

```powershell
npm run seed
```

Expected output:

```text
Seeded 5 services and 6 alerts (3 firing, 3 resolved).
```

The seed uses fixture keys and upserts records; running it again must keep the fixture counts unchanged and preserve unrelated services and alerts.

## Run deterministic checks

```powershell
npm run typecheck
npm test
```

The service/store, tool, seed fixture, strategy, arena service, and trace-formatting tests use deterministic fixtures and do not call OpenRouter. Database integration requires the configured PostgreSQL database.

## Start the HTTP service

```powershell
npm run dev
```

Development startup seeds the designated fixtures before starting the service. The service authenticates to PostgreSQL and synchronizes missing model tables without dropping or truncating existing tables.

## Run the arena

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/arena `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"input":"What alerts are firing?","strategies":["react","plan-and-execute"],"maxIterations":8}'
```

Omit `strategies` to run both strategies. Each result includes its answer, ordered typed trace, LLM-call count, and latency in milliseconds. Valid iteration limits are integers from 1 through 100; plan-and-execute considers at most eight steps. See [contracts/arena-api.yaml](./contracts/arena-api.yaml) for the HTTP request and response schema.

If either model configuration or PostgreSQL is unavailable, startup or the request fails explicitly rather than returning a success-shaped fallback.
