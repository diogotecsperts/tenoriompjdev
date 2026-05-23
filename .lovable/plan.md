# Plano Revisado — Fases 5.6 e 5.7 (Execução Imediata) + 5.8 (Diferida)

Correção arquitetural do Gemini incorporada: **reúso total** da Edge Function `gerar-justificativa-medica`, princípio **"Médico Decide / IA Redige"**, e **zero geração automática** de campos críticos na importação.

---

## ESCOPO DE EXECUÇÃO AGORA: Fases 5.6 e 5.7

### Fase 5.6 — Seções Funcionais do Editor Previdenciário

Substituir 100% dos `PlaceholderSection` por componentes reais. Cada campo mapeado a coluna nativa de `laudos` OU chave em `prev_data`.

#### 5.6.1 — `SeguradoSection.tsx`
- **Nativos:** `vitima_nome`, `vitima_nascimento`, `vitima_profissao`, `vitima_escolaridade`, `vitima_dominancia`
- **`prev_data.segurado`:** `rg`, `cpf`, `nit_pis`, `endereco`, `qualidade_segurado` (select), `ultima_atividade`, `data_ultima_contribuicao`
- **Card secundário Benefício** (`prev_data.beneficio`): tipo (B31/B32/B91/B92/BPC-LOAS), `nb_numero`, `der`, `dib`, `dcb`, `motivo_cessacao`

#### 5.6.2 — `HistoriaSection.tsx`
- **Nativos:** `historia_atual`, `antecedentes`, `tratamentos`, `afastamentos`, `historico_ocupacional`
- **`prev_data`:** `historia_clinica_prev`, `historia_laboral_prev`
- Botão "Gerar Resumo" (stub — sem handler ativo)

#### 5.6.3 — `ExameSection.tsx`
- **Nativos:** `exame_fisico`, `exames_complementares`, `laudos_medicos`, `documentos`, `atestados_detalhados`

#### 5.6.4 — `CIDSection.tsx`
- **Nativos:** `cids_selecionados`, `diagnostico_cids`, `descricao_tecnica_doencas`
- Reaproveita `src/lib/cid-data.ts` (leitura)
- Lógica `[DB]` laranja preservada

#### 5.6.5 — `NexoIncapacidadeSection.tsx` (CORE)
- **Médico preenche** (selects/inputs): `existe`, `tipo` (temporária/permanente/indefinida), `grau` (parcial/total), `abrangencia` (uni/multi/omniprofissional), `dii`, `data_recuperacao_estimada`, `susceptivel_reabilitacao`, `necessita_auxilio_terceiros`
- **Textareas de justificativa** (vazios): `dii_justificativa`, `justificativa` geral
- Botão "Gerar Justificativa" ao lado de cada textarea (stub)

#### 5.6.6 — `EnquadramentoSection.tsx`
- **`prev_data.enquadramento`:** `leis_aplicaveis` (multi-select: Lei 8.213/91 art. 42/59/86, LOAS art. 20, Decreto 3.048/99), `fundamentacao` (textarea + botão stub)

#### 5.6.7 — `QuesitosSection.tsx`
- **Nativos:** `quesitos_juizo`, `quesitos_reclamante` (UI: "Quesitos do Autor"), `quesitos_reclamada` (UI: "Quesitos do INSS/Réu")
- Botão "Responder Quesitos" (stub)
- Formatação respeita `quesitos-logic-and-formatting`

#### 5.6.8 — `ConclusaoSection.tsx`
- **Nativos:** `conclusao_analise`, `conclusao_incapacidade`, `conclusao_status`, `conclusao_justificativa`, `conclusao_destino`
- **`prev_data.conclusao_prev`:** síntese específica
- Botão "Gerar Conclusão" (stub)

#### 5.6.9 — `HonorariosSection.tsx`
- **Nativos:** `valor_honorarios`, `local_pericia`, `data_pericia`, `anotacoes`

**Padrão dos botões stub:** `<Button disabled variant="outline" title="Disponível em breve"><Sparkles /> Gerar...</Button>` — visualmente prontos, sem handler.

---

### Fase 5.7 — Exportação DOCX/PDF Previdenciária

#### 5.7.1 — Estrutura Isolada
- Criar `src/lib/previdenciario/export/`:
  - `docx-builder-prev.ts`
  - `pdf-builder-prev.ts`
  - `prev-export-orchestrator.ts`
- **Zero imports** de `src/lib/export/` (Trabalhista)
- Reutiliza apenas utilitários puros: `accentuation-dictionary`, `isFieldEmpty`, `debugField`

#### 5.7.2 — Template Documental
- Cabeçalho: "LAUDO PERICIAL MÉDICO — PERÍCIA PREVIDENCIÁRIA"
- Ordem de seções: Identificação → Benefício Pleiteado → Histórico Clínico/Laboral → Exame Físico → Diagnóstico (CIDs) → **Análise de Incapacidade** → Enquadramento Legal → Conclusão → Quesitos → Honorários
- Compliance total:
  - `laudo-export-compliance-standards`: zero "IA", zero markdown
  - `expert-rigor-standards-v2`: omissão via `isFieldEmpty`
  - `export-text-formatting-standards`: bold → CAPS, quebras de linha em quesitos
  - `laudo-export-docx-specifications`: A4, EMUs em headers

