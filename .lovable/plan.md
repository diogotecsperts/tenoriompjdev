## Ajustes Step 1 (Identificação) + painel lateral

### 1. Novos campos extraídos pela IA

**`prelaudo-structure.ts` — `IdentificacaoData`:** adicionar
- `tempo_sem_trabalhar: string`
- `pessoas_mesmo_teto: string`

Em `mergeFromExtracao`, adicionar dois `fill()`:
- `fill(base.identificacao, "tempo_sem_trabalhar", ident.tempo_sem_trabalhar)`
- `fill(base.identificacao, "pessoas_mesmo_teto", ident.pessoas_mesmo_teto)`

**`supabase/functions/prev-pre-processar/index.ts` — prompt de extração:** acrescentar ao schema JSON solicitado à IA os dois campos novos em `identificacao`, com instruções curtas:
- `tempo_sem_trabalhar`: tempo afastado do trabalho conforme relato/documentos (texto livre, ex.: "8 meses", "desde 03/2024"). Vazio se não houver menção.
- `pessoas_mesmo_teto`: nº de pessoas que residem com o periciado (texto livre, ex.: "3 pessoas: esposa e dois filhos"). Vazio se não houver menção.
Regras anti-alucinação mantidas (não inventar).

### 2. Escolaridade — IA + botão "Editar" com lista padrão

**`Step01Identificacao.tsx`:**
- Manter o `Input` de `escolaridade` (continua mostrando o valor da IA editável).
- Adicionar pequeno botão ícone "lápis" (`Pencil` do lucide) ao lado direito do campo. Ao clicar, abre um `Popover` (shadcn já no projeto) com uma lista clicável de opções padrão:
  - Analfabeto
  - Ensino fundamental incompleto
  - Ensino fundamental completo
  - Ensino médio incompleto
  - Ensino médio completo
  - Ensino superior incompleto
  - Ensino superior completo
  - Pós-graduação
  - Mestrado
  - Doutorado
- Selecionar uma opção sobrescreve `escolaridade` com o texto exato.
- Texto da IA continua tendo prioridade no carregamento (já é assim, pois o popover só age sob clique).

Os dois campos novos serão renderizados em "Dados pessoais" (ou em "Atividade laboral" para `tempo_sem_trabalhar`):
- `Tempo sem trabalhar` → "Atividade laboral"
- `Pessoas que vivem sob o mesmo teto` → "Dados pessoais"

### 3. Correção do scroll do painel lateral

Problema: em `PainelLateralProcesso.tsx`, o container de rolagem usa `max-h-[calc(100vh-8rem)]`, valor arbitrário que não acompanha a altura real do flex pai (o editor está dentro de `h-[calc(100vh-4rem)]` e tem header próprio). Resultado: corta o conteúdo antes do fim.

**Fix seguro e mínimo:**
- `aside`: adicionar `flex flex-col h-full` (herda a altura do flex row pai, que já é controlada).
- Container interno de conteúdo: trocar `max-h-[calc(100vh-8rem)] overflow-y-auto` por `flex-1 min-h-0 overflow-y-auto` (padrão flexbox para rolagem confiável dentro de pai com altura definida).
- Header do painel permanece fixo no topo via flex column.

Sem mexer no layout do `PrelaudoEditor` (o flex já está correto).

### Arquivos alterados

- `src/modules/previdenciario/lib/prelaudo-structure.ts` — 2 campos no tipo + 2 `fill()`.
- `src/modules/previdenciario/components/steps/Step01Identificacao.tsx` — 2 inputs novos + botão `Editar` (Popover) na escolaridade.
- `src/modules/previdenciario/components/PainelLateralProcesso.tsx` — correção de altura do scroll + exibir os 2 novos campos em "Identificação".
- `supabase/functions/prev-pre-processar/index.ts` — adicionar `tempo_sem_trabalhar` e `pessoas_mesmo_teto` ao prompt/schema da extração.

### Não tocados

- Módulo Trabalhista, schema do banco (jsonb tolerante), export PDF/DOCX, Step 2, demais steps, prompt unificado da queixa.

### Validação

1. PDF processado → "Tempo sem trabalhar" e "Pessoas sob mesmo teto" aparecem preenchidos quando o processo mencionar.
2. Botão lápis ao lado de Escolaridade abre lista; clicar substitui o valor.
3. Painel lateral rola até o último item (testar com perícia com muitos documentos).
4. Perícias antigas abrem sem erro (campos novos vazios).

### Fora de escopo

- Reprocessar perícias antigas.
- Adicionar mais opções de escolaridade dinâmicas pelo DevPanel.
