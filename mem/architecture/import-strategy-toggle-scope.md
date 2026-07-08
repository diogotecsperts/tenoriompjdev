---
name: Import strategy toggle scope
description: Toggle single_pass vs two_phase afeta APENAS o módulo Trabalhista; Prev e Impugnação sempre usam o Provedor de OCR.
type: architecture
---

O toggle **Estratégia de Importação** (`system_config.import_strategy`) tem escopo
restrito ao pipeline **Trabalhista** (`supabase/functions/processar-autos`).

**Comportamento por módulo:**

| Módulo | Passagem Única (`single_pass`) | Duas Fases (`two_phase`) |
|---|---|---|
| **Trabalhista** | Modelo do Provider Inventory faz OCR + preenchimento num só request (o Provedor de OCR não é usado). | Fase 1 = Provedor de OCR extrai texto puro. Fase 2 = modelo `text_fill_provider` preenche campos. |
| **Previdenciário** | Sempre usa o Provedor de OCR (via `runOcrWithConfiguredProvider`). | Idem. |
| **Impugnação** | Sempre usa o Provedor de OCR (via `runOcrWithConfiguredProvider`). | Idem. |

**Implicação de UI:** o seletor "Provedor de OCR" no DevPanel **precisa estar sempre visível**,
independente da estratégia — Prev e Impugnação dependem dele em qualquer modo. Não voltar a
esconder atrás do `import_strategy === "two_phase"`.

**Implicação de código:** nenhum módulo pode hardcodar provider de OCR. Todos passam por
`supabase/functions/_shared/ocr-router.ts` → lê `phase1_ocr_provider` de `system_config`.
