

## Plano: Padronizar Cores Mistral OCR com Design System

---

## Problema

Várias instâncias de cores laranja (`orange-*`) para Mistral OCR estão destoando do design system médico (Teal/Emerald). As cores estão de mau gosto e quase ilegíveis.

---

## Paleta do Site (src/index.css)

| Token | HSL | Uso |
|-------|-----|-----|
| `primary` | 168 58% 39% | Cor principal (Teal) |
| `muted` | 210 20% 94% | Fundos suaves |
| `muted-foreground` | 215 15% 45% | Textos secundários |
| `border` | 210 20% 90% | Bordas neutras |

---

## Arquivos e Mudanças

### 1. ImportarAutosDialog.tsx (linhas 1515-1528)

**Badge OCR no modal de progresso**

**Antes:**
```tsx
currentOCRProvider === 'mistral-ocr' 
  ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700..."
  : "border-blue-300 bg-blue-50 text-blue-700..."
```

**Depois:**
Remover cores por provider, usar estilo único neutro:
```tsx
<Badge 
  variant="outline" 
  className="mt-2 text-xs flex items-center gap-1.5 border-border bg-muted/50 text-foreground"
>
  <Eye className="h-3 w-3 text-primary" />
  {currentOCRProvider === 'mistral-ocr' ? 'Mistral OCR' : 'Gemini Vision'}
</Badge>
```

---

### 2. DevSettings.tsx - Provider Definition (linha 92)

**Cor do provider na lista AI_PROVIDERS**

**Antes:**
```typescript
color: "hsl(25, 95%, 55%)" // Laranja
```

**Depois:**
```typescript
color: "hsl(168, 58%, 39%)" // Primary (Teal)
```

---

### 3. DevSettings.tsx - Fase 1 OCR Selector (linha 2410)

**Bolinha de cor no dropdown**

**Antes:**
```tsx
<div className="w-2 h-2 rounded-full bg-orange-500" />
```

**Depois:**
```tsx
<div className="w-2 h-2 rounded-full bg-primary" />
```

---

## Resultado Visual

**Antes (cores aleatórias):**
```text
┌────────────────────────────────────────┐
│  [👁️ Mistral OCR]  ← Fundo laranja    │
│  [👁️ Gemini Vision] ← Fundo azul      │
└────────────────────────────────────────┘
```

**Depois (uniforme e profissional):**
```text
┌────────────────────────────────────────┐
│  [👁️ Mistral OCR]  ← Fundo cinza neutro │
│  [👁️ Gemini Vision] ← Fundo cinza neutro │
└────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Linha | Descrição |
|---------|-------|-----------|
| `src/components/tools/ImportarAutosDialog.tsx` | 1516-1527 | Badge OCR - remover cores condicionais |
| `src/components/dev-panel/DevSettings.tsx` | 92 | Cor do provider Mistral OCR |
| `src/components/dev-panel/DevSettings.tsx` | 2410 | Bolinha do dropdown Mistral OCR |

---

## Benefícios

1. **Consistência:** Todas as cores seguem o design system médico
2. **Legibilidade:** Alto contraste com cores neutras
3. **Profissionalismo:** Visual limpo e uniforme
4. **Manutenibilidade:** Menos código condicional

