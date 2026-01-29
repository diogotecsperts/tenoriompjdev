

## Plano: Refinamento Completo dos Prompts de Extração para Máxima Qualidade

### Análise do Problema

A análise revelou a causa raiz das extrações pobres:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROMPT DE IMPORTAÇÃO ATUAL                          │
│                                                                         │
│  → Prompt ÚNICO pedindo 30+ campos                                      │
│  → IA tenta caber tudo em um JSON                                       │
│  → Resultado: resumos de 1-2 linhas por campo                           │
│  → Campos como exameFisico e conclusaoAnalise NÃO mapeados              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     PROMPT DE REGENERAÇÃO                               │
│                                                                         │
│  → Prompt FOCADO em 1 campo                                             │
│  → IA tem liberdade para detalhar                                       │
│  → Resultado: parágrafos completos, estruturados                        │
│  → Usa texto bruto completo do documento                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Campos Identificados Como Problemáticos

| Campo | Problema | Solução |
|-------|----------|---------|
| `historico.historia_atual` | Muito resumido | Instruções explícitas de detalhe |
| `historico.historico_ocupacional` | Muito resumido | Instruções explícitas de detalhe |
| `acidente.descricao` (História do Acidente) | Muito curto | Reforçar extração completa |
| `historico.antecedentes_patologicos` | Preguiçoso | Listar todas condições |
| `historico.tratamentos_realizados` | Preguiçoso | Listar todos tratamentos |
| `historico.afastamentos` | Muito resumido | Incluir datas e motivos |
| `posto_trabalho.descricao_ambiente` | Vazio ou curto | Prioridade máxima |
| `posto_trabalho.descricao_atividades` | Vazio ou curto | Prioridade máxima |
| `exame_clinico.laudos_medicos` | Resumido demais | Estruturar como exemplo dado |
| `exame_clinico.exames_complementares` | Muito curto | Listar cada exame separado |
| `exame_fisico` (NOVO) | NÃO EXISTE no schema | Adicionar ao schema |
| `conclusao_analise` | NÃO MAPEADO | Mapear do resumo de incapacidade |
| `nexo_sugerido` / `tipo_incapacidade` | Não marcando | Corrigir lógica de mapeamento |

---

## Mudanças Propostas

### 1. Backend: Expandir o Schema JSON com Campo `exame_fisico`

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar campo `exame_fisico` dentro de `exame_clinico`:

```json
"exame_clinico": {
  "laudos_medicos": "",
  "exames_complementares": "",
  "lesoes_descritas": "",
  "exame_fisico": ""  // NOVO
}
```

### 2. Backend: Reescrever Instruções do Prompt para Máxima Qualidade

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Substituir as instruções genéricas por instruções DETALHADAS e EXIGENTES:

