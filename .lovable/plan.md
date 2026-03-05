

# Plano Executável: Remoção Completa da "Avaliação de Sequelas"

Todas as linhas foram verificadas e confirmadas via leitura direta dos ficheiros.

## 1. ELIMINAR FICHEIRO

- `src/components/laudo/sections/AvaliacaoSequelas.tsx` — eliminar integralmente

## 2. FRONTEND — Alterações com linhas exatas

### `src/contexts/LaudoContext.tsx` (7 pontos)
| Linhas | Ação | Conteúdo a remover |
|---|---|---|
| 71-73 | Remover da interface `LaudoData` | `tabelaSUSEP`, `danoEstetico`, `auxilioTerceiros` |
| 214-216 | Remover do mapeamento DB→estado (loadLaudo) | `tabelaSUSEP: dbLaudo.tabela_susep...` |
| 336-338 | Remover de `createLocalLaudo` | `tabelaSUSEP: ''...` |
| 437-439 | Remover de `createLaudo` | `tabelaSUSEP: ''...` |
| 538-540 | Remover de `loadFromImportJob` | `tabelaSUSEP: data.tabela_susep...` |
| 640-642 | Remover de `saveLaudo` (insert) | `tabela_susep: currentLaudo.tabelaSUSEP...` |
| 730-732 | Remover de `saveLaudo` (update) | `tabela_susep: currentLaudo.tabelaSUSEP...` |

### `src/pages/LaudoEditor.tsx` (2 pontos)
| Linhas | Ação |
|---|---|
| 77 | Remover `import { AvaliacaoSequelas }` |
| 108 | Remover `sequelas: AvaliacaoSequelas,` |

### `src/lib/laudo-structure.ts` (2 pontos)
| Linhas | Ação |
|---|---|
| 212 | Remover `'sequelas': ['import', 'regen'],` de `EXPECTED_PROMPT_TYPES` |
| 290-294 | Atualizar description para `"Conclusão e quesitos"` e remover `{ id: "sequelas", label: "Avaliação de Sequelas" }` |

### `src/hooks/useLaudoProgress.ts`
| Linhas | Ação |
|---|---|
| 62-64 | Remover `"tabelaSUSEP"`, `"danoEstetico"`, `"auxilioTerceiros"` do array `conclusao` |

### `src/components/tools/ImportarAutosDialog.tsx` (3 pontos)
| Linhas | Ação |
|---|---|
| 103-107 | Remover `avaliacao_sequelas` da interface `ExtractedData` |
| 1057-1060 | Remover mapeamento dos 3 campos para o update |
| 1207 | Remover `avaliacao_sequelas: { ... }` do default vazio |

### `src/components/dev-panel/PromptEditor.tsx` (2 pontos)
| Linhas | Ação |
|---|---|
| 87-89 | Remover 3 entradas de `AVAILABLE_VARIABLES` |
| 115-117 | Remover 3 entradas de `ALL_VARIABLES` |

## 3. EXPORTADORES

### `src/utils/generateLaudoDOCX.ts`
| Linhas | Ação |
|---|---|
| 769-783 | Remover bloco inteiro "17. AVALIAÇÃO DE SEQUELAS" (numeração dinâmica `sectionNumber++` ajusta automaticamente) |

### `src/utils/generateLaudoPDF.ts`
| Linhas | Ação |
|---|---|
| 904-918 | Remover bloco inteiro "17. AVALIAÇÃO DE SEQUELAS" (mesma lógica dinâmica) |

## 4. EDGE FUNCTIONS

### `supabase/functions/processar-autos/index.ts` (4 pontos)
| Linhas | Ação |
|---|---|
| 103-107 | Remover `"avaliacao_sequelas": {...}` do JSON template |
| 278-310 | Remover bloco inteiro "7.5. AVALIAÇÃO DE SEQUELAS" (instruções 7.5.1-7.5.3) |
| 719 | Remover `avaliacao_sequelas: {...}` do `defaultStructure` |
| 738 | Remover `avaliacao_sequelas: {...}` do merge de dados |
| 3052-3056 | Remover bloco `sanitizeOcrAccents` para `avaliacao_sequelas` |

### `supabase/functions/_shared/build-import-prompt.ts` (5 pontos)
| Linhas | Ação |
|---|---|
| 100-104 | Remover `"avaliacao_sequelas": {...}` do `IMPORT_JSON_TEMPLATE` |
| 380-397 | Remover `prompt_import_sequelas` inteiro de `DEFAULT_IMPORT_PROMPTS` |
| 471 | Remover `'prompt_import_sequelas'` de `PROMPT_ORDER` |
| 605 | Remover `prompt_import_sequelas: 'conclusao'` de `cardMapping` |
| 634 | Remover `prompt_import_sequelas: 'sequelas'` de `sectionMapping` |

### `supabase/functions/regerar-campo-pdf/index.ts` (2 pontos)
| Linhas | Ação |
|---|---|
| 28-30 | Remover 3 mapeamentos (`tabelaSUSEP`, `danoEstetico`, `auxilioTerceiros`) do `FIELD_PROMPT_MAP` |
| 420-422 + 460-462 | Remover `tabela_susep`, `dano_estetico`, `auxilio_terceiros` do select e do `laudoContext` |

### `supabase/functions/seed-prompts/index.ts` (2 pontos)
| Linhas | Ação |
|---|---|
| 34 | Remover `prompt_import_sequelas: { cardId: 'conclusao', sectionId: 'sequelas' }` do `cardMapping` |
| 394-472 | Remover 3 blocos inteiros: `prompt_regen_tabelaSUSEP`, `prompt_regen_danoEstetico`, `prompt_regen_auxilioTerceiros` |

## 5. MIGRAÇÃO SQL (dados)

```sql
DELETE FROM public.system_config WHERE id IN (
  'prompt_import_sequelas',
  'prompt_regen_tabelaSUSEP',
  'prompt_regen_danoEstetico',
  'prompt_regen_auxilioTerceiros'
);
```

Colunas na tabela `laudos` preservadas para dados históricos.

## 6. NÃO TOCADOS (isolamento)

- `gerar-resposta-impugnacao` — mantém referência a colunas históricas (exibe "Não informado")
- AuthContext, NavigationGuard, hooks de presença, `gerar-resumos`, `extrair-texto-pdf`
- Zero refatorações cosméticas

