## Diagnóstico

Verifiquei no banco e nos exporters:

1. **"Para os sintomas referidos, informa uso contínuo de medicações"** → o código (`prev-pre-processar/index.ts`) já tem a instrução para preencher `medicacoes_uso`, **mas a IA não está usando**.
2. **Checkboxes de comorbidades** → o código também já tem o mapeamento (`has`, `dm2`, `dislipidemia`, …) com regra "marcar só quando explícito no processo", **mas chega tudo `false`**.
3. **Exportação DOCX/PDF** → os dois exporters já leem `medicacoes_uso`, `comorbidades_fixas` e `comorbidades_extras` e aplicam o grifo vermelho (#C00000). Estão corretos — o problema é só que chegam vazios.

### Causa raiz

A edge function carrega o prompt do banco (`system_config.id = 'prompt_prev_extracao_processo'`), e não o default do código. Consultei o banco e confirmei que a versão salva lá foi **auto-registrada antes da reestruturação GUIA 23.06** — ela não contém as palavras `medicacoes_uso` nem `comorbidades_fixas`. Resultado: a IA devolve um JSON sem esses campos e o pré-laudo abre vazio.

Os logs reforçam: `[prompt-manager] Prompt carregado do banco: prompt_prev_extracao_processo` (versão antiga, sem as novas chaves).

## Plano de correção (cirúrgico, isolado ao módulo Previdenciário)

### 1. Ressincronizar o prompt no banco (1 migration)
- `UPDATE public.system_config SET value = <DEFAULT_EXTRACTION_PROMPT atual do código>, updated_at = now() WHERE id = 'prompt_prev_extracao_processo';`
- Conteúdo idêntico ao default que já está em `supabase/functions/prev-pre-processar/index.ts` (inclui `medicacoes_uso`, `comorbidades_fixas` com mapeamento dos 12 CIDs, regra de só marcar quando explícito).
- Não toca em `prompt_prev_queixa_unificada` nem `prompt_prev_resumo_exames` — esses já estão corretos.
- Não toca em prompts do Trabalhista.

### 2. Pequeno reforço de defesa no edge function (opcional, mas recomendado)
- Em `prev-pre-processar/index.ts`, após o `JSON.parse`, normalizar `comorbidades_fixas`:
  - se a chave vier ausente, criar objeto vazio;
  - se vier valor não-booleano, converter (`!!`) — evita que strings tipo `"sim"` quebrem os checkboxes.
- Sanitizar `medicacoes_uso` (string, trim, sem markdown).
- Não muda comportamento quando a IA acerta; só protege contra variações futuras.

### 3. Validação
- Reprocessar o PDF atual da perícia aberta.
- Confirmar no editor (Etapa 2):
  - campo "Para os sintomas referidos…" preenchido;
  - checkboxes das comorbidades explícitas no processo marcadas, com possibilidade de o operador alterar livremente (lógica já existente em `Step02Queixa`).
- Exportar DOCX e PDF e conferir:
  - medicações em parágrafo contínuo;
  - comorbidades marcadas listadas em **vermelho** (#C00000), comorbidades extras marcadas idem.

## Garantias de segurança
- Mudança restrita a uma linha do `system_config` (id `prompt_prev_extracao_processo`) + reforço defensivo em uma única edge function.
- Nenhum dado de pré-laudo já salvo é alterado (regra "Zero-Touch / Stale Data Regeneration" preservada — só novos processamentos passam a vir completos).
- Trabalhista, DevPrompts UI, outros prompts e exporters não são tocados.
