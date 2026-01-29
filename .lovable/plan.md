

## Plano: Padronizar Cores dos Painéis "Mistral OCR Ativo"

---

## Problema

Os dois painéis de informação do Mistral OCR usam cores laranja (`orange-50`, `orange-700`, etc.) que estão com baixo contraste e difícil leitura, especialmente no modo escuro.

---

## Solução

Padronizar com o design system neutro/profissional, usando cores `muted`, `foreground` e `border` que são consistentes em toda a aplicação.

---

## Arquivos a Modificar

| Arquivo | Linhas | Descrição |
|---------|--------|-----------|
| `src/components/dev-panel/DevSettings.tsx` | 2115-2130 | Painel Mistral OCR (Passagem Única) |
| `src/components/dev-panel/DevSettings.tsx` | 2507-2525 | Painel Mistral OCR (Duas Fases) |

---

## Mudanças

### Instância 1: Passagem Única (linhas 2115-2130)

**Antes:**
```tsx
<div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
  <Crown className="h-4 w-4 text-orange-500 mt-0.5" />
  <p className="font-medium text-orange-700 dark:text-orange-400">
  <ul className="text-orange-600 dark:text-orange-300 space-y-0.5">
```

**Depois:**
```tsx
<div className="p-3 rounded-lg border-border bg-muted/50">
  <Crown className="h-4 w-4 text-primary mt-0.5" />
  <p className="font-medium text-foreground">
  <ul className="text-muted-foreground space-y-0.5">
```

---

### Instância 2: Duas Fases (linhas 2507-2525)

Mesma padronização aplicada, incluindo o aviso de API key faltando:

**Antes:**
```tsx
<p className="text-orange-500 font-medium mt-2">
  ⚠️ Requer MISTRAL_API_KEY configurada nas secrets
</p>
```

**Depois:**
```tsx
<p className="text-destructive font-medium mt-2">
  ⚠️ Requer MISTRAL_API_KEY configurada nas secrets
</p>
```

---

## Comparativo Visual

**Antes (laranja - difícil leitura):**
```text
┌──────────────────────────────────────────────┐
│  👑 Mistral OCR Ativo - Precisão Elite       │  ← Texto laranja
│  • Precisão elite ~94.9%...                  │  ← Fundo laranja claro
│  • Custo: ~$1.00 por 1.000 páginas           │  ← Baixo contraste
└──────────────────────────────────────────────┘
```

**Depois (neutro - profissional):**
```text
┌──────────────────────────────────────────────┐
│  👑 Mistral OCR Ativo - Precisão Elite       │  ← Texto preto/branco
│  • Precisão elite ~94.9%...                  │  ← Fundo cinza suave
│  • Custo: ~$1.00 por 1.000 páginas           │  ← Alto contraste
└──────────────────────────────────────────────┘
```

---

## Benefícios

1. **Legibilidade:** Alto contraste entre texto e fundo
2. **Consistência:** Mesmo padrão visual do alerta "PDF Grande Detectado"
3. **Profissional:** Cores neutras do design system médico
4. **Acessibilidade:** Funciona bem em light e dark mode

