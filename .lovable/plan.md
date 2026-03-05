

# Plano: Geração de Quesitos Sob Demanda

## Resumo

Desativar a geração automática de quesitos na importação e criar um fluxo on-demand onde o médico clica um botão após preencher o laudo. A IA lê o PDF para encontrar as perguntas e responde usando exclusivamente os dados clínicos do formulário.

---

## 1. Backend — Desativar Geração na Importação

### `supabase/functions/processar-autos/index.ts`

**Linhas 1328-1330** — Mudar `shouldGenerate: true` para `shouldGenerate: false`:
```typescript
{ tipo: 'quesitos_juizo', shouldGenerate: false, step: 'Respondendo quesitos do Juízo...', progress: 86 },
{ tipo: 'quesitos_reclamante', shouldGenerate: false, step: 'Respondendo quesitos do Reclamante...', progress: 88 },
{ tipo: 'quesitos_reclamada', shouldGenerate: false, step: 'Respondendo quesitos da Reclamada...', progress: 90 },
```

**Linhas 1787-1796** — Remover bloco "Map quesitos responses back to extractedData (Zero-Touch)" (chunked path).

**Linhas 3040-3049** — Remover bloco idêntico (non-chunked path).

### `src/components/tools/ImportarAutosDialog.tsx`

**Linhas 1058-1060** — Forçar quesitos vazios na importação:
```typescript
quesitos_juizo: '',
quesitos_reclamante: '',
quesitos_reclamada: '',
```

---

## 2. Nova Edge Function — `gerar-quesitos`

### `supabase/functions/gerar-quesitos/index.ts` (CRIAR)

Fluxo:
1. Autenticar via JWT, validar propriedade do laudo
2. Receber `laudoId` + `contexto` (campos clínicos do formulário) no body
3. Buscar `ai_metadata.extracted_content_path` do laudo para obter o texto do PDF via `retrieveExtractedContent`
4. Executar 3 chamadas de IA em paralelo (`Promise.allSettled`) — uma por grupo (Juízo, Reclamante, Reclamada)
5. Cada chamada recebe:
   - O texto integral do PDF (para localizar as perguntas)
   - O contexto clínico do médico (nexo, incapacidade, conclusão, etc.) — vindo do payload, não do banco
6. Retornar `{ quesitosJuizo, quesitosReclamante, quesitosReclamada }`

Reutiliza: `getAIConfig`, `callAI` de `_shared/ai-config.ts`, `retrieveExtractedContent` de `_shared/pdf-visual-extractor.ts`, `getPrompt` de `_shared/prompt-manager.ts`.

Prompt blindado: instruir a IA a responder APENAS com base nos dados clínicos fornecidos, nunca inventar achados. Regra de inexistência: se quesitos não forem encontrados, retornar frase padrão.

### `supabase/config.toml`

Adicionar:
```toml
[functions.gerar-quesitos]
verify_jwt = true
```

---

## 3. Frontend — Botão Único (`Quesitos.tsx`)

### `src/components/laudo/sections/Quesitos.tsx` (REESCREVER)

- Remover `enableRegenerate={true}` dos 3 `LaudoTextareaAIField`
- Adicionar botão "Gerar Respostas dos Quesitos" com ícone `Sparkles` acima das tabs
- Ao clicar:
  1. Verificar se campos não estão vazios → mostrar `AlertDialog` de confirmação
  2. Montar payload com campos do `currentLaudo`: `nexoCausalJustificativa`, `conclusaoIncapacidade`, `analiseIncapacidadeLaboral`, `historiaAtual`, `exameFisico`, `examesComplementares`, `descricaoAtividadesLaborais`, `conclusaoAnalise`, `diagnosticoCIDs`, `antecedentes`, `laudosMedicos`
  3. Chamar `supabase.functions.invoke('gerar-quesitos', { body: { laudoId, contexto } })`
  4. Preencher os 3 campos via `updateLaudo()`
  5. Loading state com `Loader2` + toast de sucesso/erro

---

## 4. Ficheiros Impactados

| Arquivo | Ação |
|---|---|
| `supabase/functions/gerar-quesitos/index.ts` | **CRIAR** |
| `supabase/config.toml` | Adicionar entrada |
| `supabase/functions/processar-autos/index.ts` | `shouldGenerate: false` + remover 2 blocos de mapeamento |
| `src/components/tools/ImportarAutosDialog.tsx` | Forçar quesitos vazios |
| `src/components/laudo/sections/Quesitos.tsx` | Reescrever com botão único |

## 5. Ficheiros NÃO Tocados

- `LaudoContext.tsx` — interface e persistência inalterados
- `regerar-campo-pdf` — mantido intacto
- `build-import-prompt.ts` — extração de perguntas brutas preservada
- `seed-prompts`, `laudo-structure.ts`, exportadores DOCX/PDF — zero alterações

