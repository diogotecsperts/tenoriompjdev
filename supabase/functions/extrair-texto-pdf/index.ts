/**
 * Edge Function: extrair-texto-pdf
 * 
 * Extração simples de texto de PDFs via OCR para uso na página de Impugnação.
 * Esta função é 100% ISOLADA do sistema de importação de laudos (processar-autos).
 * 
 * Características:
 * - OCR via Mistral (fallback para Gemini Vision)
 * - Retorna apenas texto bruto (sem estruturação)
 * - Sem polling, sem resumos, sem atualização de jobs
 */

import { runOcrWithConfiguredProvider } from "../_shared/ocr-router.ts";
import { notifyPdfErrorFireAndForget } from "../_shared/notify-pdf-error.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  filePath: string;
}

interface ExtractionResult {
  texto: string;
  pageCount: number;
  provider: string;
  durationMs: number;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[extrair-texto-pdf] Request received");

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[extrair-texto-pdf] No authorization header");
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { filePath } = body;

    if (!filePath) {
      console.error("[extrair-texto-pdf] Missing filePath");
      return new Response(
        JSON.stringify({ error: "filePath é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[extrair-texto-pdf] Processing file: ${filePath}`);

    // Create Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download PDF from storage
    console.log("[extrair-texto-pdf] Downloading PDF from storage...");
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("processos-pdf")
      .download(filePath);

    if (downloadError || !pdfData) {
      console.error("[extrair-texto-pdf] Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: `Erro ao baixar arquivo: ${downloadError?.message || "Arquivo não encontrado"}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    const sizeMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[extrair-texto-pdf] PDF downloaded: ${sizeMB}MB`);

    // Check size limit (50MB for Mistral)
    if (pdfBytes.byteLength > 50_000_000) {
      return new Response(
        JSON.stringify({ 
          error: `Arquivo muito grande: ${sizeMB}MB. Limite: 50MB.`,
          suggestion: "Divida o PDF em partes menores."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text via provider configurado no DevPanel (Gemini ou Mistral)
    console.log("[extrair-texto-pdf] Starting OCR extraction (provider dinâmico)...");
    const ocrResult = await runOcrWithConfiguredProvider(pdfBytes, {
      logPrefix: "[extrair-texto-pdf]",
    });

    const totalDuration = Date.now() - startTime;
    console.log(`[extrair-texto-pdf] Extraction complete in ${totalDuration}ms`);
    console.log(
      `[extrair-texto-pdf] Pages: ${ocrResult.pageCount}, Chars: ${ocrResult.text.length}, Provider: ${ocrResult.provider}`,
    );

    const result: ExtractionResult = {
      texto: ocrResult.text,
      pageCount: ocrResult.pageCount,
      provider: ocrResult.provider,
      durationMs: totalDuration,
    };

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[extrair-texto-pdf] Error:", errorMessage);

    notifyPdfErrorFireAndForget({
      modulo: "Impugnação",
      errorMessage,
      stage: "ocr",
    });


    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
