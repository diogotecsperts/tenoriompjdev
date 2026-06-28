
# Pré-Laudo Previdenciário — Reestruturação total (GUIA 23.06)

Escopo 100% isolado no módulo Previdenciário. Nada toca o Trabalhista.

## 1. Estrutura final do pré-laudo

**Cabeçalho fixo do processo** (novo, fora dos steps), logo abaixo do título "PRÉ-LAUDO PERICIAL PREVIDENCIÁRIO" no editor e no topo do DOCX/PDF exportado:
- Nº do processo · Vara · Comarca · Data da perícia · Benefício pleiteado.

**Etapas que ficam — apenas 4:**
1. Identificação
2. Queixa principal (incorpora medicações + comorbidades)
3. Exame físico (texto fixo + radios de incapacidade)
4. Resumo (extração de exames pela IA, somente leitura)

**Etapas que desaparecem do fluxo:** Medicação em uso, Acompanhamento, Comorbidades, Estado mental, Ectoscopia, Exame ortopédico, CID-10, Conclusão. Os IDs antigos permanecem no tipo `PrelaudoData` (não apago do schema para não quebrar pré-laudos já salvos), mas saem da navegação, do editor e da exportação.

## 2. Etapa 1 — Identificação

- **Estado Civil:** select fixo (União Estável, Solteiro(a), Casado(a), Divorciado(a), Viúvo(a), Não Informado, Outros). Ao escolher **Outros**, abre input livre adicional (`estado_civil_outros`).
- **Escolaridade:** select fixo (Analfabeto, Fund. Incompleto/Completo, Médio Incompleto/Completo, Superior Incompleto/Completo, Outros). Ao escolher **Outros**, abre input livre (`escolaridade_outros`).
- **Profissão:** texto livre (IA preenche).
- **Tempo sem trabalhar:** **100% manual** (IA deixa de preencher).
- **Pessoas sob o mesmo teto:** IA preenche **somente em BPC/LOAS** (detecta via `beneficio_pleiteado`); fora disso, fica vazio. Sempre editável.
- Remove daqui os campos de processo (movidos para o cabeçalho fixo).

## 3. Etapa 2 — Queixa principal (expandida)

Estrutura na ordem:
1. Bloco existente da queixa unificada (IA) — **inalterado**.
2. Título fixo: **"Para os sintomas referidos, informa uso contínuo de medicações:"** + textarea editável (IA preenche `medicacoes_uso`).
3. Parágrafo fixo, sem campo: **"Relata acompanhamento médico e realização regular de fisioterapia."**
4. Título fixo: **"Informa demais comorbidades:"** com 12 checkboxes fixos (HAS, DM2, Dislipidemia, Hipotireoidismo, Ansiedade, Depressão, Fibromialgia, Obesidade, Cardiopatia, DPOC, IRC, Artrite reumatoide) — IA marca automaticamente as que detectar no PDF, usuário pode alterar.
5. Lista de comorbidades extras: cada item = checkbox + input livre + botão remover. Botão **"Adicionar"** cria novas linhas. A primeira linha vazia já vem pronta para o usuário marcar e digitar.

UI sem grifo vermelho (basta o checkbox marcado). O **grifo vermelho aparece somente no DOCX/PDF exportado**.

## 4. Etapa 3 — Exame físico (novo, fixo)

100% texto fixo, sem IA, sem edição, com os parágrafos exatos do guia:
- Exame do Estado Mental.
- Exame Físico Geral / Ectoscopia.
- Inspeção Dinâmica.
- Complementação.

Únicos campos interativos:
- **Incapacidade para função habitual:** radio (Não há / Temporária já cessada / Temporária ainda presente / Permanente).
- **Incapacidade para vida independente:** radio (mesmas 4 opções).

## 5. Etapa 4 — Resumo (nova, IA, somente leitura)

Campo grande mostrando os blocos de extração de exames gerados pela IA, **não editável**.

**Adaptação do prompt do cliente ao nosso fluxo:** mantenho integralmente as regras de extração, campos obrigatórios, formato do bloco "EXTRAÇÃO DO LAUDO" e o "Trecho pronto para inserir no laudo pericial". O que muda é só o veículo de entrada — em vez de receber uma imagem por vez, a IA recebe o texto OCR completo do PDF (já produzido pelo Mistral na etapa atual de processamento), identifica cada laudo de exame distinto (US, TC, RX, RM, ENMG) presente no processo, e gera **um bloco por exame**, concatenados em ordem cronológica no campo Resumo. Regras anti-invenção, "[ilegível]", "não identificada", separação por exame e proibições (sem diagnóstico, sem conduta, sem nexo, sem incapacidade) ficam idênticas ao prompt original.

Prompt registrado como `prompt_prev_resumo_exames` no `system_config` (editável no DevPrompts, como os demais).

