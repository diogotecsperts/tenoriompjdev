import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { retrieveExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt enforcing plain-text and strict clinical grounding
const SYSTEM_PROMPT = `Você é um perito médico do trabalho respondendo quesitos de um processo judicial.

REGRAS ABSOLUTAS:
1. Responda EXCLUSIVAMENTE com base nos DADOS CLÍNICOS fornecidos pelo perito. NÃO invente achados, diagnósticos ou conclusões.
2. Se um dado clínico não foi fornecido, responda: "Prejudicado ante a ausência de informações clínicas suficientes."
3. Use linguagem técnica médico-pericial em português formal.
4. NÃO use Markdown (*, #, **, etc.). Apenas texto plano com quebras de linha.
5. Formate cada quesito como: "QUESITO X: [pergunta]\\nRESPOSTA: [resposta]\\n\\n"
6. Numere os quesitos sequencialmente conforme aparecem no processo.
7. Escreva SEMPRE em português brasileiro com acentuação correta (á, é, í, ó, ú, ã, õ, ç).`;

// Default prompts for each group
const DEFAULT_PROMPTS: Record<string, string> = {
  juizo: `Analise o TEXTO DO PROCESSO abaixo e identifique TODOS os quesitos formulados pelo JUÍZO (juiz/vara).

Localize perguntas por: pontuação (?), listas numeradas, termos como "diga o perito", "esclareça o Sr. Perito", "informe", "responda".
Procure especialmente em despachos, decisões interlocutórias e atos ordinatórios.

TEXTO DO PROCESSO:
\${textoProcesso}

---

DADOS CLÍNICOS DO PERITO (use EXCLUSIVAMENTE estes dados para responder):
- Diagnósticos (CIDs): \${cids}
- Nexo Causal: \${nexoCausal}
- Análise de Incapacidade: \${incapacidade}
- Conclusão: \${conclusao}
- História Atual: \${historiaAtual}
- Exame Físico: \${exameFisico}
- Exames Complementares: \${examesComplementares}
- Atividades Laborais: \${atividadesLaborais}
- Antecedentes: \${antecedentes}
- Laudos Médicos: \${laudosMedicos}

Se NÃO encontrar quesitos do Juízo no processo, retorne UNICAMENTE: "Quesitos do Juízo não identificados nos autos."`,

  reclamante: `Analise o TEXTO DO PROCESSO abaixo e identifique TODOS os quesitos formulados pelo RECLAMANTE (autor/trabalhador).

Localize perguntas por: pontuação (?), listas numeradas, termos como "diga o perito", "esclareça", "informe".
Procure especialmente na petição inicial e em petições intermediárias do advogado do reclamante.

TEXTO DO PROCESSO:
\${textoProcesso}

---

DADOS CLÍNICOS DO PERITO (use EXCLUSIVAMENTE estes dados para responder):
- Diagnósticos (CIDs): \${cids}
- Nexo Causal: \${nexoCausal}
- Análise de Incapacidade: \${incapacidade}
- Conclusão: \${conclusao}
- História Atual: \${historiaAtual}
- Exame Físico: \${exameFisico}
- Exames Complementares: \${examesComplementares}
- Atividades Laborais: \${atividadesLaborais}
- Antecedentes: \${antecedentes}
- Laudos Médicos: \${laudosMedicos}

Se NÃO encontrar quesitos do Reclamante no processo, retorne UNICAMENTE: "Quesitos do Reclamante não identificados nos autos."`,

  reclamada: `Analise o TEXTO DO PROCESSO abaixo e identifique TODOS os quesitos formulados pela RECLAMADA (empresa/empregador).

Localize perguntas por: pontuação (?), listas numeradas, termos como "diga o perito", "esclareça", "informe".
Procure especialmente na contestação e em petições intermediárias do advogado da reclamada.

TEXTO DO PROCESSO:
\${textoProcesso}

---

DADOS CLÍNICOS DO PERITO (use EXCLUSIVAMENTE estes dados para responder):
- Diagnósticos (CIDs): \${cids}
- Nexo Causal: \${nexoCausal}
- Análise de Incapacidade: \${incapacidade}
- Conclusão: \${conclusao}
- História Atual: \${historiaAtual}
- Exame Físico: \${exameFisico}
- Exames Complementares: \${examesComplementares}
- Atividades Laborais: \${atividadesLaborais}
- Antecedentes: \${antecedentes}
- Laudos Médicos: \${laudosMedicos}

Se NÃO encontrar quesitos da Reclamada no processo, retorne UNICAMENTE: "Quesitos da Reclamada não identificados nos autos."`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // 2. Parse body
    const { laudoId, contexto } = await req.json();
    if (!laudoId || !contexto) {
      return new Response(JSON.stringify({ error: "laudoId e contexto são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[gerar-quesitos] Starting for laudo=${laudoId}, user=${userId}`);

    // 3. Validate laudo ownership and get ai_metadata
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: laudo, error: laudoError } = await supabaseAdmin
      .from("laudos")
      .select("user_id, ai_metadata")
      .eq("id", laudoId)
      .single();

    if (laudoError || !laudo) {
      return new Response(JSON.stringify({ error: "Laudo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (laudo.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Retrieve PDF text from storage
    const aiMetadata = laudo.ai_metadata as any;
    const contentPath = aiMetadata?.extracted_content_path || aiMetadata?.extractedContentPath;

    if (!contentPath) {
      return new Response(
        JSON.stringify({ error: "PDF não processado. Importe os autos primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[gerar-quesitos] Retrieving PDF content from: ${contentPath}`);
    const extractedContent = await retrieveExtractedContent(contentPath);

    if (!extractedContent?.rawText) {
      return new Response(
        JSON.stringify({ error: "Não foi possível recuperar o texto do PDF." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const textoProcesso = extractedContent.rawText;
    console.log(`[gerar-quesitos] PDF text length: ${textoProcesso.length} chars`);

    // 5. Build context variables from payload
    const contextVars = {
      textoProcesso,
      cids: contexto.cids || "Não informado",
      nexoCausal: contexto.nexoCausal || "Não informado",
      incapacidade: contexto.incapacidade || "Não informado",
      conclusao: contexto.conclusao || "Não informado",
      historiaAtual: contexto.historiaAtual || "Não informado",
      exameFisico: contexto.exameFisico || "Não informado",
      examesComplementares: contexto.examesComplementares || "Não informado",
      atividadesLaborais: contexto.atividadesLaborais || "Não informado",
      antecedentes: contexto.antecedentes || "Não informado",
      laudosMedicos: contexto.laudosMedicos || "Não informado",
    };

    // 6. Get AI config
    const aiConfig = await getAIConfig();

    // 7. Generate all 3 in parallel
    const groups = [
      { key: "juizo", promptId: "prompt_gen_quesitos_juizo", label: "Juízo" },
      { key: "reclamante", promptId: "prompt_gen_quesitos_reclamante", label: "Reclamante" },
      { key: "reclamada", promptId: "prompt_gen_quesitos_reclamada", label: "Reclamada" },
    ] as const;

    const results = await Promise.allSettled(
      groups.map(async (group) => {
        const userPrompt = await getPrompt(
          group.promptId,
          DEFAULT_PROMPTS[group.key],
          contextVars,
          {
            autoRegister: true,
            description: `Prompt para gerar respostas aos quesitos do ${group.label} com base no contexto clínico do perito`,
            cardId: "conclusao",
            sectionId: "quesitos",
          }
        );

        console.log(`[gerar-quesitos] Calling AI for ${group.label}...`);
        const result = await callAI(aiConfig, SYSTEM_PROMPT, userPrompt, {
          userId,
          promptType: `gerar_quesitos_${group.key}`,
          maxOutputTokens: 8192,
        });

        return { key: group.key, text: result.text, label: group.label };
      })
    );

    // 8. Process results
    const response: Record<string, string> = {
      quesitosJuizo: "",
      quesitosReclamante: "",
      quesitosReclamada: "",
    };

    const fieldMap: Record<string, string> = {
      juizo: "quesitosJuizo",
      reclamante: "quesitosReclamante",
      reclamada: "quesitosReclamada",
    };

    let successCount = 0;
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { key, text, label } = result.value;
        response[fieldMap[key]] = text.trim();
        successCount++;
        console.log(`[gerar-quesitos] ${label}: OK (${text.length} chars)`);
      } else {
        const reason = result.reason?.message || String(result.reason);
        errors.push(reason);
        console.error(`[gerar-quesitos] Failed:`, reason);
      }
    }

    if (successCount === 0) {
      return new Response(
        JSON.stringify({ error: "Falha ao gerar todos os quesitos.", details: errors }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[gerar-quesitos] Completed: ${successCount}/3 groups generated`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[gerar-quesitos] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
