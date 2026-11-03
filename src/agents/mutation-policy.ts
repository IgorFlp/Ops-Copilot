const INCIDENT_REFERENCE = "(?:incidente|incidentes|incident|incidents)";
const INCIDENT_MODIFIER =
  "(?:(?:um|uma|o|a|os|as|the|an|new|novo|nova|primeiro|primeira|first|[0-9]+|one|two|three|four|five|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|critical|high|medium|low|severity|severidade|p[1-4]|sev[- ]?[1-4])\\s+){0,4}";
const OPEN_INCIDENT_INTENT = new RegExp(
  `\\b(?:abra|abrir|crie|criar|registre|registrar|open|create)\\s+${INCIDENT_MODIFIER}\\b${INCIDENT_REFERENCE}\\b`,
  "i",
);
const RESOLVE_INCIDENT_INTENT = new RegExp(
  `\\b(?:resolva|resolver|resolve|close|feche|fechar)\\s+${INCIDENT_MODIFIER}\\b${INCIDENT_REFERENCE}\\b`,
  "i",
);
const RESOLVE_FIRST_INTENT =
  /\b(resolva|resolver|resolve|close|feche|fechar)\s+(?:o|a|the)?\s*(?:primeiro|primeira|first)\b/i;

export function normalizeIntent(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasPositiveIntent(
  normalized: string,
  expression: RegExp,
): boolean {
  const match = expression.exec(normalized);
  if (!match) return false;
  const prefix = normalized.slice(Math.max(0, match.index - 40), match.index);
  return (
    !/\b(?:nao|not|never|avoid|without|dont|don't)\b(?:\s+[\w'-]+){0,3}\s*$/i.test(
      prefix,
    ) &&
    !/\b(?:to|para)\s*$/i.test(prefix)
  );
}

function hasResolveIntent(normalized: string): boolean {
  return (
    hasPositiveIntent(normalized, RESOLVE_INCIDENT_INTENT) ||
    (hasPositiveIntent(normalized, RESOLVE_FIRST_INTENT) &&
      /\b(incidente|incidentes|incident|incidents)\b/i.test(normalized))
  );
}

export function isMutationAuthorized(
  input: string,
  tool:
    | "list_alerts"
    | "open_incidente"
    | "resolve_incidente"
    | "List_incidentes"
    | "consultar_runbook",
): boolean {
  const normalized = normalizeIntent(input);
  if (tool === "open_incidente") {
    return hasPositiveIntent(normalized, OPEN_INCIDENT_INTENT);
  }
  if (tool === "resolve_incidente") {
    return hasResolveIntent(normalized);
  }
  return true;
}

export function hasOperationalIntent(input: string): boolean {
  const normalized = normalizeIntent(input);
  return (
    /\b(liste|listar|mostre|mostrar|list|show)\b/i.test(normalized) ||
    /\b(analise|analisar|investigue|investigar|analyze|investigate)\b.{0,40}\b(alertas?|incidentes?|alerts?|incidents?)\b/i.test(
      normalized,
    ) ||
    hasPositiveIntent(normalized, OPEN_INCIDENT_INTENT) ||
    hasResolveIntent(normalized)
  );
}
