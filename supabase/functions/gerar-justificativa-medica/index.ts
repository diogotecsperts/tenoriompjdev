/**
 * gerar-justificativa-medica
 *
 * On-demand AI text generation that REDIGES the technical justification
 * for a clinical decision ALREADY MADE by the medical expert in the UI.
 *
 * The AI does NOT decide. It only writes the defense for the doctor's choice.
 *
 * Campos suportados:
 *  - cid_descricao : descrição técnica dos CIDs digitados manualmente
 *  - nexo_causal   : justificativa defendendo o tipo de nexo escolhido
 *  - incapacidade  : justificativa defendendo o(s) tipo(s) de incapacidade escolhido(s)
 *  - conclusao     : análise conclusiva amarrando todas as escolhas
 *  - destino       : destino sugerido a partir das escolhas
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Campo = 'cid_descricao' | 'nexo_causal' | 'incapacidade' | 'conclusao' | 'destino' | 'referencias';

interface ReqBody {
  laudoId: string;
  campo: Campo;
  escolha?: string | string[];
  cidsManuais?: string[];
}

const FIELD_TO_PROMPT: Record<Campo, { id: string; description: string; cardId: string; sectionId: string }> = {
  cid_descricao: {
    id: 'prompt_gen_cid_descricao',
    description: 'Descrição técnica dos CIDs (geração sob demanda pelo médico)',
    cardId: 'analise-tecnica',
    sectionId: 'descricao-doencas',
  },
  nexo_causal: {
    id: 'prompt_gen_nexo_justificado',
    description: 'Justificativa do nexo (defende a escolha do médico)',
    cardId: 'analise-tecnica',
    sectionId: 'nexo',
  },
  incapacidade: {
    id: 'prompt_gen_incapacidade_justificada',
    description: 'Justificativa da incapacidade (defende a escolha do médico)',
    cardId: 'analise-tecnica',
    sectionId: 'analise-incapacidade',
  },
  conclusao: {
    id: 'prompt_gen_conclusao_amarrada',
    description: 'Conclusão amarrando as escolhas do médico',
    cardId: 'conclusao',
    sectionId: 'conclusao',
  },
  destino: {
    id: 'prompt_gen_destino_decidido',
    description: 'Destino sugerido com base nas escolhas do médico',
    cardId: 'conclusao',
    sectionId: 'conclusao',
  },
  referencias: {
    id: 'prompt_gen_referencias_demanda',
    description: 'Referências Bibliográficas (geração sob demanda pelo médico, contextualizada)',
    cardId: 'conclusao',
    sectionId: 'referencias',
  },
};

const DEFAULT_PROMPTS: Record<Campo, string> = {
  cid_descricao: `Você é médico-perito judicial. O médico digitou manualmente os seguintes CIDs:

CIDs informados pelo médico: \${cidsManuais}

ESCOPO ESTRITO DESTA SEÇÃO:
Você deve APENAS descrever a literatura médica da doença. É ESTRITAMENTE PROIBIDO emitir qualquer juízo de valor, concluir sobre a existência ou inexistência de incapacidade, opinar sobre nexo causal ou julgar o caso concreto nesta seção. Limite-se rigorosamente à descrição técnica da patologia conforme literatura médica.

Tarefa: Para CADA CID listado, redija em texto técnico contínuo (sem markdown, sem bullets, sem asteriscos, sem negrito):
- Definição da patologia
- Etiologia
- Quadro clínico característico
- Quando aplicável, relação com fatores ocupacionais (em termos GENÉRICOS da literatura, jamais aplicada ao periciando)

Contexto auxiliar (use apenas como referência, não invente):
- Posto de trabalho: \${postoTrabalho}
- Histórico ocupacional: \${historicoOcupacional}

Restrições absolutas:
1. Não use a expressão "IA" em hipótese alguma.
2. Não use formatação markdown.
3. Não invente dados clínicos do periciando.
4. Não emita conclusões periciais — apenas descrição de literatura.
5. Português brasileiro com acentuação correta.`,

  nexo_causal: `Você está REDIGINDO a fundamentação técnica de uma decisão JÁ TOMADA pelo médico-perito. Não questione a escolha. Use a escolha como tese e os dados clínicos como evidências de apoio.

DECISÃO DO MÉDICO sobre nexo causal: "\${nexoEscolhido}"

Tarefa: Redigir, em linguagem técnica médico-pericial, a justificativa que SUSTENTA essa decisão. Empregue, quando cabível, os critérios de Schilling, Bradford-Hill e Simonin como ferramentas de fundamentação. NÃO contradiga a decisão.

Dados do caso (use como evidência):
- CIDs: \${cidsLista}
- História atual: \${historiaAtual}
- História do acidente: \${historiaAcidente}
- Histórico ocupacional: \${historicoOcupacional}
- Atividades laborais: \${atividadesLaborais}
- Exame físico: \${exameFisico}
- Exames complementares: \${examesComplementares}

Restrições absolutas:
1. Não use a expressão "IA".
2. Sem markdown, sem bullets, sem asteriscos, sem negrito.
3. Não inventar dados ausentes — se faltar informação, usar formulação prudente.
4. Português brasileiro com acentuação correta.
5. Mínimo 2 parágrafos.`,

  incapacidade: `Você está REDIGINDO a fundamentação técnica de uma decisão JÁ TOMADA pelo médico-perito. Não questione a escolha. Use a escolha como tese.

DECISÃO DO MÉDICO sobre incapacidade laboral: "\${tipoIncapacidadeEscolhido}"

Tarefa: Redigir, em linguagem técnica médico-pericial, a justificativa que SUSTENTA essa decisão. Correlacione o tipo escolhido (total/parcial, temporária/permanente, ausência) com as limitações funcionais documentadas.

Dados do caso:
- CIDs: \${cidsLista}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Tratamentos realizados: \${tratamentos}
- Afastamentos: \${afastamentos}
- Atividades laborais: \${atividadesLaborais}

Restrições absolutas:
1. Não use a expressão "IA".
2. Sem markdown.
3. Não invente dados.
4. Português brasileiro com acentuação correta.
5. Mínimo 2 parágrafos.`,

  conclusao: `Você está redigindo a CONCLUSÃO FINAL de um laudo pericial médico-judicial, AMARRANDO as decisões já tomadas pelo médico-perito.

Decisões do médico:
- CIDs confirmados: \${cidsLista}
- Tipo de nexo: \${nexoEscolhido}
- Justificativa do nexo (já redigida): \${nexoJustificativa}
- Tipo de incapacidade: \${tipoIncapacidadeEscolhido}
- Justificativa da incapacidade (já redigida): \${incapacidadeJustificativa}

Dados clínicos de apoio:
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}

Tarefa: sintetizar em texto técnico contínuo a conclusão pericial, integrando coerentemente as decisões acima. Não contradiga nenhuma das escolhas.

Restrições absolutas:
1. Não use a expressão "IA".
2. Sem markdown.
3. Português brasileiro com acentuação correta.
4. Máximo 4 parágrafos.`,

  destino: `Com base nas decisões já tomadas pelo médico-perito, indique objetivamente o destino sugerido para o periciando.

Decisões do médico:
- Tipo de nexo: \${nexoEscolhido}
- Tipo de incapacidade: \${tipoIncapacidadeEscolhido}
- Justificativa da incapacidade: \${incapacidadeJustificativa}

Exemplos de destino: "Retorno ao trabalho sem restrições", "Reabilitação profissional", "Aposentadoria por invalidez", "Manutenção do benefício por incapacidade temporária", "Restrições funcionais permanentes — readequação de função".

Restrições:
1. Resposta em no máximo 2 frases.
2. Sem markdown, sem "IA".
3. Português brasileiro com acentuação correta.`,

  referencias: `Você é perito médico judicial. O médico já concluiu suas decisões clínicas. Sua tarefa é elencar referências bibliográficas REAIS e ESPECÍFICAS para o contexto clínico deste laudo — não citações genéricas.

Contexto clínico (use para escolher referências pertinentes):
- CIDs confirmados: \${cidsLista}
- Tipo de nexo decidido: \${nexoEscolhido}
- História atual: \${historiaAtual}
- Exame físico: \${exameFisico}
- Conclusão do médico: \${conclusaoMedica}

INSTRUÇÕES OBRIGATÓRIAS:
- Liste entre 5 e 8 referências REAIS, em formato ABNT, numeradas (1-, 2-, 3-, ...).
- Cada referência DEVE conter: autor(es), título, editora ou periódico, cidade quando aplicável, e ANO.
- Para artigos científicos, incluir volume/número e, quando aplicável, DOI.
- ESPECIFICIDADE OBRIGATÓRIA: referências relevantes aos CIDs e à natureza do nexo decidido.
- Inclua legislação aplicável apenas quando pertinente ao caso (CLT, Lei 8.213/91, NR específica).

PROIBIÇÕES:
1. PROIBIDO citar "Tratado de Medicina X" ou "Manual do MTE" SEM autor, edição e ano concretos.
2. PROIBIDO inventar autores, títulos, ISBN ou DOI.
3. Se faltar contexto, retorne apenas as referências que conseguir fundamentar com segurança (mínimo 3).
4. Não use a expressão "IA".
5. Sem markdown.
6. Português brasileiro com acentuação correta.

FORMATO DE SAÍDA (texto puro, numerado "1- ", "2- ", ...):`,
};

const SYSTEM_PROMPT =
  'Você é um perito médico judicial. Você REDIGE a fundamentação técnica de decisões clínicas JÁ TOMADAS pelo médico-perito; não as questiona. REGRA DE FORMATAÇÃO ESTRITA: retorne APENAS texto plano em português brasileiro, sem markdown (sem negrito, asteriscos, bullets, marcações de código). É proibido usar a expressão "IA". Use apenas quebras de linha entre parágrafos.';

function asString(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function buildContext(laudo: any, body: ReqBody): Record<string, string> {
  const cidsSelecionados = Array.isArray(laudo.cids_selecionados) ? laudo.cids_selecionados : [];
  const cidsLista = cidsSelecionados
    .map((c: any) => (typeof c === 'string' ? c : `${c.codigo ?? ''}${c.descricao ? ' — ' + c.descricao : ''}`))
    .filter(Boolean)
    .join(', ');

  const cidsManuais = Array.isArray(body.cidsManuais) && body.cidsManuais.length
    ? body.cidsManuais.join(', ')
    : cidsLista;

  // Mapear conclusao_status (pode ser JSON array string) para texto legível
  let tipoIncapacidadeEscolhido = '';
  if (body.campo === 'incapacidade' && body.escolha) {
    tipoIncapacidadeEscolhido = asString(body.escolha);
  } else if (laudo.conclusao_status) {
    try {
      const parsed = JSON.parse(laudo.conclusao_status);
      tipoIncapacidadeEscolhido = Array.isArray(parsed) ? parsed.join(', ') : String(parsed);
    } catch {
      tipoIncapacidadeEscolhido = String(laudo.conclusao_status);
    }
  }

  const nexoEscolhido = body.campo === 'nexo_causal' && body.escolha
    ? asString(body.escolha)
    : (laudo.nexo_causal_tipo || '');

  return {
    cidsManuais,
    cidsLista,
    nexoEscolhido,
    nexoJustificativa: laudo.nexo_causal_justificativa || '',
    tipoIncapacidadeEscolhido,
    incapacidadeJustificativa: laudo.analise_incapacidade_laboral || '',
    historiaAtual: laudo.historia_atual || '',
    historiaAcidente: laudo.historia_acidente || '',
    historicoOcupacional: laudo.historico_ocupacional || '',
    exameFisico: laudo.exame_fisico || '',
    examesComplementares: laudo.exames_complementares || '',
    tratamentos: laudo.tratamentos || '',
    afastamentos: laudo.afastamentos || '',
    atividadesLaborais: laudo.descricao_atividades_laborais || '',
    postoTrabalho: laudo.descricao_posto_trabalho || laudo.descricao_atividades_laborais || '',
    conclusaoMedica: laudo.conclusao_analise || '',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ReqBody;
    if (!body?.laudoId || !body?.campo || !FIELD_TO_PROMPT[body.campo]) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos: laudoId e campo são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validações específicas por campo
    if (body.campo === 'cid_descricao' && (!body.cidsManuais || body.cidsManuais.length === 0)) {
      return new Response(JSON.stringify({ error: 'cidsManuais é obrigatório para cid_descricao' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.campo === 'nexo_causal' && !body.escolha) {
      return new Response(JSON.stringify({ error: 'Selecione o tipo de nexo antes de gerar a justificativa' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.campo === 'incapacidade') {
      const arr = Array.isArray(body.escolha) ? body.escolha : (body.escolha ? [body.escolha] : []);
      if (arr.length === 0) {
        return new Response(JSON.stringify({ error: 'Selecione ao menos um tipo de incapacidade antes de gerar a justificativa' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Carregar laudo (ownership check)
    const { data: laudo, error: laudoError } = await supabase
      .from('laudos')
      .select(`
        id, user_id,
        cids_selecionados,
        nexo_causal_tipo, nexo_causal_justificativa,
        conclusao_status,
        analise_incapacidade_laboral,
        historia_atual, historia_acidente, historico_ocupacional,
        exame_fisico, exames_complementares,
        tratamentos, afastamentos,
        descricao_atividades_laborais, descricao_posto_trabalho
      `)
      .eq('id', body.laudoId)
      .single();

    if (laudoError || !laudo) {
      return new Response(JSON.stringify({ error: 'Laudo não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (laudo.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meta = FIELD_TO_PROMPT[body.campo];
    const ctx = buildContext(laudo, body);

    const interpolatedPrompt = await getPrompt(
      meta.id,
      DEFAULT_PROMPTS[body.campo],
      ctx,
      {
        autoRegister: true,
        description: meta.description,
        cardId: meta.cardId,
        sectionId: meta.sectionId,
      }
    );

    const aiConfig = await getAIConfig();
    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: 'Configuração de IA indisponível' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await callAI(
      aiConfig,
      SYSTEM_PROMPT,
      interpolatedPrompt,
      { promptType: `gen_${body.campo}`, userId: user.id }
    );

    return new Response(
      JSON.stringify({ texto: result.text, provider: result.provider, model: result.model }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[gerar-justificativa-medica] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
