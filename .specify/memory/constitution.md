<!--
Sync Impact Report
Version change: 1.1.0 -> 1.2.0 (allows a developer CLI alongside the HTTP API)
Modified principles:
- 2. Validated HTTP and developer CLI boundaries (CLI permitted for local system testing)
Added sections: None
Removed sections: HTTP-only restriction on CLI scope
Follow-up TODO: Confirm the original ratification date.
-->

# Constitution - OpsCopilot

Princípios não negociáveis para toda especificação, plano, tarefa e código do OpsCopilot.

## Core Principles

1. **Camadas MVC explícitas:** organize a aplicação HTTP em model, service e
   controller, com responsabilidades distintas. Models representam os dados e
   encapsulam persistência e mapeamento do PostgreSQL. Services implementam as
   operações e regras de domínio, coordenando models sem depender de Express.
   Controllers recebem requisições HTTP, validam a entrada, chamam services e
   traduzem resultados e erros em respostas HTTP. O domínio não realiza IO
   diretamente nem depende da camada HTTP.
2. **Validação nas fronteiras externas:** valide com Zod toda entrada recebida
   pela API antes de encaminhá-la aos services e à lógica de domínio. O projeto
   pode oferecer uma interface CLI de desenvolvimento para testar o sistema; essa
   interface também deve validar argumentos e reutilizar os mesmos services.
3. **Erros são de domínio:** represente falhas previsíveis com classes de erro de
   domínio e traduza-as na borda para respostas adequadas. Não exponha erros internos.
4. **Teste é parte da tarefa:** lógica nova nasce com testes usando `node:test` via
   `tsx`. Mantenha `npm run typecheck` e `npm test` verdes.
5. **Segurança por padrão:** nunca versione segredos nem leia `.env` no terminal.
   Falhas operacionais devem ser explícitas; não trate operações malsucedidas como
   sucesso.
6. **Spec antes de código:** siga `/speckit-specify` -> `/speckit-plan` ->
   `/speckit-tasks` -> `/speckit-implement` e versione as especificações no projeto.
7. **Pequeno, puro e reversível:** prefira funções puras e mudanças pequenas,
   isolando efeitos colaterais em fronteiras explícitas para facilitar testes e
   reversão.

## Technical Constraints

Stack: Node.js 22 LTS, TypeScript ESM em modo `strict`, Zod, Express, Sequelize com
PostgreSQL e driver `pg`, `node:test` via `tsx`, LangChain/LangGraph e
`@langchain/openai` para acessar OpenRouter. Não adicione `dotenv`; use o suporte
nativo do Node.js para variáveis de ambiente.

## Development Workflow

Especificações, planos, tarefas e implementação seguem os princípios acima.
Antes de concluir uma mudança, execute typecheck e testes e deixe ambos verdes.
Revise a alteração quanto à aderência a esta constituição e às instruções do projeto.

## Governance

Esta constituição governa o design e a implementação do OpsCopilot. Alterações
exigem revisão que explique os princípios afetados, impacto de compatibilidade e
migrações necessárias. Toda implementação MUST ser revisada quanto à conformidade
com esta constituição e com as instruções do projeto.

Use versionamento semântico: MAJOR para mudanças incompatíveis nas regras,
MINOR para novos princípios ou expansão material de diretrizes, PATCH para
clarificações e mudanças não semânticas. Confirme a data original de ratificação
quando conhecida e atualize a data da última alteração em cada emenda aprovada.

**Version**: 1.2.0 | **Ratified**: TODO(RATIFICATION_DATE): original date unknown | **Last Amended**: 2026-10-15
