<!--
Sync Impact Report
Version change: 1.2.0 -> 2.0.0 (breaking change to the mandatory persistence stack)
Modified principles:
- I. Explicit MVC layers: persistence is now implemented with SQLite instead of PostgreSQL.
- V. Security, simplicity, and spec-first development: consolidated applicable former principles.
Added sections: None
Removed sections: None
Modified sections:
- Technical Constraints: replaced Sequelize, PostgreSQL, and pg with node:sqlite.
Follow-up TODOs:
- Original ratification date is unknown: TODO(RATIFICATION_DATE).
-->

# OpsCopilot Constitution

Princípios não negociáveis para toda especificação, plano, tarefa e código do
OpsCopilot.

## Core Principles

### I. Explicit MVC Layers

A aplicação HTTP MUST separar model, service e controller. Models representam
dados e encapsulam persistência e mapeamento. Services implementam operações e
regras de domínio sem depender de Express. Controllers recebem requisições HTTP,
validam entradas, chamam services e traduzem resultados e erros em respostas
HTTP. O domínio MUST NOT realizar IO diretamente nem depender da camada HTTP.

### II. Validated External Boundaries

Toda entrada externa MUST ser validada com Zod antes de chegar aos services e à
lógica de domínio. Uma CLI de desenvolvimento MUST validar seus argumentos e
reutilizar os mesmos services da aplicação HTTP.

### III. Domain Errors

Falhas previsíveis MUST ser representadas por classes de erro de domínio e
traduzidas na borda para respostas adequadas. Respostas externas MUST NOT expor
detalhes de erros internos.

### IV. Tested Changes

Lógica nova MUST incluir testes usando `node:test` via `tsx`. Antes de concluir
uma mudança, `npm run typecheck` e `npm test` MUST passar.

### V. Security, Simplicity, and Spec-First Development

Segredos MUST NOT ser versionados; arquivos `.env` MUST NOT ser lidos no
terminal e `dotenv` MUST NOT ser adicionado. Falhas operacionais MUST ser
explícitas e operações malsucedidas MUST NOT ser apresentadas como sucesso.
Implementações MUST preferir funções puras, mudanças pequenas e efeitos
colaterais em fronteiras explícitas. Features MUST seguir
`/speckit-specify` -> `/speckit-plan` -> `/speckit-tasks` ->
`/speckit-implement`, com as especificações versionadas no projeto.

## Technical Constraints

Stack: Node.js 22 LTS, TypeScript ESM em modo `strict`, Zod, Express, SQLite
acessado pelo módulo nativo `node:sqlite`, `node:test` via `tsx`, LangChain/
LangGraph e `@langchain/openai` para acessar OpenRouter. A persistência
operacional MUST usar SQLite; Sequelize e o driver `pg` não fazem parte do stack.
Use o suporte nativo do Node.js para variáveis de ambiente.

## Development Workflow

Especificações, planos, tarefas e implementação MUST seguir os princípios acima.
Antes de concluir uma mudança, execute typecheck e testes e deixe ambos verdes.
Revise a alteração quanto à aderência a esta constituição e às instruções do
projeto.

## Governance

Esta constituição governa o design e a implementação do OpsCopilot. Alterações
exigem revisão que explique os princípios afetados, impacto de compatibilidade e
migrações necessárias. Toda implementação MUST ser revisada quanto à conformidade
com esta constituição e com as instruções do projeto.

Use versionamento semântico: MAJOR para mudanças incompatíveis nas regras,
MINOR para novos princípios ou expansão material de diretrizes, PATCH para
clarificações e mudanças não semânticas. Confirme a data original de ratificação
quando conhecida e atualize a data da última alteração em cada emenda aprovada.

**Version**: 2.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original date unknown | **Last Amended**: 2026-11-03
