## Ajustes pontuais — Resumo de exames + Escolaridade

### 1) Remover o rótulo "EXTRAÇÃO DO LAUDO" do resumo de exames

**Onde:** `supabase/functions/prev-pre-processar/index.ts` (prompt `prompt_prev_resumo_exames` + sanitizador) e sync no banco (`system_config`).

**O que muda:**
- Atualizar o `DEFAULT_RESUMO_PROMPT` e o `RESUMO_SYSTEM_PROMPT` para que cada bloco comece direto pelo cabeçalho útil:
  `"[TIPO DO EXAME] ([SEGMENTO se houver]) — [DATA AAAA-MM-DD ou 'data não informada']"`
  (sem o prefixo `EXTRAÇÃO DO LAUDO — `).
- Reforçar no `sanitizeResumo` uma limpeza defensiva: regex no início de cada bloco para remover qualquer ocorrência remanescente de `^EXTRAÇÃO DO LAUDO\s*[—-]\s*` (cobre exames já gerados/retornos antigos da IA).
- Rodar `UPDATE system_config` em `prompt_prev_resumo_exames` para refletir o novo texto (mantém DevPrompts em sincronia).

**Não muda:** o restante do bloco (linhas `Achados:` e `Impressão diagnóstica do laudo:`) permanece exatamente igual; ordenação por data e separação por linha em branco também.

### 2) Escolaridade: extrair via IA e marcar corretamente no documento

**Diagnóstico:** o prompt no DB já instrui a IA a usar um dos 7 valores fixos, mas se a IA devolver com variação (capitalização, "Médio completo", "2º grau completo", etc.), o valor não bate exatamente com `ESCOLARIDADE_OPCOES`. Resultado: o `<Select>` fica vazio no editor e o `buildOptionRows` no PDF/DOCX não marca nenhuma linha. O mesmo risco existe para `estado_civil`.

**O que muda — `src/modules/previdenciario/lib/prelaudo-structure.ts`:**
- Adicionar dois normalizadores puros (`normalizeEscolaridade`, `normalizeEstadoCivil`) que recebem a string crua da IA e devolvem:
  - o valor exato de `ESCOLARIDADE_OPCOES` / `ESTADO_CIVIL_OPCOES` quando reconhecido (case-insensitive, sem acentos, com sinônimos: "1º grau" → "Ensino fundamental", "2º grau" → "Ensino médio", "superior" → "Ensino superior", "completo/incompleto" preservado; "solteiro/casado/viúvo/divorciado/união estável" para estado civil);
  - `"Outros"` + preencher `escolaridade_outros` / `estado_civil_outros` com o texto original quando não reconhecido;
  - string vazia quando a IA não trouxe nada.
- Em `mergeFromExtracao`, trocar o `fill` direto pelos normalizadores nas duas linhas correspondentes.

**O que muda — `supabase/functions/prev-pre-processar/index.ts`:**
- Reforçar no prompt (`DEFAULT_EXTRACTION_PROMPT`) que a IA deve preencher escolaridade sempre que houver QUALQUER menção (carteira, qualificação, anamnese, depoimento), mapeando sinônimos comuns para os 7 rótulos fixos. Sincronizar no `system_config`.

**Resultado esperado:** mesmo que a IA devolva "ensino médio completo" minúsculo ou "2º grau completo", o editor exibe o rádio/select correto e o PDF/DOCX marca `(X)` na linha certa. Se for algo realmente fora do padrão, cai em "Outros" com o texto original preservado.

### Escopo isolado
Mudanças contidas no módulo Previdenciário (`src/modules/previdenciario/**`) e na edge function `prev-pre-processar`. Nenhum arquivo do Trabalhista ou de utilitários compartilhados é tocado.