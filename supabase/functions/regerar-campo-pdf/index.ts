import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, callAI } from "../_shared/ai-config.ts";
import { retrieveExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk } from "../_shared/smart-chunker.ts";
import { getPrompt } from "../_shared/prompt-manager.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de campos para IDs de prompt e metadados
const fieldPromptMapping: Record<string, { promptId: string; cardId: string; sectionId: string; description: string }> = {
  historiaAtual: { promptId: 'prompt_regen_historiaAtual', cardId: 'periciando', sectionId: 'anamnese', description: 'História da Moléstia Atual - Regenerar via PDF' },
  historicoOcupacional: { promptId: 'prompt_regen_historicoOcupacional', cardId: 'periciando', sectionId: 'acidente', description: 'Histórico Ocupacional - Regerar via PDF' },
  historiaAcidente: { promptId: 'prompt_regen_historiaAcidente', cardId: 'periciando', sectionId: 'acidente', description: 'História do acidente - Regenerar via PDF' },
  antecedentes: { promptId: 'prompt_regen_antecedentes', cardId: 'periciando', sectionId: 'antecedentes', description: 'Antecedentes Pessoais e Familiares - Regenerar via PDF' },
  tratamentos: { promptId: 'prompt_regen_tratamentos', cardId: 'periciando', sectionId: 'antecedentes', description: 'Tratamentos realizados - Regenerar via PDF' },
  afastamentos: { promptId: 'prompt_regen_afastamentos', cardId: 'periciando', sectionId: 'antecedentes', description: 'Afastamentos do Trabalho - Regenerar via PDF' },
  laudosMedicos: { promptId: 'prompt_regen_laudosMedicos', cardId: 'exame', sectionId: 'laudos', description: 'Descrição dos Laudos Médicos - Regenerar via PDF' },
  examesComplementares: { promptId: 'prompt_regen_examesComplementares', cardId: 'exame', sectionId: 'exames', description: 'Descrição dos Exames Complementares - Regenerar via PDF' },
  exameFisico: { promptId: 'prompt_regen_exameFisico', cardId: 'exame', sectionId: 'exame-fisico', description: 'Achados do Exame Físico - Regenerar via PDF' },
  // Campo descricaoPostoTrabalho foi removido - campo unificado é descricaoAtividadesLaborais
  descricaoAtividadesLaborais: { promptId: 'prompt_regen_descricaoAtividadesLaborais', cardId: 'posto-trabalho', sectionId: 'dados-posto', description: 'Ambiente e atividades laborais - Regenerar via PDF' },
  descricaoTecnicaDoencas: { promptId: 'prompt_regen_descricaoTecnicaDoencas', cardId: 'analise-tecnica', sectionId: 'descricao-doencas', description: 'Descrição técnica das doenças - Regenerar via PDF' },
  conclusaoAnalise: { promptId: 'prompt_regen_conclusaoAnalise', cardId: 'conclusao', sectionId: 'conclusao', description: 'Análise conclusiva - Regenerar via PDF' },
  tabelaSUSEP: { promptId: 'prompt_regen_tabelaSUSEP', cardId: 'conclusao', sectionId: 'sequelas', description: 'Tabela SUSEP - Regenerar via PDF' },
  danoEstetico: { promptId: 'prompt_regen_danoEstetico', cardId: 'conclusao', sectionId: 'sequelas', description: 'Dano estético - Regenerar via PDF' },
  auxilioTerceiros: { promptId: 'prompt_regen_auxilioTerceiros', cardId: 'conclusao', sectionId: 'sequelas', description: 'Necessidade de Auxílio de Terceiros - Regenerar via PDF' },
  quesitosJuizo: { promptId: 'prompt_regen_quesitosJuizo', cardId: 'conclusao', sectionId: 'quesitos', description: 'Quesitos do juízo - Regenerar via PDF' },
  quesitosReclamante: { promptId: 'prompt_regen_quesitosReclamante', cardId: 'conclusao', sectionId: 'quesitos', description: 'Quesitos do reclamante - Regenerar via PDF' },
  quesitosReclamada: { promptId: 'prompt_regen_quesitosReclamada', cardId: 'conclusao', sectionId: 'quesitos', description: 'Quesitos da reclamada - Regenerar via PDF' },
  resumoPeticaoInicial: { promptId: 'prompt_regen_resumoPeticaoInicial', cardId: 'resumo-autos', sectionId: 'resumo', description: 'Resumo da petição inicial - Regenerar via PDF' },
  resumoContestacao: { promptId: 'prompt_regen_resumoContestacao', cardId: 'resumo-autos', sectionId: 'resumo', description: 'Resumo da contestação - Regenerar via PDF' }
};

