import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOcrRouterConfig, runOcrWithConfiguredProvider } from "../_shared/ocr-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GLM_OCR_EDGE_MAX_PAGES = 30;

interface ReqBody {
  partPath: string;
  pageCount?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autenticado", code: "session_expired" }, 401);
    }

    const body = (await req.json()) as ReqBody;
    const partPath = String(body?.partPath || "");
    if (!partPath || !partPath.endsWith(".pdf") || partPath.includes("..")) {
      return json({ error: "partPath inválido" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Sessão inválida", code: "session_expired" }, 401);
    }

    const userId = userData.user.id;
    if (!partPath.startsWith(`${userId}/`)) {
      return json({ error: "partPath inválido para este usuário" }, 403);
    }

    const ocrConfig = await getOcrRouterConfig();
    if (ocrConfig.provider !== "glm") {
      return json({ error: "Endpoint exclusivo para OCR GLM no Trabalhista", provider: ocrConfig.provider }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: blob, error: dlErr } = await admin.storage
      .from("processos-pdf")
      .download(partPath);
    if (dlErr || !blob) {
      return json({ error: `Falha ao baixar parte: ${dlErr?.message ?? "vazio"}` }, 500);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pageCount = Number.isFinite(body.pageCount) && Number(body.pageCount) > 0
      ? Math.floor(Number(body.pageCount))
      : undefined;

    if (pageCount && pageCount > GLM_OCR_EDGE_MAX_PAGES) {
      return json({
        error: `Parte GLM com ${pageCount} páginas excede o teto operacional de ${GLM_OCR_EDGE_MAX_PAGES} páginas por função curta.`,
        code: "glm_part_too_large",
        pageCount,
        maxPages: GLM_OCR_EDGE_MAX_PAGES,
      }, 400);
    }

    console.log(
      `[trabalhista-ocr-part] user=${userId} part=${partPath} bytes=${bytes.byteLength} pages=${pageCount ?? "?"}`,
    );

    const ocr = await runOcrWithConfiguredProvider(bytes, {
      logPrefix: `[trabalhista-ocr-part]`,
      pageCount,
    });

    return json({
      ok: true,
      text: ocr.text,
      pageCount: ocr.pageCount || pageCount || 0,
      provider: ocr.provider,
      model: ocr.model,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trabalhista-ocr-part] FATAL:", msg);
    return json({ error: msg, code: "unknown" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}