#### 5.7.3 — Integração no Editor
- Dropdown "Exportar" em `PrevidenciarioLaudoEditor.tsx` → DOCX | PDF
- Validação: smoke test com laudo fictício completo + QA visual de todas as páginas

---

## FASE 5.8 — DIFERIDA (revisão pós-validação visual)

**Arquitetura aprovada (Gemini):** "Médico Decide / IA Redige" + reúso de `gerar-justificativa-medica`.

Quando autorizada, a 5.8 fará apenas:

1. **Estender `supabase/functions/gerar-justificativa-medica/index.ts`:**
   - Adicionar novos campos ao `FIELD_TO_PROMPT`:
     - `prev_incapacidade_justificativa` → `prompt_gen_prev_incapacidade`
     - `prev_dii_justificativa` → `prompt_gen_prev_dii`
     - `prev_enquadramento` → `prompt_gen_prev_enquadramento`
     - `prev_conclusao` → `prompt_gen_prev_conclusao`
     - `prev_quesitos_resposta` → `prompt_gen_prev_quesitos`
     - `prev_resumo_historia` → `prompt_gen_prev_historia`
   - Estender `buildContext()` para injetar variáveis `{prev_*}` quando `tipo_laudo === 'previdenciario'`

2. **Inserir 6 prompts em `system_config`** (não-destrutivo, via `supabase--insert`)

3. **Estender `interpolationContext`** em `src/lib/prompt-interpolation/` com bloco `prev` (beneficio, incapacidade, segurado.qualidade) — respeitando `prompt-interpolation-context-mapping`

4. **Ativar handlers nos botões stub** da 5.6 — cada um chama `gerar-justificativa-medica` com `field` e `laudoId`, recebe texto, popula textarea correspondente

5. **Garantias herdadas (sem código novo):**
   - Anti-alucinação (proibir inferir benefício pela profissão)
   - Mínimo 50 chars + diacríticos
   - Logging em `ai_usage_logs` já existente
   - Override por `user_settings.ai_provider/model` já existente

6. **Importação:** CIDs, Nexo, Incapacidade, Conclusão, Enquadramento **nascem vazios**. Apenas `resumo_peticao_inicial` e `resumo_contestacao` podem ser auto-extraídos (respeitando `zero-touch-import-requirement`).

7. **DevPanel:** estender `prompt-coverage-monitoring-and-alerts` para reconhecer prefixo `prev_`.

---

## Garantias Arquiteturais

| Garantia | Mecanismo |
|---|---|
| Zero impacto Trabalhista | Todo código novo em `src/{...}/previdenciario/`. Zero edição em `LaudoContext.tsx`, `LaudoEditor.tsx`, `src/lib/export/`, `src/components/laudo/`. |
| Zero nova Edge Function | 5.8 estende a existente — DRY preservado. |
| Médico Decide / IA Redige | Stubs de 5.6 já assumem esse contrato: textareas vazias + botão ao lado, nunca preenchimento automático no load. |
| Isolamento de dados | `.eq('tipo_laudo', 'previdenciario')` em 100% das leituras/escritas. |
| Zero migrations em 5.6/5.7 | `prev_data` já existe (criado na 5.3). 5.8 usa apenas `INSERT` em `system_config`. |
| Rollback | Excluir pasta `previdenciario/` + 2 rotas + 6 linhas de `system_config` (quando 5.8 for ativada). |

---

## Sequenciamento

1. **Executar agora:** 5.6 + 5.7 em uma única leva → entregar editor visualmente completo + exportadores funcionando
2. **Validação do usuário:** preencher laudo previdenciário real, exportar DOCX + PDF, validar compliance
3. **Aprovar 5.8 separadamente** após validação visual → ativar IA sob demanda

---

## Arquivos a Criar/Editar (5.6 + 5.7)

**Novos (`src/components/previdenciario/sections/`):**
- `SeguradoSection.tsx`, `HistoriaSection.tsx`, `ExameSection.tsx`, `CIDSection.tsx`, `NexoIncapacidadeSection.tsx`, `EnquadramentoSection.tsx`, `QuesitosSection.tsx`, `ConclusaoSection.tsx`, `HonorariosSection.tsx`

**Novos (`src/lib/previdenciario/export/`):**
- `docx-builder-prev.ts`, `pdf-builder-prev.ts`, `prev-export-orchestrator.ts`

**Estendidos:**
- `src/lib/previdenciario/prev-data-defaults.ts` (campos de benefício/enquadramento se faltarem)
- `src/pages/previdenciario/PrevidenciarioLaudoEditor.tsx` (registro de seções + dropdown Exportar)

**NÃO tocados (garantia):**
- Tudo em `src/components/laudo/`, `src/pages/Editor*`, `src/lib/export/`, `src/contexts/LaudoContext.tsx`, `supabase/functions/gerar-justificativa-medica/` (em 5.6/5.7)

---

**Aguardando aprovação** para iniciar execução das Fases 5.6 + 5.7 nesta leva única.
