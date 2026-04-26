## Objetivo

Adicionar **nome do reclamante (paciente)** e **número do processo** à listagem de PDFs originais no DevPanel → "Arquivos Originais", facilitando a localização visual dos arquivos quando houver múltiplos uploads no mesmo dia. Nenhuma informação atual será removida — apenas enriquecida.

---

## Diagnóstico

A edge function `dev-list-pdfs` **já retorna** os campos `reclamante` e `processo` no objeto `files[]` (extraídos de `import_jobs.result`), mas o componente `DevOriginalFiles.tsx` ignora esses campos ao renderizar a tabela.

Adicionalmente, alguns jobs antigos podem não ter populado esses campos no `result` (falhas parciais, formatos legados). Para garantir cobertura máxima, vou adicionar um **fallback opcional** cruzando com a tabela `laudos` quando o reclamante não estiver no `import_jobs.result`.

---

## Mudanças propostas

### 1. `supabase/functions/dev-list-pdfs/index.ts` (refinamento do fallback)

- Após buscar `import_jobs`, fazer uma segunda query enxuta em `laudos` (filtrada pelo `user_id`) selecionando apenas `processo_numero` e `reclamante`.
- Construir um `Map<processo_numero, reclamante>` em memória.
- Para cada `file`, se `reclamante` ou `processo` vierem nulos do `import_jobs.result`, tentar enriquecer:
  - Extrair o número do processo do nome do arquivo (regex `/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/`) como fallback de `processo`.
  - Cruzar com o Map de laudos para preencher `reclamante`.
- Custo: **1 query SQL adicional por requisição** (irrelevante, executa apenas quando o dev abre a tela do usuário).
- Segurança: nada muda — ainda valida JWT + `is_developer()`.

### 2. `src/components/dev-panel/DevOriginalFiles.tsx` (UI)

Na tabela de arquivos do usuário (segunda tela), adicionar **duas novas colunas** entre "Arquivo" e "Data":

| Arquivo | **Reclamante** | **Processo** | Data | Status | Ações |

- **Reclamante**: exibe `f.reclamante` ou `—` (em `text-muted-foreground` quando ausente).
- **Processo**: exibe `f.processo` em `font-mono text-xs` ou `—` quando ausente.
- A coluna "Arquivo" mantém o nome técnico do PDF (não remove informação existente).
- Largura da tabela continua confortável no viewport atual (2060px).

Opcional (UX bônus): adicionar um campo de busca local no topo da tabela de arquivos para filtrar por reclamante/processo, similar ao que já existe na tela de usuários. **Sugiro incluir** — é trivial e atende exatamente o cenário "muitos arquivos no mesmo dia".

---

## Segurança e isolamento

- ✅ **Zero impacto** em pipelines de produção (OCR, IA, geração de laudos).
- ✅ **Zero alterações** em prompts, no `LaudoContext` ou no schema do banco.
- ✅ Edge function continua restrita a `is_developer()`.
- ✅ Nenhuma RLS nova necessária — já uso `service_role` server-side com validação prévia.
- ✅ Funciona **retroativamente** para todos os 151 PDFs já indexados.

---

## Arquivos afetados

1. `supabase/functions/dev-list-pdfs/index.ts` — adicionar fallback via `laudos`.
2. `src/components/dev-panel/DevOriginalFiles.tsx` — adicionar colunas + busca opcional.

Sem migrações. Sem novas tabelas. Sem novos secrets.

---

## Resultado esperado

A tabela de arquivos do usuário passará de:

```
[arquivo.pdf] [25/04/2026 14:32] [completed] [⬇]
[arquivo.pdf] [25/04/2026 14:18] [completed] [⬇]
```

Para:

```
[arquivo.pdf] [VALDEMIR LIMA SILVA] [0000629-58.2025.5.19.0061] [25/04/2026 14:32] [completed] [⬇]
[arquivo.pdf] [JOÃO DA SILVA]       [0001234-56.2025.5.19.0061] [25/04/2026 14:18] [completed] [⬇]
```

Identificação visual instantânea, mesmo com dezenas de uploads no mesmo dia.