
# Correção do Bug: Exibição do Provedor de OCR no Modal de Importação

## Problema Identificado

O modal de importação está mostrando "OCR: Gemini gemini-3-flash-preview" mesmo quando o Mistral está selecionado como provedor de OCR padrão.

### Causa Raiz: Inconsistência de Valores

| Local | Valor Usado para Mistral |
|-------|--------------------------|
| DevSettings (salva no banco) | `"mistral"` |
| ImportarAutosDialog (verifica) | `"mistral-ocr"` ❌ |

A verificação na linha 1726 usa `'mistral-ocr'`, mas o DevSettings salva `'mistral'`:

```typescript
// Bug atual - condição nunca é verdadeira para Mistral
{ocrConfig.provider === 'mistral-ocr' ? 'Mistral OCR' : ...}
```

### Verificação no Banco de Dados

Dados atuais:
- `phase1_ocr_provider`: `"gemini"` 
- `phase1_gemini_model`: `"gemini-3-flash-preview"`

O sistema está corretamente usando Gemini porque esse é o valor configurado. Se você selecionou Mistral, o valor deveria ser `"mistral"`.

---

## Solução

Alinhar a verificação no ImportarAutosDialog com os valores que o DevSettings salva.

### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

**Linha 1726** - Corrigir a verificação do provider:

```typescript
// ANTES (bug):
{ocrConfig.provider === 'mistral-ocr' ? 'Mistral OCR' : `Gemini ${formatModelName(ocrConfig.model)}`}

// DEPOIS (corrigido):
{ocrConfig.provider === 'mistral' ? 'Mistral OCR' : `Gemini ${formatModelName(ocrConfig.model)}`}
```

---

## Verificação Adicional Recomendada

Se após a correção ainda mostrar Gemini, confirme no DevPanel que:
1. O `Provedor de OCR` está selecionado como "Mistral OCR"
2. Você clicou em "Salvar Configurações" após a mudança
3. Não houve erro ao salvar (cheque o toast de confirmação)

---

## Resumo

| O que corrigir | Onde | De | Para |
|----------------|------|----|----|
| String de comparação | Linha 1726 | `'mistral-ocr'` | `'mistral'` |

Essa é uma correção simples de uma linha que resolve o bug de exibição.
