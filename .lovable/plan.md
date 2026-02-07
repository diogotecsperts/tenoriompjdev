
# Correção do Bug: Modal de Importação Lendo Configuração Errada de OCR

## Diagnóstico Confirmado

### O Problema Real
O sistema tem **duas configurações separadas** para o provedor de OCR, mas o modal de importação só lê uma delas:

| Configuração | Valor no Banco | Modo | Usado pelo Modal? |
|--------------|----------------|------|-------------------|
| `pdf_ai_provider` | `"mistral-ocr"` ✅ | single_pass | ❌ NÃO |
| `phase1_ocr_provider` | `"gemini"` | two_phase | ✅ SIM (bug) |

**Você configurou corretamente o Mistral** na seção "Extração de PDF", salvando em `pdf_ai_provider`.
**Mas o modal lê** `phase1_ocr_provider`, que ainda tem o valor antigo "gemini".

### Causa Raiz
O `ImportarAutosDialog.tsx` foi codificado para ler apenas `phase1_ocr_provider`, ignorando completamente `pdf_ai_provider` que é usado no modo single_pass.

---

## Solução

O modal deve ler a configuração correta baseada na estratégia de importação ativa:

- Se `import_strategy === "single_pass"` → usar `pdf_ai_provider` e `pdf_ai_model`
- Se `import_strategy === "two_phase"` → usar `phase1_ocr_provider` e `phase1_gemini_model`

### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

**1. Adicionar `import_strategy` e `pdf_ai_provider` à query (linha ~291)**

```typescript
.in('id', [
  'default_ai_provider', 
  'default_ai_model', 
  'max_pdf_size_mb', 
  'phase1_ocr_provider', 
  'phase1_gemini_model',
  'import_strategy',      // NOVO
  'pdf_ai_provider',      // NOVO
  'pdf_ai_model'          // NOVO
]);
```

**2. Modificar a lógica de OCR config (linhas ~305-308)**

```typescript
// Determine OCR config based on import strategy
const importStrategy = config.import_strategy || 'single_pass';

let ocrProvider: string;
let ocrModel: string;

if (importStrategy === 'two_phase') {
  // Two-phase mode: use phase1_ocr_provider
  ocrProvider = config.phase1_ocr_provider || 'gemini';
  ocrModel = config.phase1_gemini_model || 'gemini-2.0-flash';
} else {
  // Single-pass mode: use pdf_ai_provider
  ocrProvider = config.pdf_ai_provider || 'gemini';
  ocrModel = config.pdf_ai_model || 'gemini-2.0-flash';
}

setOcrConfig({ provider: ocrProvider, model: ocrModel });
```

**3. Ajustar a exibição do badge (linha ~1723-1726)**

O badge precisa tratar os dois valores de provider:
- `"mistral-ocr"` (usado em pdf_ai_provider)
- `"mistral"` (usado em phase1_ocr_provider)

```typescript
{ocrConfig.provider === 'mistral' || ocrConfig.provider === 'mistral-ocr' 
  ? 'Mistral OCR' 
  : `Gemini ${formatModelName(ocrConfig.model)}`}
```

---

## Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| Query (linha ~291) | Adicionar `import_strategy`, `pdf_ai_provider`, `pdf_ai_model` |
| Lógica OCR (linhas ~305-308) | Verificar estratégia e ler configuração correta |
| Badge display (linha ~1723) | Aceitar tanto `"mistral"` quanto `"mistral-ocr"` |

---

## Resultado Esperado

Após a correção:
- No modo **single_pass**: Modal lerá `pdf_ai_provider` = `"mistral-ocr"` → Mostrará **"OCR: Mistral OCR"** ✓
- No modo **two_phase**: Modal lerá `phase1_ocr_provider` → Mostrará o que estiver configurado lá

O Mistral voltará a funcionar corretamente em ambos os modos, como estava antes.
