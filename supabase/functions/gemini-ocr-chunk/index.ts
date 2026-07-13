import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ReqBody {
  images: string[];
  contextSummary?: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  isCheckpoint?: boolean;
  model?: string;
}

const GEMINI_MODEL_MAP: Record<string, string> = {
  "gemini-3-pro-preview": "gemini-3-pro-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash": "gemini-3.5-flash",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.5-flash-8b": "gemini-2.5-flash-8b",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.0-flash-exp": "gemini-2.0-flash-exp",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
};

const SYSTEM_PROMPT = `Você é um sistema OCR especialista em documentos jurídicos e médicos brasileiros.

REGRAS ABSOLUTAS:
1. Transcreva todas as palavras visíveis das imagens, incluindo cabeçalhos, rodapés, carimbos e numeração.
2. Preserve quebras de linha. Para tabelas, use texto organizado com separadores simples.
3. Não resuma, não interprete, não invente dados.
4. Se uma página estiver ilegível, informe explicitamente no texto da página.
5. Responda somente JSON puro, sem markdown.

SCHEMA:
{
  "paginas": [
    { "numero": number, "texto_integral": string }
  ],
  "resumo_chunk": string
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Sessão inválida" }, 401);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ ok: false, error: "GEMINI_API_KEY não configurada" }, 500);

    const body = (await req.json()) as ReqBody;
    if (!Array.isArray(body?.images) || body.images.length === 0) {
      return json({ ok: false, error: "images é obrigatório e não pode estar vazio" }, 400);
    }
    if (body.images.length > 12) {
      return json({ ok: false, error: `Máximo 12 imagens por chunk (recebi ${body.images.length})` }, 400);
    }
    if (!Number.isFinite(body.pageStart) || !Number.isFinite(body.pageEnd) || body.pageStart < 1 || body.pageEnd < body.pageStart) {
      return json({ ok: false, error: "Intervalo de páginas inválido" }, 400);
    }

    const requestedModel = String(body.model || "gemini-2.5-flash").replace(/^google\//, "");
    const model = GEMINI_MODEL_MAP[requestedModel] || requestedModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const userText = [
      `OCR do chunk ${Number(body.chunkIndex || 0) + 1}, páginas ${body.pageStart} a ${body.pageEnd}.`,
      body.contextSummary ? `Contexto do chunk anterior: ${String(body.contextSummary).slice(0, 2000)}` : "",
      body.isCheckpoint ? "Este é um checkpoint: o resumo_chunk deve consolidar brevemente os pontos principais já vistos." : "",
      "Retorne o JSON no schema exigido."
    ].filter(Boolean).join("\n\n");

    const imageParts = body.images.map((dataUrl, idx) => {
      const parsed = parseImageDataUrl(String(dataUrl));
      if (!parsed) throw new Error(`Imagem ${idx + 1} inválida: esperado data:image/...;base64`);
      return { inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } };
    });

    console.log(
      `[gemini-ocr-chunk] model=${model} chunk=${body.chunkIndex} pages=${body.pageStart}-${body.pageEnd} imgs=${body.images.length}`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 95_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: `${SYSTEM_PROMPT}\n\n${userText}` },
            ...imageParts,
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16000,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId)).catch((e) => {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error(`Gemini OCR chunk timeout após 95s (model=${model})`);
      }
      throw e;
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error(`[gemini-ocr-chunk] provider error ${response.status}: ${raw.slice(0, 800)}`);
      return json({ ok: false, error: `Gemini API error (${response.status}): ${raw.slice(0, 800)}` }, response.status);
    }

    const data = JSON.parse(raw);
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const parsed = safeParseJson(text);
    const structured = parsed ?? { paginas: [], resumo_chunk: "" };
    const extracted = extractTextFromStructured(structured, body.pageStart);
    const summary = clipTo(String((structured as any)?.resumo_chunk || ""), 2000);

    if (!extracted.trim()) {
      return json({ ok: false, error: "Gemini retornou chunk sem texto transcrito" }, 502);
    }

    return json({
      ok: true,
      text: extracted,
      summary,
      structured,
      provider: "gemini",
      model,
      chunkIndex: body.chunkIndex,
      pageStart: body.pageStart,
      pageEnd: body.pageEnd,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    console.error("[gemini-ocr-chunk] erro fatal:", e);
    return json({ ok: false, error: (e as Error).message || "Erro desconhecido" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseImageDataUrl(value: string): { mimeType: string; base64: string } | null {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractTextFromStructured(structured: unknown, pageStartFallback: number): string {
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