## 6. Exportação DOCX e PDF

- Cabeçalho do processo no topo do documento (igual ao editor).
- **Sem títulos/subtítulos visíveis** — texto corrido contínuo, em tom de continuação.
- Comorbidades marcadas exibidas **em vermelho** dentro do parágrafo "Informa demais comorbidades: …".
- Etapa 3 sai como os 4 parágrafos fixos seguidos das duas frases de incapacidade ("Apresenta incapacidade para sua função habitual: temporária ainda presente." etc.).
- Etapa 4 sai com os blocos da IA já no formato do prompt (mantendo a estética de "EXTRAÇÃO DO LAUDO" do guia, mas sem markdown).
- Campos "Outros" (estado civil/escolaridade) exportam o texto livre digitado, não a palavra "Outros".
- `ExportStepsSelector` atualizado para as 4 etapas reais.

## 7. Backend (`prev-pre-processar`)

Após a unificação da queixa, dois ajustes:
- Extração estendida para popular: `medicacoes_uso` (texto), `comorbidades_fixas` (12 booleanos), `pessoas_mesmo_teto` só quando `beneficio_pleiteado` for BPC/LOAS, e remoção do pré-preenchimento de `tempo_sem_trabalhar`.
- Nova chamada LLM final usando `prompt_prev_resumo_exames` sobre o OCR completo (com `trimOcrPreservingTail` já existente), gerando o texto consolidado dos exames e gravando em `extracao.resumo_exames`.

`mergeFromExtracao` passa a popular: queixa.medicacoes_uso, queixa.comorbidades_fixas, resumo.texto, identificacao.pessoas_mesmo_teto (condicional). Tempo_sem_trabalhar é removido do merge.

## Detalhes técnicos

**Schemas (`prelaudo-structure.ts`)**
- `IdentificacaoData`: adicionar `estado_civil_outros`, `escolaridade_outros`. Manter campos de processo (consumidos pelo cabeçalho).
- `QueixaData`: adicionar `medicacoes_uso: string`, `comorbidades_fixas: Record<ComorbidadeKey, boolean>`, `comorbidades_extras: Array<{ marcado: boolean; texto: string }>`.
- Novo `ExameFisicoData`: `incap_funcao_habitual`, `incap_vida_independente`.
- Novo `ResumoData`: `texto: string`.
- `PRELAUDO_STEPS` reduzido a 4 itens (`identificacao`, `queixa`, `exame_fisico`, `resumo`). IDs antigos ficam no tipo apenas para retrocompat.

**Componentes novos/alterados**
- `components/ProcessoHeader.tsx` (novo): bloco editável no topo do `PrelaudoEditor`.
- `Step01Identificacao.tsx`: remover telefone/endereço/processo, trocar campos por selects fixos com Popover "Outros".
- `Step02Queixa.tsx`: bloco IA + 3 blocos novos (medicações, parágrafo fixo, comorbidades com checkboxes + extras).
- `Step03ExameFisico.tsx` (novo): substitui `Step03Medicacao.tsx` na navegação.
- `Step04Resumo.tsx` (novo): textarea desabilitada exibindo `resumo.texto`.
- Arquivos `Step05..Step10` deixam de ser referenciados (não excluo para não criar regressão de build em outras telas).
- `StepNav.tsx`: passa a iterar sobre os 4 steps.
- `ExportStepsSelector.tsx`: lista reduzida a 4 IDs; localStorage migra automaticamente (filtro já descarta IDs inválidos).

**Exportadores (`prelaudo-pdf.ts` e `prelaudo-docx.ts`)**
- Renderização em parágrafos corridos (sem `H1/H2` visíveis).
- Cabeçalho de processo no topo.
- Helper para frase de comorbidades com runs em vermelho (`color: "C00000"` no DOCX; `setTextColor` no jsPDF).
- Mapeamento de radios de incapacidade para frase pronta.

**Edge function `prev-pre-processar`**
- Atualizar `EXTRACAO_PROMPT` para pedir os novos campos (medicações, comorbidades_fixas como objeto booleano).
- Detectar BPC/LOAS via regex no `beneficio_pleiteado` antes de aceitar `pessoas_mesmo_teto`.
- Remover `tempo_sem_trabalhar` do schema esperado.
- Adicionar terceira chamada LLM (`prompt_prev_resumo_exames`) reutilizando o cliente Lovable AI e o mesmo OCR; gravar resultado em `prev_extracao.dados.resumo_exames`.
- Registrar o prompt via `system_config` (seed em runtime se ausente, como já fazemos para `prompt_prev_queixa_unificada`).

**Registro no DevPrompts**
- Adicionar `prompt_prev_resumo_exames` ao `prev-prompts-structure.ts` para aparecer corretamente sob o filtro Previdenciário.
