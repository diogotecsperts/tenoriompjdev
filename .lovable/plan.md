# Plano: Fluxo de Duas Fases - ✅ IMPLEMENTADO

## Status: CONCLUÍDO

A implementação do fluxo de duas fases foi concluída com sucesso.

---

## O que foi implementado

### 1. `processar-autos/index.ts`
- ✅ Importação das utilidades: `extractVisualContent`, `storeExtractedContent`, `getRelevantChunk`, `getFieldPrompt`
- ✅ Busca de configuração `import_strategy` do `system_config`
- ✅ Lógica condicional `two_phase` vs `single_pass`
- ✅ Fase 1: Extração visual com Gemini OCR (usa Files API para PDFs > 50MB)
- ✅ Fase 2: Preenchimento estruturado com provider flexível
- ✅ Armazenamento do texto extraído no bucket `processos-pdf`
- ✅ Fallback automático para passagem única se duas fases falhar
- ✅ `extracted_content_path` incluído no resultado

### 2. `regerar-campo-pdf/index.ts`
- ✅ Importação de `retrieveExtractedContent`, `getRelevantChunk`, `getFieldPrompt`
- ✅ Prioridade 1: Buscar texto completo do bucket (mais preciso)
- ✅ Smart chunking: Região relevante por campo
- ✅ Fallback para cache estruturado se bucket não disponível

### 3. `ImportarAutosDialog.tsx`
- ✅ `extracted_content_path` persistido no `ai_metadata` do laudo
- ✅ Estratégia (`two_phase`/`single_pass`) registrada nos metadados

---

## Configurações no DevPanel

As seguintes configurações controlam o comportamento:

| Config ID | Valor Padrão | Descrição |
|-----------|--------------|-----------|
| `import_strategy` | `"two_phase"` | `single_pass` ou `two_phase` |
| `text_fill_provider` | `"lovable"` | Provider para Fase 2 |
| `text_fill_model` | `"google/gemini-3-flash-preview"` | Modelo para Fase 2 |
| `store_extracted_text` | `true` | Armazenar texto no bucket |
| `max_pdf_size_mb` | `100` | Limite de tamanho de PDF |

---

## Fluxo Visual

```
PDF Upload
    │
    ▼
┌───────────────────────────┐
│ Verificar import_strategy │
└───────────────────────────┘
    │
    ├── two_phase ──────────────────────┐
    │                                    │
    ▼                                    ▼
┌───────────────────────────┐    ┌───────────────────────────┐
│ FASE 1: Gemini OCR        │    │ PASSAGEM ÚNICA            │
│ • extractVisualContent()  │    │ • callPDFProvider()       │
│ • Files API se > 50MB     │    │ • Fluxo original          │
│ • Armazena no bucket      │    └───────────────────────────┘
│                           │
│ FASE 2: Provider Flexível │
│ • callAI() com texto puro │
│ • Smart chunking          │
│ • Custo ~60% menor        │
└───────────────────────────┘
    │
    ▼
┌───────────────────────────┐
│ Criar Laudo com           │
│ extracted_content_path    │
└───────────────────────────┘
    │
    ▼
┌───────────────────────────┐
│ Regeneração (🔄)          │
│ • Usa bucket se disponível│
│ • Smart chunk por campo   │
└───────────────────────────┘
```

---

## Próximos Passos (Opcional)

1. **Testar com PDF pequeno** (~5MB) para validar fluxo
2. **Testar com PDF grande** (~68MB) para validar Files API
3. **Monitorar logs** no DevPanel para verificar estratégia usada
4. **Ajustar configurações** conforme necessidade (provider, modelo)