```text
REGRAS GERAIS DE EXTRAÇÃO:
- NÃO RESUMA. Extraia o máximo de detalhes disponíveis.
- Campos de texto descritivo devem ter NO MÍNIMO 3 parágrafos quando a informação existir.
- Use linguagem técnica médico-legal apropriada para laudos periciais.
- Estruture as informações em tópicos quando apropriado.

INSTRUÇÕES ESPECÍFICAS POR SEÇÃO:

1. VÍTIMA: Dados pessoais completos. "dominancia" = MÃO DOMINANTE (destro/canhoto/ambidestro).

2. PROCESSO: Número completo, vara, nomes das partes exatamente como aparecem.

3. ACIDENTE - EXTRAÇÃO DETALHADA OBRIGATÓRIA:
   - data: Data exata do evento (YYYY-MM-DD)
   - descricao: TRANSCREVA INTEGRALMENTE a descrição do acidente/evento.
     Inclua: circunstâncias, local exato, horário, mecanismo da lesão,
     testemunhas se mencionadas, atendimento inicial, consequências imediatas.
     MÍNIMO 2 parágrafos. NÃO RESUMA.
   - local: Local completo onde ocorreu

4. DOCUMENTOS: Marque true para cada tipo de documento encontrado nos autos.

5. HISTÓRICO - SEÇÃO CRÍTICA, EXTRAIR COM MÁXIMO DETALHE:
   
   5.1. historia_atual (Queixas Atuais / Anamnese):
        Extraia TODAS as queixas relatadas pelo periciando:
        - Sintomas atuais e sua intensidade
        - Localização e irradiação da dor
        - Fatores de melhora e piora
        - Impacto nas atividades diárias e laborais
        - Uso de medicamentos
        - Qualidade do sono, humor, limitações funcionais
        MÍNIMO 3 parágrafos. Não omita nenhuma queixa mencionada.
   
   5.2. historico_ocupacional:
        Liste CRONOLOGICAMENTE todos os empregos:
        - Nome da empresa, período de trabalho
        - Cargo/função exercida
        - Atividades desenvolvidas
        - Exposição a riscos ocupacionais
        - Motivo da saída
        MÍNIMO 2 parágrafos ou lista completa.
   
   5.3. antecedentes_patologicos:
        Liste TODAS as condições de saúde prévias:
        - Doenças crônicas (diabetes, hipertensão, etc.)
        - Cirurgias anteriores (data, tipo, local)
        - Internações hospitalares
        - Uso de medicamentos crônicos
        - Histórico familiar relevante
        - Hábitos (tabagismo, etilismo)
        NÃO deixe vazio se houver QUALQUER menção a saúde prévia.
   
   5.4. tratamentos_realizados:
        Liste TODOS os tratamentos:
        - Medicamentos utilizados (nome, dose, período)
        - Fisioterapia (quantidade de sessões, resultado)
        - Cirurgias realizadas (data, tipo, resultado)
        - Internações (período, motivo)
        - Acompanhamento especializado
        - Resposta aos tratamentos
        ESTRUTURE em lista quando possível.
   
   5.5. afastamentos:
        Liste TODOS os períodos de afastamento:
        - Data de início e término de cada afastamento
        - CID do afastamento se disponível
        - Tipo de benefício (auxílio-doença B31/B91, aposentadoria, etc.)
        - Tempo total afastado
        EXTRAIA DATAS EXATAS quando disponíveis.

6. EXAME CLÍNICO - EXTRAÇÃO COMPLETA:
   
   6.1. laudos_medicos:
        Extraia de CADA laudo/parecer médico:
        - Data do documento
        - Médico/especialidade responsável
        - Diagnósticos (com CID se disponível)
        - Conclusões do médico
        - Recomendações e restrições
        - Limitações apontadas
        ESTRUTURE por documento, não resuma.
   
   6.2. exames_complementares:
        Liste CADA exame separadamente:
        - Tipo de exame (RX, RNM, TC, EMG, etc.)
        - Data de realização
        - Resultado/achados principais
        - Conclusão do laudo
        Ex: "RNM Coluna Lombar (15/03/2023): Protrusão discal L4-L5..."
   
   6.3. lesoes_descritas:
        Todas as lesões mencionadas em documentos médicos.
   
   6.4. exame_fisico (NOVO):
        Se houver descrição de exame físico nos autos, extraia:
        - Estado geral do periciando
        - Inspeção, palpação
        - Testes especiais realizados
        - Amplitude de movimentos
        - Força muscular
        - Alterações neurológicas
        Deixe vazio APENAS se não houver nenhum exame físico descrito.

7. INFORMAÇÕES MÉDICAS - PRIORIDADE MÁXIMA:
   
   7.1. cids_mencionados:
        EXTRAIA ABSOLUTAMENTE TODOS os códigos CID-10 do documento.
        Procure em: laudos, atestados, receitas, CAT, decisões INSS.
        Formato: ["J15.9", "M54.2", "G56.0"]
        NÃO deixe vazio se houver qualquer código CID.
   
   7.2. incapacidade_alegada:
        Descreva o tipo de incapacidade mencionada nos autos.
   
   7.3. nexo_sugerido:
        Retorne "direto", "concausa", "agravamento" ou "" baseado em:
        - Se CAT foi emitida → geralmente sugere nexo direto
        - Se há decisão INSS B91 → nexo reconhecido administrativamente
        - Se laudo médico afirma relação → avaliar o tipo
   
   7.4. tipo_incapacidade:
        Retorne baseado nas evidências:
        - "total_permanente" - se aposentadoria por invalidez ou incapacidade total
        - "total_temporaria" - se afastamento temporário total
        - "parcial_permanente" - se sequelas permanentes mas trabalha
        - "parcial_temporaria" - se limitações temporárias
        - "ausencia" - se laudos indicam capacidade preservada
        - "" - se não há informação suficiente

8. QUESITOS: Copie INTEGRALMENTE cada quesito, numerado, sem alterar.

9. TEXTOS BRUTOS - MUITO IMPORTANTE:
   Copie o MÁXIMO possível da petição inicial e contestação.
   Esses textos são a fonte para geração de resumos detalhados.

10. POSTO DE TRABALHO - CRÍTICO PARA O LAUDO:
    
    10.1. cargo_funcao: Cargo exato exercido
    10.2. data_admissao: YYYY-MM-DD
    10.3. data_afastamento: YYYY-MM-DD
    
    10.4. descricao_ambiente (DETALHAR):
          - Ambiente físico (interno/externo, condições)
          - Equipamentos e máquinas utilizados
          - Mobiliário (mesa, cadeira, altura)
          - Condições ergonômicas
          - Exposição a riscos (ruído, calor, produtos químicos)
          - Uso de EPIs
          MÍNIMO 2 parágrafos se houver informação.
    
    10.5. descricao_atividades (DETALHAR):
          - Tarefas diárias executadas
          - Movimentos repetitivos
          - Esforço físico (peso carregado, frequência)
          - Postura predominante (sentado, em pé, agachado)
          - Jornada de trabalho
          - Pausas durante o trabalho
          - Ritmo e pressão de produção
          MÍNIMO 2 parágrafos se houver informação.

11. RESUMO: Síntese breve do caso (máximo 300 caracteres).
```

