# OpsCopilot

OpsCopilot é um copiloto de plantão para gerenciar alertas e incidentes de produção. A API é um agente LangChain/LangGraph que usa OpenRouter.

## Stack

Node.js 22 LTS; TypeScript ESM com `strict`; Zod na fronteira HTTP/CLI; Express; PostgreSQL com Sequelize; testes `node:test` via `tsx`.

## Comandos

| Comando | Script em `package.json` |
| --- | --- |
| `npm run dev` | `tsx src/index.ts` |
| `npm run arena` | `tsx src/arena.ts` |
| `npm run bench` | `src/bench.ts` |
| `npm test` | `node --import tsx --test ~src/**/*.test.ts` |
| `npm run typecheck` | `tsc --noEmit` |

## Convenções

- Organize a aplicação em camadas MVC: model, service e controller.
- Valide entradas externas com Zod.
- Represente erros de domínio com classes próprias e traduza-os na borda.
- Crie testes para lógica nova; mantenha typecheck e testes verdes.
- Prefira funções puras sempre que possível.
- Nunca leia `.env` nem versione segredos.

## Fluxo de trabalho

- Siga este fluxo do Spec Kit, nesta ordem: `/speckit-specify` -> `/speckit-plan` -> `/speckit-tasks` -> `/speckit-implement`.
- Versione as especificações junto ao projeto.
- Antes de concluir, execute typecheck e testes.
