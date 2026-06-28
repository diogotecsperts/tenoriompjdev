/**
 * Classificador de erros da Mistral usado APENAS pelo módulo Previdenciário.
 * Não toca em helpers compartilhados nem no módulo Trabalhista.
 *
 * Recebe a mensagem de erro lançada por `_shared/mistral-ocr.ts`
 * (formato: `Mistral upload failed (STATUS): BODY` ou `Mistral OCR failed (STATUS): BODY`)
 * e devolve um código semântico + mensagem amigável em pt-BR + status HTTP recomendado.
 */

export type MistralErrorCode =
  | "quota_exceeded"
  | "invalid_key"
  | "rate_limited"
  | "file_too_large"
  | "unsupported_file"
  | "provider_unavailable"
  | "unknown";

export interface ClassifiedMistralError {
  code: MistralErrorCode;
  userMessage: string;
  httpStatus: number;
  upstreamStatus: number | null;
}

const MESSAGES: Record<MistralErrorCode, string> = {
  quota_exceeded:
    "Cota mensal da IA de OCR esgotada. O processamento será retomado automaticamente quando a cota for renovada pelo provedor.",
  invalid_key:
    "Credencial da IA de OCR inválida ou revogada. Avise o administrador para atualizar a chave.",
  rate_limited:
    "Muitas requisições simultâneas à IA de OCR. Aguarde alguns segundos e tente novamente.",
  file_too_large:
    "PDF excede o tamanho máximo aceito pela IA de OCR (50MB).",
  unsupported_file:
    "Formato de arquivo não suportado pela IA de OCR. Use um PDF válido.",
  provider_unavailable:
    "Serviço de OCR temporariamente indisponível. Tente novamente em instantes.",
  unknown:
    "Falha inesperada na IA de OCR. Tente novamente; se persistir, avise o suporte.",
};

const HTTP_STATUS: Record<MistralErrorCode, number> = {
  quota_exceeded: 402,
  invalid_key: 401,
  rate_limited: 429,
  file_too_large: 413,
  unsupported_file: 415,
  provider_unavailable: 503,
  unknown: 502,
};

/**
 * Tenta extrair (status, body) de uma mensagem no formato:
 *   "Mistral upload failed (401): {\"detail\":\"Unauthorized\"}"
 *   "Mistral OCR failed (429): ..."
 *   "Arquivo muito grande para Mistral OCR: 60MB (limite: 50MB)"
 */
function parseMistralErrorMessage(
  message: string,
): { status: number | null; body: string } {
  const m = message.match(/\((\d{3})\)\s*:\s*([\s\S]*)$/);
  if (m) {
    return { status: parseInt(m[1], 10), body: m[2] ?? "" };
  }
  return { status: null, body: message };
}

function bodyMentions(body: string, ...needles: string[]): boolean {
  const lower = body.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

export function classifyMistralError(message: string): ClassifiedMistralError {
  const { status, body } = parseMistralErrorMessage(message);

  // Caso especial: limite local de tamanho disparado antes do upload
  if (/arquivo muito grande/i.test(message) || /limite:\s*50mb/i.test(message)) {
    return build("file_too_large", status);
  }

  if (status === 401) {
    return build("invalid_key", status);
  }

  if (status === 402) {
    return build("quota_exceeded", status);
  }

  if (status === 403) {
    if (bodyMentions(body, "quota", "exceeded", "payment", "billing", "limit")) {
      return build("quota_exceeded", status);
    }
    return build("invalid_key", status);
  }

  if (status === 429) {
    if (bodyMentions(body, "quota", "monthly", "billing", "exceeded")) {
      return build("quota_exceeded", status);
    }
    return build("rate_limited", status);
  }

  if (status === 413) return build("file_too_large", status);
  if (status === 415) return build("unsupported_file", status);

  if (status !== null && status >= 500 && status < 600) {
    return build("provider_unavailable", status);
  }

  if (status === 400) {
    if (bodyMentions(body, "too large", "size", "exceeds")) {
      return build("file_too_large", status);
    }
    if (bodyMentions(body, "unsupported", "invalid file", "invalid pdf")) {
      return build("unsupported_file", status);
    }
  }

  return build("unknown", status);
}

function build(code: MistralErrorCode, upstreamStatus: number | null): ClassifiedMistralError {
  return {
    code,
    userMessage: MESSAGES[code],
    httpStatus: HTTP_STATUS[code],
    upstreamStatus,
  };
}

/**
 * Heurística para decidir se uma exceção veio da Mistral
 * (mantém o classificador isolado dos outros erros).
 */
export function isMistralError(message: string): boolean {
  return /Mistral (upload|OCR) failed|Mistral OCR:/i.test(message) ||
    /arquivo muito grande para mistral/i.test(message);
}
