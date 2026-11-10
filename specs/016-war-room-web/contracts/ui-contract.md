# UI Contract: War Room Web

**Feature**: `016-war-room-web` | **Date**: 2026-11-10

This contract defines the routes, surfaces, states, and accessibility expectations the client must satisfy. Visual rules follow `.github/instructions/design.instruction.md` and `web/AGENTS.md`.

## Routes

| Path | Screen | Behavior |
|------|--------|----------|
| `/opspilot/` | Redirect | Redirects to `/opspilot/chat` |
| `/opspilot/chat` | Chat | Primary war room screen |
| `/opspilot/*` | Not found | Shows a not-found state with a link back to chat |

- The router uses the Vite base path as its basename.
- Direct navigation and refresh on any route must render the correct screen.

## App shell

- Header with the product name, a theme control, and a settings gear.
- The settings gear opens a panel/dialog for the API base URL.
- The shell is keyboard navigable and exposes a skip link to the main content.

## Chat screen

### Composer

- Multi-line text input with a send button.
- Send is disabled while a request is in flight or when the message is empty.
- `Enter` sends; `Shift+Enter` inserts a newline.
- The input has an accessible label and a visible focus indicator.

### Message list

- User and assistant messages are visually distinct and announced with appropriate roles.
- Each assistant message shows the answer, metrics, and request identifier.
- A "Ver raciocínio" button appears when the response includes a trace.
- The list scrolls to the newest message after a response.

### States

| State | Presentation |
|-------|--------------|
| Loading | Skeleton or spinner with `aria-busy="true"`; composer disabled |
| Empty | Icon, short title, explanation, and a prompt suggestion |
| Validation error | Inline message near the composer, linked with `aria-describedby` |
| Unsupported strategy | Distinct error with the strategy name |
| Not found | Distinct error with a link back to chat |
| Timeout | Distinct error with a retry action |
| Model unavailable | Distinct error with a retry action |
| Internal error | Generic, non-technical message with a retry action |
| Connectivity failure | Distinct error explaining the API could not be reached, with a link to settings |

## Trace panel ("Ver raciocínio")

- Opens from an assistant message and lists events in original order.
- Each event shows a type label, content, and available structured details: node, timestamp, tools, arguments, and approval status.
- Known types have distinct labels/icons; unknown types render raw content.
- An empty trace shows an explicit "no reasoning recorded" state.
- The panel is a dialog or disclosure with a visible close control, focus trap (if modal), and `Escape` to close.
- Long traces scroll within the panel without truncation.

## Approval card

- Rendered when `POST /chat` returns `202`.
- Shows the proposed action summary, tool, and arguments when available.
- Provides "Aprovar" and "Negar" buttons.
- While submitting, both buttons are disabled and a progress state is announced.
- On success, the card is replaced by the authoritative outcome (approved/denied) and, when present, the resulting answer.
- On failure, the card remains actionable and shows a retryable error.
- Duplicate or stale submissions are prevented.

## Settings panel

- Opened by the gear.
- Shows the current API base URL and allows editing.
- Validates on save: absolute `http:`/`https:` URL, non-empty.
- Invalid input shows an inline error and keeps the previous value.
- Saving persists the value and closes the panel or shows a confirmation.
- The panel is a dialog with a visible close control, focus trap, and `Escape` to close.

## Design tokens

- Spacing uses the 4px scale: `4, 8, 12, 16, 24, 32, 48, 64, 96`.
- Colors are semantic tokens (`--color-bg`, `--color-surface`, `--color-text`, `--color-border`, `--color-primary`, `--color-danger`, `--color-success`).
- Typography uses a small set of sizes and weights; hierarchy comes from size, weight, and color.
- Dark mode is implemented by overriding token values under `[data-theme="dark"]`.

## Accessibility

- WCAG AA contrast: `4.5:1` for normal text, `3:1` for large text and UI components.
- All flows are operable by keyboard alone, with a logical focus order.
- Focus is always visible; no outline removal without an equivalent indicator.
- Semantic HTML first; ARIA only where native semantics are insufficient.
- Every control has an accessible name; icon-only buttons use `aria-label`.
- State is never conveyed by color alone.
- `prefers-reduced-motion` is respected.
- Touch targets are at least 44×44 px.
- The layout supports 200% zoom and text resizing.
- Informative images have `alt`; decorative images use `alt=""`.
- Form fields have associated labels and accessible error messages.
