# Execução: Refactoring "Eliminação de AI Bias" (Plano já Aprovado)

Reapresentando o plano aprovado em formato executável para liberar o modo de escrita. Conteúdo idêntico ao aprovado, com escopo restrito conforme Diretiva de Estabilidade.

## 1. Migration (DB)
```sql
ALTER TABLE public.laudos
  ADD COLUMN IF NOT EXISTS cids_selecionados jsonb NOT NULL DEFAULT '[]'::jsonb;
```
RLS já cobre via policies existentes em `laudos` (filtra por `user_id`). Nenhuma policy nova.

## 2. `supabase/functions/processar-autos/index.ts`
Na lista `summariesToGenerate` (uma única função `gerarResumosIA`), forçar `shouldGenerate: false` em:
- `descricao_doencas`
- `nexo_causal`
- `incapacidade`
- `conclusao`
- `destino_sugerido`

Demais entradas (resumos, quesitos, referências) **inalteradas**. Mapeamento de retorno mantido.

## 3. Nova Edge Function `supabase/functions/gerar-justificativa-medica/index.ts`
- `verify_jwt = true` em `supabase/config.toml`.
- Input: `{ laudoId, campo: 'cid_descricao'|'nexo_causal'|'incapacidade'|'conclusao'|'destino', escolha?, cidsManuais? }`.
- Valida JWT + ownership do laudo.
- Lê estado atual do laudo (campos clínicos + escolhas anteriores).
- Resolve prompt via `getPrompt()` (prompt-manager).
- Chama `callAI()` e retorna `{ texto, provider, model }`.
- Sem dependência de `extracted_content_path` (não é regen do PDF).

## 4. `supabase/functions/seed-prompts/index.ts`
Adicionar 5 prompts novos no objeto principal (não tocar nos existentes):
- `prompt_gen_cid_descricao` (card `analise-tecnica` / `descricao-doencas`)
- `prompt_gen_nexo_justificado` (`analise-tecnica` / `nexo`)
- `prompt_gen_incapacidade_justificada` (`analise-tecnica` / `analise-incapacidade`)
- `prompt_gen_conclusao_amarrada` (`conclusao` / `conclusao`)
- `prompt_gen_destino_decidido` (`conclusao` / `conclusao`)

Diretiva incluída em todos: "Você está REDIGINDO a fundamentação técnica de uma decisão JÁ TOMADA pelo médico-perito. Não questione a escolha. Use a escolha como tese; dados clínicos como evidências de apoio. Sem markdown, sem 'IA', sem inventar dados."

Os 5 prompts antigos de import (`prompt_import_*` correspondentes) continuam no banco (sem deletar) — só param de ser invocados.

## 5. Frontend
- `src/contexts/LaudoContext.tsx`: adicionar `cidsSelecionados: Array<{codigo:string; descricao?:string}>` na interface, defaults, mapeamento DB↔state e save.
- `src/components/laudo/sections/DescricaoTecnicaDoencas.tsx`: persistir CIDs como chips em `cidsSelecionados`; botão envia somente esses CIDs para a nova função (`campo: 'cid_descricao'`); `enableRegenerate={false}`.
- `src/components/laudo/sections/NexoCausal.tsx`: botão "Gerar Justificativa" (habilitado quando `nexoCausalTipo` preenchido) → nova função (`campo: 'nexo_causal'`, `escolha: nexoCausalTipo`); `enableRegenerate={false}`.
- `src/components/laudo/sections/AnaliseIncapacidade.tsx`: botão "Gerar Justificativa" (habilitado quando há tipo selecionado) → nova função (`campo: 'incapacidade'`, `escolha: tipos[]`); `enableRegenerate={false}`.
- `src/components/laudo/sections/Conclusao.tsx`: botão "Gerar Conclusão" → nova função (`campo: 'conclusao'`); opcional segunda chamada (`campo: 'destino'`); `enableRegenerate={false}`.

## 6. Inalterado
`generateLaudoDOCX.ts`, `generateLaudoPDF.ts`, `regerar-campo-pdf`, RLS, autenticação, DevPanel/DevPrompts (os 5 novos aparecem automaticamente após seed).

## 7. Sequência de Deploy
1. Migration `cids_selecionados`
2. Atualizar `seed-prompts` + executar seed
3. Deploy `processar-autos` + `gerar-justificativa-medica`
4. Atualizar `supabase/config.toml`
5. Push frontend (LaudoContext + 4 seções)

Aprovado o plano original; este apenas espelha-o para liberar a execução.
