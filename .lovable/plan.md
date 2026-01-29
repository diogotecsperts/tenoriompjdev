

## Plano: Remover Card "Custo IA (Mês)" do Dashboard e Ajustar Layout

---

## Situação Atual

O grid de cards do dashboard tem 7 colunas em telas XL com os seguintes cards:

| # | Card | Linhas |
|---|------|--------|
| 1 | Total de Usuários | 254-264 |
| 2 | Total de Laudos | 266-276 |
| 3 | Laudos este Mês | 278-288 |
| 4 | Requisições IA | 290-300 |
| 5 | IA Hoje | 302-312 |
| 6 | **Custo IA (Mês)** | 314-329 |
| 7 | Rate Limits | 331-346 |

O card "Custo IA (Mês)" (linhas 314-329) será removido. A funcionalidade de custo já existe na página "Custos PDF" (`DevPDFCosts.tsx`).

---

## Mudanças

### 1. Remover o Card "Custo IA (Mês)" (linhas 314-329)

Deletar completamente o card que exibe `monthlyAICost` e `pdfImportsMonth`.

### 2. Ajustar Grid para 6 Colunas

**Antes:**
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
```

**Depois:**
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
```

Isso distribui os 6 cards restantes uniformemente:
- **md:** 2 colunas (3 linhas)
- **lg:** 3 colunas (2 linhas)
- **xl:** 6 colunas (1 linha)

### 3. Limpar Dados Não Utilizados

Remover do interface e state os campos que não serão mais usados no dashboard:
- `monthlyAICost`
- `pdfImportsMonth`

E remover a lógica de cálculo de custo (linhas 161-195 parcialmente), mantendo apenas `retryCount` e `successAfterRetry`.

### 4. Remover Import Não Utilizado

Remover `DollarSign` dos imports (linha 11) já que não será mais usado.

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/dev-panel/DevDashboard.tsx` | Remover card, ajustar grid, limpar código |

---

## Resultado Visual

**Antes (7 cards):**
```text
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│Usuários│ Laudos │  Mês   │Req. IA │IA Hoje │Custo IA│ Rate   │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┘
```

**Depois (6 cards uniformes):**
```text
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Usuários │  Laudos  │   Mês    │ Req. IA  │ IA Hoje  │  Rate    │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## Funcionalidade Preservada

O custo de IA continua disponível na aba "Custos PDF" do DevPanel, onde `DevPDFCosts.tsx` já exibe informações detalhadas de custo por modelo e por período.

