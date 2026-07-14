/**
 * prev-ocr-part
 *
 * OCR de UMA parte de um PDF Previdenciário grande (>48MB) usando o mesmo
 * provider configurado no DevPanel (via ocr-router). O client:
 *   1. Baixa o PDF completo, divide em partes ≤48MB (halving recursivo).
 *   2. Sobe cada parte em prev-pdfs/{user}/{periciaId}/parts/part-N.pdf.
 *   3. Invoca este endpoint por parte, concatena os textos.
 *   4. Reinvoca `prev-pre-processar` com `preExtractedText` para a extração AI final.
 *
 * Se o provider ativo for MiniMax (rasterização client-only) OU Gemini com
 * PDF grande, devolvemos `needsClientRasterize` para o frontend rodar o OCR
 * da parte via runMinimaxClientOcr, mantendo o padrão já usado em
 * `prev-pre-processar`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOcrRouterConfig, runOcrWithConfiguredProvider } from "../_shared/ocr-router.ts";
import { MINIMAX_CLIENT_RASTERIZE_ERROR } from "../_shared/minimax-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  periciaId: string;
  partPath: string;
}

const GEMINI_CLIENT_CHUNK_THRESHOLD_BYTES = 50 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado", code: "session_expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as ReqBody;
    if (!body?.periciaId || !body?.partPath) {
      return new Response(
        JSON.stringify({ error: "periciaId e partPath são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida", code: "session_expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    // Valida ownership do path: prev-pdfs/{userId}/{periciaId}/parts/...
    const expectedPrefix = `${userId}/${body.periciaId}/parts/`;
    if (!body.partPath.startsWith(expectedPrefix) || !body.partPath.endsWith(".pdf")) {
      return new Response(
        JSON.stringify({ error: "partPath inválido para esta perícia/usuário" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Confirma que a perícia pertence ao user (defesa em profundidade)
    const { data: pericia, error: perErr } = await admin
      .from("prev_pericias")
      .select("id, user_id")
      .eq("id", body.periciaId)
      .maybeSingle();
    if (perErr || !pericia) {
      return new Response(JSON.stringify({ error: "Perícia não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pericia.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Antes de baixar bytes: se o provider é MiniMax ou Gemini-grande, delega ao client.
    const ocrConfig = await getOcrRouterConfig();
    if (ocrConfig.provider === "minimax") {
      return new Response(
        JSON.stringify({
          ok: false,
          needsClientRasterize: true,
          mode: "minimax-client-rasterize",
          chunkEndpoint: "minimax-ocr-chunk",
          pdfPath: body.partPath,
          bucket: "prev-pdfs",
          provider: "minimax",
          model: "MiniMax-M3",
          message: "Provider MiniMax: rasterize a parte no navegador.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Baixa a parte do storage
    const { data: blob, error: dlErr } = await admin.storage
      .from("prev-pdfs")
      .download(body.partPath);
    if (dlErr || !blob) {
      return new Response(
        JSON.stringify({ error: `Falha ao baixar parte: ${dlErr?.message ?? "vazio"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // Gemini + parte já grande → delega ao client (client-rasterize por chunks)
    if (
      ocrConfig.provider === "gemini" &&
      bytes.byteLength >= GEMINI_CLIENT_CHUNK_THRESHOLD_BYTES
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          needsClientRasterize: true,
          mode: "gemini-client-rasterize",
          chunkEndpoint: "gemini-ocr-chunk",
          pdfPath: body.partPath,
          bucket: "prev-pdfs",
          provider: "gemini",
          model: ocrConfig.geminiModel,
          sizeBytes: bytes.byteLength,
          message: "Parte grande — Gemini roda em modo seguro por páginas/chunks no navegador.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[prev-ocr-part] pericia=${body.periciaId} part=${body.partPath} bytes=${bytes.byteLength} provider=${ocrConfig.provider}`,
    );

    let ocr;
    try {
      ocr = await runOcrWithConfiguredProvider(bytes, {
        logPrefix: `[prev-ocr-part:${body.periciaId}]`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes(MINIMAX_CLIENT_RASTERIZE_ERROR)) {
        return new Response(
          JSON.stringify({
            ok: false,
            needsClientRasterize: true,
            mode: "minimax-client-rasterize",
            chunkEndpoint: "minimax-ocr-chunk",
            pdfPath: body.partPath,
            bucket: "prev-pdfs",
            provider: "minimax",
            model: "MiniMax-M3",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[prev-ocr-part] ok pericia=${body.periciaId} chars=${ocr.text.length} pages=${ocr.pageCount} provider=${ocr.provider} in ${durationMs}ms`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        text: ocr.text,
        pageCount: ocr.pageCount,
        provider: ocr.provider,
        model: ocr.model,
        durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[prev-ocr-part] FATAL:", msg);
    return new Response(
      JSON.stringify({ error: msg, code: "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
