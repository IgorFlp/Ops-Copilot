---
applyTo: "web/**"
---

# Diretrizes de Design — Web

Aplica-se a todo código em `web/**` (componentes, páginas, estilos e tokens). Estas regras são obrigatórias e valem para qualquer framework de UI adotado.

## Hierarquia

- Defina **uma única ação primária** por tela ou região; ações secundárias usam estilo menos proeminente e ações destrutivas usam estilo de perigo.
- Limite a **3 níveis de ênfase** (primário, secundário, terciário). Não crie um quarto nível.
- Estabeleça hierarquia por **tamanho, peso e cor**, nesta ordem de preferência. Não use cor como único diferenciador.
- Use **um `<h1>` por página** e mantenha a ordem dos headings sem pular níveis (`h1` → `h2` → `h3`).
- Agrupe conteúdo relacionado com proximidade e alinhamento; separe grupos distintos com espaço, não com linhas decorativas.
- A ordem visual deve corresponder à ordem de leitura no DOM.

## Espaçamento em escala

- Use a escala base de **4px**: `4, 8, 12, 16, 24, 32, 48, 64, 96`.
- **Nunca** use valores arbitrários (`13px`, `27px`). Se precisar de um valor fora da escala, questione o layout.
- Consuma o espaçamento por **tokens** (`--space-1` … `--space-9`), nunca por números mágicos repetidos.
- Regra de proximidade: o espaço **interno** de um componente deve ser menor que o espaço **externo** entre componentes.
- Mantenha um **ritmo vertical** consistente entre seções; use o mesmo token para o mesmo tipo de separação.
- Espaçamento responsivo deve mudar por **breakpoint**, não por valores interpolados aleatórios.

## Estados vazios e de erro

Todo componente que consome dados deve tratar explicitamente **quatro estados**: carregando, vazio, erro e sucesso.

- **Carregando:** use skeleton ou spinner com `aria-busy="true"`; nunca deixe a área em branco sem feedback.
- **Vazio:** mostre ícone, título curto, uma frase explicando o porquê e uma **ação** para sair do estado vazio (ex.: "Criar alerta").
- **Erro:** mensagem em linguagem clara e sem jargão técnico, com **ação de recuperação** (tentar novamente) e sem descartar dados já preenchidos pelo usuário.
- Erros de campo devem aparecer **junto ao campo**, ligados por `aria-describedby`, e não apenas em um toast global.
- Erros de rede/API devem ser distinguidos de erros de validação.
- Nunca exiba stack traces, códigos internos ou detalhes de infraestrutura ao usuário final.
- Estados devem ser acessíveis: anuncie mudanças relevantes com `role="status"` ou `role="alert"` conforme a urgência.

## Dark mode

- Implemente temas com **tokens semânticos** (`--color-bg`, `--color-surface`, `--color-text`, `--color-border`, `--color-primary`), nunca com cores hardcoded em componentes.
- Respeite `prefers-color-scheme` por padrão e permita **override manual** persistido pelo usuário.
- **Não inverta** cores automaticamente; defina paletas próprias para cada tema.
- Garanta contraste mínimo em ambos os temas (ver Acessibilidade).
- Ajuste sombras e bordas no escuro: prefira elevação por superfície e borda sutil em vez de sombras fortes.
- Ícones, ilustrações e imagens devem funcionar nos dois temas; use `currentColor` quando possível.
- Evite branco puro (`#fff`) sobre preto puro (`#000`); use superfícies levemente tonais para reduzir fadiga visual.

## Acessibilidade

- Contraste mínimo **WCAG AA**: `4.5:1` para texto normal, `3:1` para texto grande e para componentes de UI/ícones informativos.
- Toda funcionalidade deve ser operável **apenas por teclado**, com ordem de foco lógica.
- **Foco visível** obrigatório; nunca remova o outline sem substituí-lo por um indicador equivalente.
- Use **HTML semântico** primeiro (`button`, `a`, `label`, `nav`, `main`); recorra a ARIA apenas quando o HTML nativo não resolver.
- Todo controle precisa de **rótulo acessível**; ícones interativos exigem `aria-label`.
- **Não dependa só de cor** para transmitir estado ou significado; combine com texto, ícone ou padrão.
- Respeite `prefers-reduced-motion`; animações não devem ser essenciais para compreender a interface.
- Alvos de toque com no mínimo **44×44px**.
- O layout deve suportar **zoom de 200%** e texto redimensionável sem perda de conteúdo.
- Imagens informativas precisam de `alt`; imagens decorativas usam `alt=""`.
- Formulários devem ter associação explícita entre `label` e campo e mensagens de erro acessíveis.
