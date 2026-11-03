import { z } from "zod";

const statusResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});

const statusUrls = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

export type ProviderName = keyof typeof statusUrls;

function failureResult(provider: ProviderName, reason: string): string {
  const conciseReason = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  return `Não consegui consultar o status de ${provider} (${conciseReason}). Use os alertas internos e avise o plantonista da limitação.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchProviderStatus(
  provider: ProviderName = "github",
  doFetch: typeof fetch = fetch,
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await doFetch(statusUrls[provider], {
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      if (attempt === 2) {
        return failureResult(provider, errorMessage(error));
      }
      continue;
    }

    if (response.status >= 500) {
      if (attempt === 2) {
        return failureResult(provider, `HTTP ${response.status}`);
      }
      continue;
    }

    if (!response.ok) {
      return failureResult(provider, `HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failureResult(provider, "resposta JSON inválida");
    }

    const parsed = statusResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return failureResult(provider, "resposta de status inválida");
    }

    const { indicator, description } = parsed.data.status;
    return `${provider} está ${indicator} — ${description}`;
  }

  return failureResult(provider, "falha inesperada");
}
