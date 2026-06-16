/**
 * prev-pre-processar
 *
 * Pré-processamento de PDF de perícia PREVIDENCIÁRIA.
 * Fluxo:
 *  1. Baixa o PDF do bucket `prev-pdfs`.
 *  2. OCR via Mistral (mesmo shared helper usado em Impugnação).
 *  3. Extração estruturada via IA (getAIConfig + callAI, mesma camada do trabalhista).
 *  4. Salva `prev_extracao` (JSON), marca `pdf_processado=true` e cria entradas em `prev_documentos`.
 *
 * Isolado do módulo trabalhista. Não toca em `laudos` nem em `processos-pdf`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractWithMistralOCR, getMistralAPIKey } from "../_shared/mistral-ocr.ts";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  periciaId: string;
}

const DEFAULT_EXTRACTION_PROMPT = `Você é um perito médico judicial extraindo dados objetivos de um processo previdenciário (INSS) para uso em uma futura perícia.

Sua tarefa é ler o texto OCR do processo e devolver um JSON ESTRITO com os campos abaixo. Não invente. Se um campo não existir no documento, use string vazia "" (ou array vazio []).

NUNCA emita juízo médico, conclusão pericial, nexo, incapacidade ou diagnóstico próprio. Apenas EXTRAIA o que está escrito.

FORMATO DE SAÍDA (JSON puro, sem markdown, sem comentários):
{
  "identificacao": {
    "nome": "",
    "cpf": "",
    "rg": "",
    "data_nascimento": "",
    "idade": "",
    "sexo": "",
    "estado_civil": "",
    "escolaridade": "",
    "profissao": "",
    "ultima_atividade": "",
    "endereco": "",
    "telefone": ""
  },
  "processo": {
    "numero": "",
    "vara": "",
    "comarca": "",
    "beneficio_pleiteado": "",
    "data_distribuicao": ""
  },
  "historia_clinica": "",
  "historia_laboral": "",
  "queixa_principal": "",
  "comorbidades": "",
  "medicacoes": [],
  "cids_alegados": [],
  "tratamentos": "",
  "afastamentos": "",
  "documentos": [
    { "tipo": "laudo|exame|receita|pedido|outro", "data": "AAAA-MM-DD ou ''", "resumo": "uma frase objetiva" }
  ],
  "quesitos_juizo": [],
  "quesitos_autor": [],
  "quesitos_reu": []
}

REGRAS:
- Datas no formato AAAA-MM-DD quando possível; caso contrário, deixe como aparece no texto.
- CIDs no formato "X00.0 - Descrição" quando descrição estiver presente; senão só o código.
- "documentos" deve listar laudos, exames, receitas e pedidos médicos mencionados, com data e um resumo curto.
- Português brasileiro com acentuação correta.
- PROIBIDO usar a expressão "IA".
- PROIBIDO usar markdown.

TEXTO OCR DO PROCESSO:
\${ocrText}`;

const SYSTEM_PROMPT =
  'Você extrai dados objetivos de processos judiciais previdenciários e devolve APENAS JSON válido, sem markdown e sem texto adicional. É proibido usar a expressão "IA".';

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  // strip markdown fences
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // grab first {...} block if needed
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const t0 = Date.now();
  console.log("[prev-pre-processar] start");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReqBody;
    if (!body?.periciaId) {
      return new Response(JSON.stringify({ error: "periciaId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente autenticado (para validar o usuário)
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Cliente admin (storage + writes)
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Carrega perícia
    const { data: pericia, error: perErr } = await admin
      .from("prev_pericias")
      .select("id, user_id, pdf_path, pauta_id")
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
    if (!pericia.pdf_path) {
      return new Response(JSON.stringify({ error: "Esta perícia não tem PDF anexado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Download do PDF
    console.log(`[prev-pre-processar] downloading ${pericia.pdf_path}`);
    const { data: blob, error: dlErr } = await admin.storage
      .from("prev-pdfs")
      .download(pericia.pdf_path);
    if (dlErr || !blob) {
      return new Response(JSON.stringify({ error: `Falha ao baixar PDF: ${dlErr?.message ?? "vazio"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pdfBytes = new Uint8Array(await blob.arrayBuffer());
    const sizeMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[prev-pre-processar] PDF ${sizeMB}MB`);

    if (pdfBytes.byteLength > 50_000_000) {
      return new Response(
        JSON.stringify({ error: `PDF muito grande: ${sizeMB}MB (limite 50MB).` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) OCR via Mistral
    const mistralKey = getMistralAPIKey();
    if (!mistralKey) {
      return new Response(JSON.stringify({ error: "MISTRAL_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ocr = await extractWithMistralOCR(pdfBytes, mistralKey);
    console.log(`[prev-pre-processar] OCR: ${ocr.pageCount}p, ${ocr.text.length} chars`);

    // 4) Extração estruturada via IA configurada no DevPanel
    const aiConfig = await getAIConfig();
    const ocrText = ocr.text.length > 180_000 ? ocr.text.slice(0, 180_000) : ocr.text;

    const userPrompt = await getPrompt(
      "prompt_prev_extracao_processo",
      DEFAULT_EXTRACTION_PROMPT,
      { ocrText },
      {
        description: "PREV: Extração estruturada do PDF do processo (pré-processamento)",
        cardId: "previdenciario",
        sectionId: "pre-processamento",
      },
    );

    const aiResp = await callAI(aiConfig, SYSTEM_PROMPT, userPrompt, {
      userId,
      promptType: "prev_extracao_processo",
      maxOutputTokens: 8000,
      jsonMode: true,
    });

    const parsed = tryParseJson(aiResp.text);
    if (!parsed) {
      console.error("[prev-pre-processar] JSON parse failed. Raw head:", aiResp.text.slice(0, 400));
      return new Response(
        JSON.stringify({ error: "A IA retornou conteúdo fora do formato esperado. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5) Persistência: prev_extracao + status + documentos
    const extracao = {
      ...parsed,
      _meta: {
        ocr_pages: ocr.pageCount,
        ocr_chars: ocr.text.length,
        ai_provider: aiResp.provider,
        ai_model: aiResp.model,
        used_fallback: aiResp.usedFallback,
        extracted_at: new Date().toISOString(),
      },
    };

    const periciado_nome =
      parsed?.identificacao?.nome && typeof parsed.identificacao.nome === "string"
        ? parsed.identificacao.nome
        : null;

    const updatePatch: Record<string, unknown> = {
      prev_extracao: extracao,
      pdf_processado: true,
    };
    if (periciado_nome) updatePatch.periciado_nome = periciado_nome;

    const { error: updErr } = await admin
      .from("prev_pericias")
      .update(updatePatch)
      .eq("id", pericia.id);
    if (updErr) {
      console.error("[prev-pre-processar] update pericia failed:", updErr);
    }

    // documentos: limpa e regrava
    await admin.from("prev_documentos").delete().eq("pericia_id", pericia.id);
    const docs = Array.isArray(parsed?.documentos) ? parsed.documentos : [];
    if (docs.length > 0) {
      const rows = docs.slice(0, 100).map((d: any, i: number) => ({
        pericia_id: pericia.id,
        user_id: userId,
        tipo: ["laudo", "exame", "receita", "pedido", "outro"].includes(d?.tipo) ? d.tipo : "outro",
        data: typeof d?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : null,
        resumo: typeof d?.resumo === "string" ? d.resumo.slice(0, 600) : null,
        trecho_original: null,
        ordem: i,
      }));
      const { error: docErr } = await admin.from("prev_documentos").insert(rows);
      if (docErr) console.error("[prev-pre-processar] insert documentos failed:", docErr);
    }

    const durationMs = Date.now() - t0;
    console.log(`[prev-pre-processar] done in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        periciaId: pericia.id,
        pages: ocr.pageCount,
        documentosCriados: docs.length,
        provider: aiResp.provider,
        model: aiResp.model,
        durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[prev-pre-processar] FATAL:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
