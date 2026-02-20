
# Plano — Correção do Bug de Escopo `pdfBytesBackup` em `processar-autos`

## Diagnóstico Confirmado

O erro `ReferenceError: pdfBytesBackup is not defined` na linha 1986 (linha do stack trace compilado, equivalente à linha 2195 do fonte) é causado por um **bug de escopo léxico** introduzido quando a variável de backup foi adicionada dentro do bloco `try`.

### Estrutura atual (BUGADA):

```typescript
// Linha 2039: início do try
try {
  let bytesForMistral: Uint8Array;
  // ... monta bytesForMistral ...

  const pdfBytesBackup = bytesForMistral;  // ← LINHA 2072: declarada DENTRO do try
  
  // ... processa com Mistral OCR ...
  
} catch (mistralError) {  // ← bloco irmão, não tem acesso ao try
  
  if (!pdfBytes && pdfBytesBackup) {  // ← LINHA 2195: ERRO - pdfBytesBackup não existe aqui
    pdfBytes = pdfBytesBackup;
  }
}
```

Em JavaScript/TypeScript, `const` e `let` têm **escopo de bloco** (`{}`). O bloco `catch` é irmão do `try` — não filho. Portanto, qualquer variável declarada dentro do `try` é destruída antes do `catch` executar.

---

## Solução: Declarar `pdfBytesBackup` fora do bloco `try`

A correção é mover a declaração de `pdfBytesBackup` para **antes** do bloco `try`, no mesmo escopo em que o `catch` é executado. Assim, ambos os blocos enxergam a mesma variável.

### Estrutura corrigida:

```typescript
// Declaração ANTES do try — visível em try E catch
let pdfBytesBackup: Uint8Array | null = null;

try {
  let bytesForMistral: Uint8Array;
  // ... monta bytesForMistral ...

  pdfBytesBackup = bytesForMistral;  // ← atribuição (não declaração)
  
  // ... processa com Mistral OCR ...
  
} catch (mistralError) {
  
  if (!pdfBytes && pdfBytesBackup) {  // ← AGORA FUNCIONA
    pdfBytes = pdfBytesBackup;
  }
}
```

---

## Operações de Implementação

### Operação A — Linha 2072: transformar `const` em atribuição

**Antes (linha 2072):**
```typescript
// Preserve bytes reference so Gemini fallback has data if Mistral fails
const pdfBytesBackup = bytesForMistral;
```

**Depois:**
```typescript
// Preserve bytes reference so Gemini fallback has data if Mistral fails
pdfBytesBackup = bytesForMistral;
```

### Operação B — Antes da linha 2039 (início do `try`): adicionar declaração

Imediatamente antes de `try {` (linha do bloco Mistral), inserir:

```typescript
// Declared outside try/catch so catch can access it if Mistral fails
let pdfBytesBackup: Uint8Array | null = null;
```

---

## Impacto das Operações

| | |
|---|---|
| Arquivo | `supabase/functions/processar-autos/index.ts` |
| Linhas alteradas | 2 linhas (1 inserção de declaração + 1 remoção de `const`) |
| Lógica alterada | Nenhuma — comportamento idêntico, apenas escopo corrigido |
| Risco de regressão | Zero — a semântica é exatamente a que o código original pretendia |

### Por que esta é a única correção necessária

- A lógica de fallback (restaurar `pdfBytes = pdfBytesBackup`) já está correta
- O `catch` já trata o erro do Mistral corretamente após a linha 2195
- O fluxo de Gemini como fallback já existe e funciona (linhas 2211+)
- O único problema é que o `catch` nunca chegava a executar sua lógica de restauração porque explodía antes com `ReferenceError`

Com a correção, o fluxo correto será:

```
Mistral falha → catch executa → pdfBytesBackup restaura pdfBytes →
fluxo cai para "Original flow" (linha 2212) → Gemini processa → sucesso
```

---

## Escopo Final

- Nenhuma migração de banco
- Nenhum prompt alterado
- Nenhuma alteração no frontend
- Nenhuma nova dependência
- Apenas 2 linhas modificadas em `processar-autos/index.ts`
- Deploy automático após a mudança