### 3. Backend: Atualizar `ensureValidStructure()` para Novo Campo

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar `exame_fisico` no default:

```typescript
exame_clinico: {
  laudos_medicos: "",
  exames_complementares: "",
  lesoes_descritas: "",
  exame_fisico: ""  // NOVO
}
```

### 4. Frontend: Adicionar Mapeamentos Faltantes

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Adicionar no `ExtractedData.exame_clinico`:
```typescript
exame_clinico: {
  laudos_medicos: string;
  exames_complementares: string;
  lesoes_descritas: string;
  exame_fisico: string;  // NOVO
};
```

Adicionar no `laudoData`:
```typescript
// Exame Físico (estava faltando!)
exame_fisico: extractedData.exame_clinico?.exame_fisico || '',

// Análise Conclusiva (mapear do resumo de incapacidade)
conclusao_analise: extractedData.resumos_ia?.incapacidade || '',
```

### 5. Backend: Adicionar Campo ao Prompt de Regeneração

**Arquivo:** `supabase/functions/regerar-campo-pdf/index.ts`

Adicionar prompt específico para `exameFisico`:

```typescript
exameFisico: `Extraia APENAS as informações do "Exame Físico" realizadas no periciando.
Foque em: estado geral, inspeção, palpação, testes especiais ortopédicos/neurológicos, 
amplitude de movimentos, força muscular, reflexos, alterações sensoriais.
Se não houver exame físico descrito no documento, retorne "Exame físico não descrito nos autos."`,

conclusaoAnalise: `Elabore a "Análise Conclusiva" para o laudo pericial com base em todas as informações.
Foque em: síntese do quadro clínico, correlação com as atividades laborais, 
fundamentação técnica para as conclusões sobre nexo e incapacidade.
Use linguagem técnica médico-legal.`,
```

---

## Resumo das Mudanças

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `processar-autos/index.ts` | **Modificar** | Reescrever instruções do prompt principal com exigência de detalhes |
| `processar-autos/index.ts` | **Modificar** | Adicionar `exame_fisico` ao schema JSON e `ensureValidStructure()` |
| `ImportarAutosDialog.tsx` | **Modificar** | Adicionar `exame_fisico` à interface e mapeamento |
| `ImportarAutosDialog.tsx` | **Modificar** | Adicionar mapeamento de `conclusao_analise` |
| `regerar-campo-pdf/index.ts` | **Modificar** | Adicionar prompts para `exameFisico` e `conclusaoAnalise` |

---

## Proteção da Infraestrutura

1. **Apenas instruções do prompt são alteradas** - a lógica de processamento permanece idêntica
2. **Schema é expandido, não substituído** - retrocompatibilidade garantida
3. **Mapeamentos usam operador `||`** - campos undefined não causam erro
4. **Nenhuma mudança em callAI, callPDFProvider ou fluxo de processamento**

---

## Resultado Esperado

| Campo | Antes | Depois |
|-------|-------|--------|
| História do Acidente | 1-2 linhas | 2+ parágrafos com detalhes |
| Histórico Ocupacional | Resumido | Lista cronológica completa |
| História Atual (Anamnese) | Muito curto | 3+ parágrafos de queixas |
| Antecedentes | Preguiçoso | Lista completa de condições |
| Tratamentos | Resumido | Lista estruturada |
| Afastamentos | Incompleto | Datas e benefícios |
| Posto de Trabalho | Vazio | 2+ parágrafos descritivos |
| Atividades Laborais | Vazio | 2+ parágrafos descritivos |
| Laudos Médicos | Resumido | Estruturado por documento |
| Exames Complementares | 1 linha | Lista de cada exame |
| Exame Físico | VAZIO (sem campo) | Preenchido se disponível |
| Conclusão Análise | VAZIO | Preenchido do resumo de incapacidade |
| Nexo/Incapacidade | Não marcados | Marcados automaticamente |

