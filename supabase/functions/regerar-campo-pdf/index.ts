import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { retrieveExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk, getFieldPrompt } from "../_shared/smart-chunker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Field-specific prompts for regeneration - DETAILED for maximum quality
const fieldPrompts: Record<string, string> = {
  historiaAtual: `Extraia e detalhe ao máximo a "História Atual" ou "Queixas Atuais" / "Anamnese" do documento.

EXTRAIA COM MÁXIMO DETALHAMENTO:
- Todos os sintomas relatados pelo periciando e sua intensidade
- Localização e irradiação da dor (onde dói, para onde irradia)
- Fatores de melhora e piora dos sintomas
- Periodicidade e frequência dos sintomas
- Impacto nas atividades diárias (o que não consegue fazer)
- Impacto nas atividades laborais (limitações no trabalho)
- Medicamentos em uso atual (nomes, doses)
- Qualidade do sono e alterações de humor
- Limitações funcionais específicas

MÍNIMO 3 parágrafos. NÃO resuma. Use linguagem técnica médico-legal.`,

  historicoOcupacional: `Extraia e detalhe ao máximo o "Histórico Ocupacional" do documento.

EXTRAIA CRONOLOGICAMENTE:
- Todas as empresas onde trabalhou (nome, período)
- Cargos e funções exercidas em cada emprego
- Atividades desenvolvidas em cada função
- Exposição a riscos ocupacionais (ruído, vibração, esforço físico, produtos químicos)
- Tempo de exposição em cada atividade
- Motivo de saída de cada emprego
- Evolução da carreira profissional

Busque em: CTPS, PPP, depoimentos, petição inicial.
MÍNIMO 2 parágrafos ou lista cronológica completa. Use linguagem técnica.`,

  historiaAcidente: `Extraia e detalhe ao máximo a "História do Acidente" ou "Descrição do Evento" do documento.

EXTRAIA COM PRECISÃO:
- Data exata do acidente/evento
- Local exato onde ocorreu (setor, área, empresa)
- Circunstâncias detalhadas do evento
- Mecanismo da lesão (como ocorreu o trauma)
- Posição do trabalhador no momento
- Atividade que estava sendo realizada
- Testemunhas (se mencionadas)
- Atendimento inicial recebido (socorro, pronto-socorro)
- Consequências imediatas (lesões, sintomas iniciais)
- Emissão de CAT (se houve)

MÍNIMO 2 parágrafos. NÃO resuma. Transcreva todos os detalhes disponíveis.`,

  antecedentes: `Extraia TODOS os "Antecedentes Patológicos" do documento.

LISTE COMPLETAMENTE:
- Doenças crônicas prévias (diabetes, hipertensão, cardiopatias, etc.)
- Cirurgias anteriores (data, tipo, local, resultado)
- Internações hospitalares (motivo, período, hospital)
- Uso de medicamentos crônicos (lista completa)
- Histórico familiar relevante (doenças hereditárias)
- Hábitos de vida (tabagismo: quantos anos/maços; etilismo: frequência)
- Acidentes ou lesões anteriores ao evento em questão
- Tratamentos prévios realizados

NÃO deixe vazio se houver QUALQUER menção a saúde prévia.`,

  tratamentos: `Extraia TODOS os "Tratamentos Realizados" do documento.

LISTE EM FORMATO ESTRUTURADO:
- Medicamentos utilizados (nome, dose, período de uso, resposta ao tratamento)
- Fisioterapia (número de sessões, período, resultado obtido)
- Cirurgias realizadas (data, tipo, hospital, evolução pós-operatória)
- Internações (período, motivo, condutas realizadas)
- Acompanhamento especializado (especialidade, frequência)
- Procedimentos invasivos (infiltrações, bloqueios, etc.)
- Uso de órteses, próteses ou equipamentos
- Tratamentos alternativos (acupuntura, RPG, etc.)

Seja específico com datas e resultados de cada tratamento.`,

  afastamentos: `Extraia TODOS os "Períodos de Afastamento" do documento.

LISTE CRONOLOGICAMENTE:
- Data de início e término de CADA afastamento
- CID-10 de cada afastamento (obrigatório se disponível)
- Tipo de benefício recebido:
  * Auxílio-doença previdenciário (B31)
  * Auxílio-doença acidentário (B91)
  * Aposentadoria por invalidez
  * Licença médica
- Duração de cada período afastado
- Tempo total acumulado de afastamento
- Se houve alta médica e retorno ao trabalho
- Resultado de perícias do INSS (se mencionado)

EXTRAIA DATAS EXATAS. Liste todos os afastamentos identificados.`,

  laudosMedicos: `Extraia TODOS os "Laudos Médicos" ou "Pareceres Médicos" do documento.

PARA CADA LAUDO, EXTRAIA:
- Data do documento
- Nome do médico e especialidade
- Diagnósticos (com códigos CID-10 se disponíveis)
- Achados do exame clínico descritos
- Conclusões do médico
- Recomendações e restrições médicas
- Limitações funcionais apontadas
- Prognóstico (se mencionado)

ESTRUTURE ASSIM:
**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**
- Diagnósticos: [listar com CIDs]
- Conclusões: [descrever]
- Recomendações: [descrever]
- Limitações: [listar]

Liste CADA laudo separadamente. NÃO resuma.`,

  examesComplementares: `Extraia TODOS os "Exames Complementares" do documento.

PARA CADA EXAME, EXTRAIA:
- Tipo de exame (Radiografia, RNM, TC, EMG, Ultrassonografia, Laboratoriais, etc.)
- Data de realização
- Região/área examinada
- TODOS os achados e resultados
- Conclusão do laudo do exame

ESTRUTURE ASSIM:
**[Tipo do Exame] - [Região] (DD/MM/AAAA):**
[Descrição completa dos achados]
Conclusão: [conclusão do exame]

Exemplo: "**RNM Coluna Lombar (15/03/2023):** Retificação da lordose lombar. Protrusão discal L4-L5 com contato radicular. Abaulamento discal difuso L5-S1. Estenose foraminal bilateral."

NÃO resuma. Liste TODOS os achados de cada exame.`,

  exameFisico: `Extraia as informações do "Exame Físico" realizadas no periciando.

SE HOUVER DESCRIÇÃO DE EXAME FÍSICO, EXTRAIA:
- Estado geral do periciando
- Inspeção (deformidades, atrofias, edemas, cicatrizes, posturas antálgicas)
- Palpação (pontos dolorosos, contraturas musculares, massas palpáveis)
- Testes especiais realizados e seus resultados:
  * Coluna: Lasègue, Wassermann, Schober
  * Ombro: Jobe, Neer, Hawkins
  * Punho: Phalen, Tinel, Finkelstein
  * Outros conforme região avaliada
- Amplitude de movimentos (ADM) de cada articulação
- Força muscular (graus 0-5 por grupamento)
- Reflexos profundos
- Sensibilidade
- Marcha e postura
- Manobras específicas

Se não houver exame físico descrito nos autos, retorne: "Exame físico não descrito nos autos do processo."`,

  descricaoPostoTrabalho: `Extraia e detalhe a "Descrição do Posto de Trabalho" do documento.

EXTRAIA COM MÁXIMO DETALHAMENTO:
- Ambiente físico (interno/externo, coberto/descoberto, climatizado)
- Dimensões e layout do local de trabalho
- Equipamentos e máquinas utilizados (listar todos)
- Mobiliário disponível (mesa, cadeira, bancada - alturas, regulagens)
- Condições ergonômicas do posto
- Exposição a riscos físicos:
  * Ruído (intensidade se disponível)
  * Vibração (tipo, frequência)
  * Temperatura extrema
  * Radiação
- Exposição a riscos químicos (produtos, substâncias)
- Condições de iluminação e ventilação
- EPIs fornecidos e utilizados

Busque em: PPP, PPRA, PCMSO, laudos ergonômicos, depoimentos.
MÍNIMO 2 parágrafos. Seja detalhado.`,

  descricaoAtividadesLaborais: `Extraia e detalhe as "Atividades Laborais" ou "Descrição das Funções" do documento.

EXTRAIA COM MÁXIMO DETALHAMENTO:
- Descrição completa das tarefas diárias
- Movimentos repetitivos realizados (tipo, frequência, duração)
- Esforço físico exigido (peso carregado em kg, frequência de levantamento)
- Posturas de trabalho:
  * Tempo em pé, sentado, agachado, curvado
  * Posições dos membros superiores
- Jornada de trabalho (horário, turnos)
- Horas extras (frequência, duração)
- Pausas durante a jornada (frequência, duração)
- Ritmo de trabalho e metas de produção
- Uso de ferramentas manuais
- Demanda física e mental da função

Busque em: PPP, PPRA, depoimentos, petição inicial.
MÍNIMO 2 parágrafos. Seja específico e detalhado.`,

  descricaoTecnicaDoencas: `Extraia informações sobre as doenças mencionadas e descreva tecnicamente cada uma.
Para cada CID/doença, forneça: definição, etiologia, sintomas, relação ocupacional quando aplicável.
Use linguagem técnica médica apropriada para laudo pericial.`,

  conclusaoAnalise: `Elabore uma "Análise Conclusiva" técnica para o laudo pericial com base em todas as informações extraídas.

A ANÁLISE DEVE CONTER:
1. Síntese do quadro clínico atual do periciando
2. Correlação entre as atividades laborais e as patologias diagnosticadas
3. Análise crítica da documentação médica apresentada
4. Fundamentação técnica para as conclusões sobre:
   - Nexo causal (se há relação entre trabalho e doença/lesão)
   - Incapacidade laboral (tipo e grau)
5. Considerações sobre prognóstico

Use linguagem técnica médico-legal. Seja objetivo e fundamentado.
MÍNIMO 2 parágrafos.`,

  quesitosJuizo: `Extraia os "Quesitos do Juízo" do documento.
Liste cada quesito numerado EXATAMENTE como consta no documento, sem inventar respostas.
Mantenha a formatação e numeração original.`,

  quesitosReclamante: `Extraia os "Quesitos do Reclamante" ou "Quesitos do Autor" do documento.
Liste cada quesito numerado EXATAMENTE como consta no documento, sem inventar respostas.
Mantenha a formatação e numeração original.`,

  quesitosReclamada: `Extraia os "Quesitos da Reclamada" ou "Quesitos da Ré" do documento.
Liste cada quesito numerado EXATAMENTE como consta no documento, sem inventar respostas.
Mantenha a formatação e numeração original.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { laudoId, fieldKey } = await req.json();

    if (!laudoId || !fieldKey) {
      return new Response(
        JSON.stringify({ error: 'laudoId e fieldKey são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch laudo and verify ownership
    const { data: laudo, error: laudoError } = await supabase
      .from('laudos')
      .select('id, user_id, ai_metadata')
      .eq('id', laudoId)
      .single();

    if (laudoError || !laudo) {
      return new Response(
        JSON.stringify({ error: 'Laudo não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (laudo.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PDF path from ai_metadata
    const aiMetadata = laudo.ai_metadata as any;
    const pdfFilePath = aiMetadata?.pdfFilePath;
    const importJobId = aiMetadata?.importJobId;
    const extractedContentPath = aiMetadata?.extracted_content_path;

    if (!pdfFilePath && !importJobId && !extractedContentPath) {
      return new Response(
        JSON.stringify({ error: 'Este laudo não possui um PDF de origem registrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 1: Try to get full text from bucket (most accurate for two-phase extractions)
    if (extractedContentPath) {
      console.log(`[regerar-campo-pdf] Trying bucket content at: ${extractedContentPath}`);
      
      try {
        const extracted = await retrieveExtractedContent(extractedContentPath);
        
        if (extracted?.rawText && extracted.rawText.length > 500) {
          console.log(`[regerar-campo-pdf] Using bucket content (${extracted.rawText.length} chars)`);
          
          // Use smart chunker to get relevant region for this field
          const relevantChunk = getRelevantChunk(extracted.rawText, fieldKey);
          const specificPrompt = getFieldPrompt(fieldKey);
          
          // Get AI config
          const aiConfig = await getAIConfig();
          
          const result = await callAI(
            aiConfig,
            'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.',
            `${specificPrompt}\n\nConteúdo relevante do documento:\n${relevantChunk}`,
            { promptType: `regerar_${fieldKey}` }
          );

          return new Response(
            JSON.stringify({ 
              texto: result.text,
              provider: result.provider,
              model: result.model,
              source: 'bucket_full_text'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (bucketError) {
        console.warn(`[regerar-campo-pdf] Bucket retrieval failed, falling back to cache:`, bucketError);
      }
    }

    // PRIORITY 2 (FALLBACK): Try to get PDF content from import_jobs result if available
    let pdfContent = '';
    
    if (importJobId) {
      const { data: job } = await supabase
        .from('import_jobs')
        .select('result')
        .eq('id', importJobId)
        .single();
      
      if (job?.result) {
        const result = job.result as any;
        // Use textos_brutos if available (raw extracted text)
        if (result.textos_brutos) {
          pdfContent = JSON.stringify(result.textos_brutos);
        } else if (result.extractedText) {
          pdfContent = result.extractedText;
        } else if (result.data) {
          // Fallback: reconstruct context from structured data
          const data = result.data;
          const parts: string[] = [];
          
          // Add processo info
          if (data.processo) {
            parts.push(`PROCESSO: ${data.processo.numero || ''}`);
            parts.push(`Reclamante: ${data.processo.reclamante || ''}`);
            parts.push(`Reclamada: ${data.processo.reclamada || ''}`);
            parts.push(`Vara: ${data.processo.vara || ''}`);
          }
          
          // Add historico
          if (data.historico) {
            if (data.historico.historia_atual) parts.push(`HISTÓRIA ATUAL:\n${data.historico.historia_atual}`);
            if (data.historico.historico_ocupacional) parts.push(`HISTÓRICO OCUPACIONAL:\n${data.historico.historico_ocupacional}`);
            if (data.historico.antecedentes_patologicos) parts.push(`ANTECEDENTES PATOLÓGICOS:\n${data.historico.antecedentes_patologicos}`);
            if (data.historico.tratamentos_realizados) parts.push(`TRATAMENTOS:\n${data.historico.tratamentos_realizados}`);
            if (data.historico.afastamentos) parts.push(`AFASTAMENTOS:\n${data.historico.afastamentos}`);
          }
          
          // Add acidente
          if (data.acidente) {
            if (data.acidente.descricao) parts.push(`HISTÓRIA DO ACIDENTE:\n${data.acidente.descricao}`);
            if (data.acidente.data) parts.push(`Data do acidente: ${data.acidente.data}`);
            if (data.acidente.local) parts.push(`Local: ${data.acidente.local}`);
          }
          
          // Add exame_clinico
          if (data.exame_clinico) {
            if (data.exame_clinico.lesoes_descritas) parts.push(`LESÕES/QUADRO CLÍNICO:\n${data.exame_clinico.lesoes_descritas}`);
            if (data.exame_clinico.exames_complementares) parts.push(`EXAMES COMPLEMENTARES:\n${data.exame_clinico.exames_complementares}`);
            if (data.exame_clinico.laudos_medicos) parts.push(`LAUDOS MÉDICOS:\n${data.exame_clinico.laudos_medicos}`);
          }
          
          // Add informacoes_medicas
          if (data.informacoes_medicas) {
            if (data.informacoes_medicas.cids_mencionados) {
              parts.push(`CIDs MENCIONADOS: ${data.informacoes_medicas.cids_mencionados.join(', ')}`);
            }
            if (data.informacoes_medicas.incapacidade_alegada) {
              parts.push(`INCAPACIDADE ALEGADA: ${data.informacoes_medicas.incapacidade_alegada}`);
            }
            if (data.informacoes_medicas.nexo_sugerido) {
              parts.push(`NEXO SUGERIDO: ${data.informacoes_medicas.nexo_sugerido}`);
            }
          }
          
          // Add quesitos
          if (data.quesitos) {
            if (data.quesitos.juizo) parts.push(`QUESITOS DO JUÍZO:\n${data.quesitos.juizo}`);
            if (data.quesitos.reclamante) parts.push(`QUESITOS DO RECLAMANTE:\n${data.quesitos.reclamante}`);
            if (data.quesitos.reclamada) parts.push(`QUESITOS DA RECLAMADA:\n${data.quesitos.reclamada}`);
          }
          
          // Add resumo if available
          if (data.resumo) parts.push(`RESUMO:\n${data.resumo}`);
          
          // Add resumos_ia if available
          if (result.resumos_ia) {
            if (result.resumos_ia.resumo_peticao) parts.push(`RESUMO PETIÇÃO INICIAL:\n${result.resumos_ia.resumo_peticao}`);
            if (result.resumos_ia.resumo_contestacao) parts.push(`RESUMO CONTESTAÇÃO:\n${result.resumos_ia.resumo_contestacao}`);
            if (result.resumos_ia.descricao_doencas) parts.push(`DESCRIÇÃO TÉCNICA DOENÇAS:\n${result.resumos_ia.descricao_doencas}`);
          }
          
          pdfContent = parts.join('\n\n');
        }
      }
    }

    // If no cached content available, return error (re-extraction from PDF requires Vision which is complex)
    if (!pdfContent) {
      return new Response(
        JSON.stringify({ error: 'Não há dados do PDF em cache. Reimporte o PDF para extrair novamente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use cached content with focused prompt
    const aiConfig = await getAIConfig();
    const fieldPrompt = fieldPrompts[fieldKey] || `Extraia o campo "${fieldKey}" do documento de forma objetiva e técnica.`;

    const result = await callAI(
      aiConfig,
      'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.',
      `${fieldPrompt}\n\nConteúdo do documento:\n${pdfContent}`,
      { promptType: `regerar_${fieldKey}` }
    );

    return new Response(
      JSON.stringify({ 
        texto: result.text,
        provider: result.provider,
        model: result.model
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in regerar-campo-pdf:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
