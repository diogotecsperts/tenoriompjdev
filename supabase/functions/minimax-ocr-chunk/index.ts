/**
 * minimax-ocr-chunk — endpoint fino que processa 1 chunk de páginas (imagens JPEG b64)
 * via MiniMax M3 chat completions.
 *
 * Zero CPU pesada (sem rasterização) — só HTTP para api.minimax.io.
 * Rasterização é feita no browser (src/lib/minimax-ocr-client.ts).
 *
 * Body:
 *   {
 *     images: string[],          // data URLs "data:image/jpeg;base64,..."
 *     contextSummary: string,    // resumo do chunk anterior (≤500 tokens); vazio no 1º
 *     chunkIndex: number,
 *     pageStart: number,         // número real da 1ª página (1-based)
 *     pageEnd: number,
 *     isCheckpoint?: boolean     // marca chunk de merge (a cada N chunks)
 *   }
 *
 * Retorno:
 *   { ok: true, text: string, summary: string, structured: object, tokensInput, tokensOutput }
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callMinimaxChat, getMinimaxAPIKey, type MinimaxChatMessage } from "../_shared/minimax-client.ts";
import {
  MINIMAX_OCR_SYSTEM_PROMPT,
  buildMinimaxOcrUserText,
} from "../_shared/prompts/minimax-ocr.ts";

interface ReqBody {
  images: string[];
  contextSummary?: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  isCheckpoint?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const apiKey = getMinimaxAPIKey();
    if (!apiKey) {
      return json({ ok: false, error: "MINIMAX_API_KEY não configurada" }, 500);
    }

    const body = (await req.json()) as ReqBody;
    if (!Array.isArray(body?.images) || body.images.length === 0) {
      return json({ ok: false, error: "images é obrigatório e não pode estar vazio" }, 400);
    }
    if (body.images.length > 30) {
      return json({ ok: false, error: `Máximo 30 imagens por chunk (recebi ${body.images.length})` }, 400);
    }

    const messages: MinimaxChatMessage[] = [
      { role: "system", content: MINIMAX_OCR_SYSTEM_PROMPT },
    ];

    if (body.contextSummary && body.contextSummary.trim().length > 0) {
      // Cross-chunk context via role=assistant (preserva cache do system prompt)
      messages.push({
        role: "assistant",
        content: `[Resumo do chunk anterior]\n${body.contextSummary.trim().slice(0, 2000)}`,
      });
    }

    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: buildMinimaxOcrUserText(body.chunkIndex, body.pageStart, body.pageEnd, body.isCheckpoint),
        },
        ...body.images.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    });

    console.log(
      `[minimax-ocr-chunk] chunk=${body.chunkIndex} pages=${body.pageStart}-${body.pageEnd} ` +
      `imgs=${body.images.length} ctx=${body.contextSummary?.length ?? 0}chars checkpoint=${!!body.isCheckpoint}`,
    );

    // Retry com backoff exponencial em 429/5xx (respeitando Retry-After quando disponível)
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await callMinimaxChat({
          messages,
          maxTokens: 16000,
          temperature: 0,
          jsonMode: true,
          apiKey,
        });

        const parsed = safeParseJson(res.text);
        const structured = parsed ?? { paginas: [], resumo_chunk: "", confianca_geral: 0 };
        const text = extractTextFromStructured(structured, body.pageStart);
        const summary = clipTo(String(structured?.resumo_chunk || ""), 2000);

        return json({
          ok: true,
          text,
          summary,
          structured,
          chunkIndex: body.chunkIndex,
          pageStart: body.pageStart,
          pageEnd: body.pageEnd,
          tokensInput: res.tokensInput,
          tokensOutput: res.tokensOutput,
          durationMs: Date.now() - t0,
        });
      } catch (e) {
        lastErr = e as Error;
        const msg = lastErr.message;
        const retryable = /\b(429|500|502|503|504)\b/.test(msg);
        if (!retryable || attempt === 3) break;
        // backoff 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(
          `[minimax-ocr-chunk] chunk=${body.chunkIndex} retry ${attempt + 1}/3 em ${delay}ms: ${msg.slice(0, 200)}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return json(
      {
        ok: false,
        error: lastErr?.message?.slice(0, 500) || "falha desconhecida",
        chunkIndex: body.chunkIndex,
        pageStart: body.pageStart,
        pageEnd: body.pageEnd,
        durationMs: Date.now() - t0,
      },
      502,
    );
  } catch (e) {
    console.error("[minimax-ocr-chunk] erro fatal:", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // tenta extrair objeto por delimitação
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractTextFromStructured(structured: unknown, pageStartFallback: number): string {
  // deno-lint-ignore no-explicit-any
  const s = structured as any;
  if (!s || !Array.isArray(s.paginas)) return "";
  const parts: string[] = [];
  for (let i = 0; i < s.paginas.length; i++) {
    const p = s.paginas[i];
    const num = Number(p?.numero) || pageStartFallback + i;
    const txt = String(p?.texto_integral || "").trim();
    if (txt) parts.push(`--- Página ${num} ---\n${txt}`);
  }
  return parts.join("\n\n");
}

function clipTo(s: string, maxChars: number): string {
  if (!s) return "";
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}
