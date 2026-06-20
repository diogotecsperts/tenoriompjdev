
## Resposta à dúvida (DevPrompts) — sem código

Sim, o **DevPrompts continua sendo a base única e centralizada de todos os prompts** — inclusive do módulo previdenciário novo. Tecnicamente:

- A edge `prev-pre-processar` registra dois prompts no banco via `getPrompt()` (mesmo mecanismo do trabalhista):
  - `prompt_prev_extracao_processo` (extração estruturada do PDF)
  - `prompt_prev_queixa_unificada` (síntese da queixa)
- Esses registros ficam na tabela `system_config` (mesma do trabalhista) com `cardId="previdenciario"`.
- **Por que você não vê no DevPrompts:** a UI do DevPrompts hoje só renderiza cards definidos em `LAUDO_CARDS_STRUCTURE` (trabalhista). Como `previdenciario` não está nessa estrutura, os prompts caem em **"Não classificados"** no final da lista — eles existem, são editáveis, mas ficam escondidos lá embaixo. Eles só aparecem **depois do primeiro processamento de um PDF previdenciário** (é quando são gravados no DB pela primeira vez).
- Nada de prompt do previdenciário está fora do DevPrompts / fora do seu controle. Tudo passa pelo mesmo `prompt-manager`.

Quando você quiser, posso criar um card "Previdenciário" próprio no DevPrompts para organizar visualmente — mas isso é melhoria de UX, não muda a fonte da verdade.

---

## Plano de implementação — Arquivos Originais

### Problema
`DevOriginalFiles` lista apenas `import_jobs` (trabalhista, bucket `processos-pdf`). Os PDFs do novo módulo previdenciário ficam em `prev_pericias.pdf_path` no bucket `prev-pdfs` e nunca aparecem.

### Mudanças

**1. `supabase/functions/dev-list-pdfs/index.ts`** — unificar fontes:
- Manter a query atual em `import_jobs` (módulo trabalhista).
- Adicionar query em `prev_pericias` filtrando `pdf_path IS NOT NULL`, juntando `prev_pautas` para obter cidade/data se útil, e o nome do periciado.
- Retornar lista combinada com novo campo `module: "trabalhista" | "previdenciario"` e `bucket: "processos-pdf" | "prev-pdfs"` em cada item.
- Na listagem de usuários (sem `user_id`), somar contagem das duas tabelas.

**2. `supabase/functions/dev-download-pdf/index.ts`** — aceitar `bucket` opcional no body (default `processos-pdf`) para servir downloads do `prev-pdfs` também.

**3. `src/components/dev-panel/DevOriginalFiles.tsx`**:
- Adicionar coluna **"Módulo"** na tabela (badge: "Trabalhista" / "Previdenciário").
- Passar `bucket` ao chamar `dev-download-pdf`.
- Tipos atualizados (`module`, `bucket`).
- Opcional: filtro/segmento por módulo no topo (só se ficar leve).

### Fora de escopo
- Não mexer no DevPrompts agora (resposta acima esclarece). Se quiser, abrimos um item separado para criar o card "Previdenciário".
- Não migrar PDFs antigos nem alterar buckets.
- Trabalhista intocado.

### Arquivos
- `supabase/functions/dev-list-pdfs/index.ts`
- `supabase/functions/dev-download-pdf/index.ts`
- `src/components/dev-panel/DevOriginalFiles.tsx`
