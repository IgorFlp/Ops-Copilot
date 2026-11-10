# Diretrizes de Design — Web

Aplica-se a todo código em `web/**` (componentes, páginas, estilos e tokens). Espelha `.github/instructions/design.instruction.md`; em caso de divergência, a versão em `.github/instructions` é a fonte da verdade.

## Hierarquia

- Uma única ação primária por tela/região; secundárias menos proeminentes; destrutivas com estilo de perigo.
- No máximo 3 níveis de ênfase (primário, secundário, terciário).
- Hierarquia por tamanho, peso e cor — nunca só por cor.
- Um `<h1>` por página; não pule níveis de heading.
- Agrupe por proximidade/alinhamento; separe grupos com espaço, não com linhas decorativas.
- Ordem visual deve seguir a ordem do DOM.

## Espaçamento em escala

- Escala base 4px: `4, 8, 12, 16, 24, 32, 48, 64, 96`.
- Nunca use valores arbitrários; consuma tokens (`--space-1` … `--space-9`).
- Espaço interno de um componente < espaço externo entre componentes.
- Mantenha ritmo vertical consistente; mesmo token para o mesmo tipo de separação.
- Responsividade muda por breakpoint, não por valores aleatórios.

## Estados vazios e de erro

Todo componente que consome dados trata quatro estados: carregando, vazio, erro e sucesso.

- Carregando: skeleton/spinner com `aria-busy="true"`; nunca área em branco.
- Vazio: ícone, título curto, explicação e uma ação para sair do estado.
- Erro: linguagem clara, ação de recuperação (tentar novamente), sem descartar dados do usuário.
- Erro de campo junto ao campo, ligado por `aria-describedby`; não só em toast global.
- Distinga erro de rede/API de erro de validação.
- Nunca exponha stack traces, códigos internos ou detalhes de infraestrutura.
- Anuncie mudanças com `role="status"` ou `role="alert"` conforme a urgência.

## Dark mode

- Use tokens semânticos (`--color-bg`, `--color-surface`, `--color-text`, `--color-border`, `--color-primary`); nada de cores hardcoded.
- Respeite `prefers-color-scheme` e permita override manual persistido.
- Não inverta cores automaticamente; defina paletas próprias por tema.
- Ajuste sombras/bordas: prefira elevação por superfície e borda sutil.
- Ícones e imagens devem funcionar nos dois temas; use `currentColor`.
- Evite branco puro sobre preto puro; use superfícies levemente tonais.

## Acessibilidade

- Contraste WCAG AA: `4.5:1` texto normal, `3:1` texto grande e componentes de UI.
- Toda funcionalidade operável só por teclado, com ordem de foco lógica.
- Foco visível obrigatório; nunca remova o outline sem substituto equivalente.
- HTML semântico primeiro; ARIA só quando necessário.
- Todo controle com rótulo acessível; ícones interativos com `aria-label`.
- Não dependa só de cor para estado/significado.
- Respeite `prefers-reduced-motion`.
- Alvos de toque com no mínimo 44×44px.
- Suporte a zoom de 200% e texto redimensionável.
- Imagens informativas com `alt`; decorativas com `alt=""`.
- Formulários com `label` associado e mensagens de erro acessíveis.