// Field-specific prompts for regeneration - DETAILED for maximum quality (fallback)
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

  // NOTA: descricaoPostoTrabalho foi REMOVIDO - campo unificado em descricaoAtividadesLaborais

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

  tabelaSUSEP: `Extraia informações para avaliação pela "Tabela SUSEP/DPVAT" de invalidez permanente.

BUSQUE NOS AUTOS:
- Percentuais de invalidez mencionados em laudos médicos ou perícias anteriores
- Referências específicas à Tabela SUSEP, DPVAT ou outras tabelas de invalidez
- Item da tabela aplicável às lesões/sequelas identificadas
- Grau de comprometimento funcional ou anatômico documentado
- Decisões do INSS sobre grau de invalidez (B91, aposentadoria por invalidez)
- Laudos periciais anteriores que quantificaram sequelas

ESTRUTURE A RESPOSTA:
Se encontrar informações, formate assim:
"[X%] de invalidez permanente conforme item [Y] da Tabela SUSEP/DPVAT
Sequela: [descrição da lesão/sequela]
Fundamentação: [fonte da informação - laudo de Dr. X, perícia do INSS, etc.]"

Se não houver menção a percentuais de invalidez, retorne:
"Não foram identificados nos autos documentos que quantifiquem o grau de invalidez permanente segundo a Tabela SUSEP/DPVAT."`,

  danoEstetico: `Extraia informações sobre "Dano Estético" do documento.

BUSQUE NOS AUTOS:
- Cicatrizes visíveis: localização anatômica, dimensões aproximadas, características (hipertrófica, queloidiana, hiperpigmentada)
- Deformidades permanentes: tipo (angular, rotacional), gravidade, visibilidade
- Amputações ou perdas anatômicas: nível, membro afetado
- Alterações de marcha ou postura permanentes e visíveis
- Assimetrias corporais resultantes de lesões
- Fotos anexadas aos autos que documentem o dano

CLASSIFICAÇÃO DO DANO ESTÉTICO (se mencionada ou possível inferir):
- Leve: cicatrizes discretas, pouco visíveis, em áreas normalmente cobertas
- Moderado: cicatrizes visíveis em áreas expostas, pequenas deformidades
- Grave: deformidades significativas, cicatrizes extensas, alterações funcionais visíveis
- Gravíssimo: grandes deformidades, amputações, desfiguramento

ESTRUTURE A RESPOSTA:
Descreva objetivamente os achados estéticos documentados, a localização, e se possível classifique a gravidade.

Se não houver menção a dano estético, retorne:
"Não foram identificados nos autos documentos que descrevam dano estético decorrente das lesões."`,

  auxilioTerceiros: `Extraia informações sobre "Necessidade de Auxílio de Terceiros" do documento.

BUSQUE NOS AUTOS:
- Se o periciando necessita de ajuda para Atividades da Vida Diária (AVDs):
  * Alimentar-se (cortar alimentos, levar à boca)
  * Vestir-se e despir-se
  * Higiene pessoal (banho, uso do banheiro)
  * Locomoção dentro e fora de casa
- Se necessita de cuidador permanente ou intermitente
- Tipo de auxílio necessário e frequência (24 horas, apenas para certas atividades)
- Laudos médicos, de assistente social ou perícias que atestem a necessidade
- Prescrição médica de acompanhante ou cuidador

ESTRUTURE A RESPOSTA:
Descreva as limitações funcionais que demandam auxílio, as atividades para as quais necessita de ajuda, 
o tipo de cuidador necessário (familiar, profissional), e a fonte documental da informação.

Se não houver menção a necessidade de auxílio, retorne:
"Não foram identificados nos autos documentos que indiquem necessidade de auxílio permanente de terceiros para atividades da vida diária."`,

  quesitosJuizo: `Extraia INTEGRALMENTE os "Quesitos do Juízo" do documento.

Os quesitos do Juízo são perguntas técnicas formuladas pelo Juiz para o perito responder.

ONDE BUSCAR:
- Despachos judiciais (busque por "O perito deverá responder...", "Quesitos do MM. Juízo")
- Decisões que nomeiam o perito
- Atas de audiência com determinação de quesitos
- Intimações do perito

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)
- NÃO altere o texto - transcreva literalmente
- Inclua todos os sub-quesitos se houver (Ex: 1.1, 1.2, 2.a, 2.b)
- Preserve a ordem original dos quesitos

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Juízo, retorne: "Quesitos do Juízo não identificados nos autos."`,

  quesitosReclamante: `Extraia INTEGRALMENTE os "Quesitos do Reclamante" (ou do Autor) do documento.

Os quesitos do Reclamante são perguntas formuladas pelo advogado da parte autora.

ONDE BUSCAR:
- Petição inicial (geralmente ao final)
- Petição específica de quesitos do reclamante
- Rol de quesitos anexado aos autos
- Emendas à inicial com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos (Ex: 3.1, 3.2, 3.a, 3.b)
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Reclamante, retorne: "Quesitos do Reclamante não identificados nos autos."`,

  quesitosReclamada: `Extraia INTEGRALMENTE os "Quesitos da Reclamada" (ou da Ré) do documento.

Os quesitos da Reclamada são perguntas formuladas pelo advogado da parte ré/empresa.

ONDE BUSCAR:
- Contestação (geralmente ao final)
- Petição específica de quesitos da reclamada
- Rol de quesitos anexado aos autos
- Réplica ou outras manifestações com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos da Reclamada, retorne: "Quesitos da Reclamada não identificados nos autos."`,
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

    // Fetch laudo with ALL fields for cross-field context (dependências cruzadas)
    const { data: laudo, error: laudoError } = await supabase
      .from('laudos')
      .select(`
        id, user_id, ai_metadata,
        diagnostico_cids,
        descricao_posto_trabalho,
        descricao_atividades_laborais,
        historico_ocupacional,
        historia_acidente,
        historia_atual,
        exame_fisico,
        exames_complementares,
        antecedentes,
        tratamentos,
        afastamentos,
        nexo_causal_justificativa,
        nexo_causal_tipo,
        conclusao_analise,
        conclusao_incapacidade,
        laudos_medicos,
        tabela_susep,
        dano_estetico,
        auxilio_terceiros,
        analise_incapacidade_laboral
      `)
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

    // Build context from laudo fields for variable interpolation
    const laudoContext = {
      cids: JSON.stringify(laudo.diagnostico_cids || []),
      postoTrabalho: laudo.descricao_posto_trabalho || '',
      atividadesLaborais: laudo.descricao_atividades_laborais || '',
      historicoOcupacional: laudo.historico_ocupacional || '',
      historiaAcidente: laudo.historia_acidente || '',
      historiaAtual: laudo.historia_atual || '',
      exameFisico: laudo.exame_fisico || '',
      examesComplementares: laudo.exames_complementares || '',
      antecedentes: laudo.antecedentes || '',
      tratamentos: laudo.tratamentos || '',
      afastamentos: laudo.afastamentos || '',
      nexoCausal: laudo.nexo_causal_justificativa || '',
      nexoCausalTipo: laudo.nexo_causal_tipo || '',
      conclusao: laudo.conclusao_analise || '',
      conclusaoIncapacidade: laudo.conclusao_incapacidade || '',
      laudosMedicos: laudo.laudos_medicos || '',
      tabelaSUSEP: laudo.tabela_susep || '',
      danoEstetico: laudo.dano_estetico || '',
      auxilioTerceiros: laudo.auxilio_terceiros || '',
      analiseIncapacidade: laudo.analise_incapacidade_laboral || ''
    };

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
          
          // Buscar prompt via prompt-manager
          const mapping = fieldPromptMapping[fieldKey];
          const defaultPrompt = fieldPrompts[fieldKey] || `Extraia o campo "${fieldKey}" do documento de forma objetiva e técnica.`;
          
          const specificPrompt = await getPrompt(
            mapping?.promptId || `prompt_regen_${fieldKey}`,
            defaultPrompt,
            laudoContext,
            {
              autoRegister: true,
              description: mapping?.description || `Regenerar campo ${fieldKey} via PDF`,
              cardId: mapping?.cardId || '_unclassified',
              sectionId: mapping?.sectionId || '_unclassified'
            }
          );
          
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
    
    // Buscar prompt via prompt-manager
    const mapping = fieldPromptMapping[fieldKey];
    const defaultPrompt = fieldPrompts[fieldKey] || `Extraia o campo "${fieldKey}" do documento de forma objetiva e técnica.`;
    
    const fieldPrompt = await getPrompt(
      mapping?.promptId || `prompt_regen_${fieldKey}`,
      defaultPrompt,
      laudoContext,
      {
        autoRegister: true,
        description: mapping?.description || `Regenerar campo ${fieldKey} via PDF`,
        cardId: mapping?.cardId || '_unclassified',
        sectionId: mapping?.sectionId || '_unclassified'
      }
    );

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
