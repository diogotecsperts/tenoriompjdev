

## Plano: Indicador de Provider OCR + Ajuste de Cores do Alerta

---

## Resumo das Tarefas

1. **Adicionar indicador visual de provider OCR** no modal de progresso mostrando qual provedor está sendo usado durante a extração (Gemini, Mistral OCR, etc.)
2. **Ajustar cores da caixa "PDF Grande Detectado"** para seguir o design system médico (teal/slate) em vez de amarelo/âmbar que está destoante

---

## Tarefa 1: Indicador de Provider OCR no Modal de Progresso

### Problema Atual
Durante o processamento, o modal mostra apenas o provider genérico configurado (`aiConfig`), mas não indica especificamente qual OCR está sendo usado (Gemini Vision vs Mistral OCR).

### Solução
1. **Backend**: Modificar o `check-import-status` para retornar informações do provider OCR durante o processamento
2. **Frontend**: Adicionar um badge visual na seção de progresso mostrando o OCR ativo

### Mudanças no Backend

**Arquivo:** `supabase/functions/check-import-status/index.ts`

Adicionar campo `ocrProvider` na resposta, extraído do `current_step` ou de um novo campo:

```typescript
const response: any = {
  status: job.status,
  progress: job.progress,
  currentStep: job.current_step,
  stepId: job.step_id || null,
  updatedAt: job.updated_at,
  // Detectar provider OCR a partir do current_step
  ocrProvider: job.current_step?.toLowerCase().includes('mistral') 
    ? 'mistral-ocr' 
    : job.current_step?.toLowerCase().includes('gemini') 
      ? 'gemini' 
      : null,
  retryInfo: { ... }
};
```

### Mudanças no Frontend

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

#### 1. Adicionar estado para OCR provider (linha ~215):
```typescript
const [currentOCRProvider, setCurrentOCRProvider] = useState<string | null>(null);
```

#### 2. Atualizar `checkJobStatus` (linha ~571):
```typescript
// Update OCR provider indicator
if (data.ocrProvider) {
  setCurrentOCRProvider(data.ocrProvider);
}
```

#### 3. Adicionar Badge de OCR no modal de progresso (após linha ~1506):
Adicionar um badge visual que mostra o provider OCR quando está na etapa de extração:

```tsx
{/* OCR Provider Indicator */}
{currentOCRProvider && stepsStatus.find(s => s.id === 'extraction')?.status === 'processing' && (
  <div className="flex items-center justify-center gap-2 mt-2">
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs flex items-center gap-1.5",
        currentOCRProvider === 'mistral-ocr' 
          ? "border-orange-300 bg-orange-50 text-orange-700" 
          : "border-blue-300 bg-blue-50 text-blue-700"
      )}
    >
      <Eye className="h-3 w-3" />
      {currentOCRProvider === 'mistral-ocr' ? 'Mistral OCR' : 'Gemini Vision'}
    </Badge>
  </div>
)}
```

### Resultado Visual
```text
┌────────────────────────────────────────────────────────┐
│  ✨ Analisando documento com IA                        │
│     Tempo decorrido: 45s                               │
│     [🔧 Google Gemini • gemini-2.5-flash]              │
│     [👁️ Mistral OCR]  ← NOVO badge de OCR              │
├────────────────────────────────────────────────────────┤
│  ✓ Upload do PDF                            2.1s       │
│  ⟳ Extração de dados (Vision)                         │
│  ○ Processando dados extraídos                         │
│  ...                                                   │
└────────────────────────────────────────────────────────┘
```

---

## Tarefa 2: Ajustar Cores da Caixa "PDF Grande Detectado"

### Problema Atual
A caixa usa cores `amber` (amarelo/âmbar) que o usuário considera de mau gosto e fora do tema:
- `border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30`
- `text-amber-700 dark:text-amber-400` e `text-amber-600 dark:text-amber-300`

### Solução
Mudar para o esquema de cores do design system médico (azul/slate) que é mais neutro e profissional:

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`  
**Linhas:** ~1454-1465

### Antes (cores amber):
```tsx
<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
  <Layers className="h-4 w-4 text-amber-600" />
  <AlertTitle className="text-amber-700 dark:text-amber-400 text-sm font-medium">
    PDF Grande Detectado
  </AlertTitle>
  <AlertDescription className="text-amber-600 dark:text-amber-300 text-xs">
    ...
  </AlertDescription>
</Alert>
```

### Depois (cores slate/muted):
```tsx
<Alert className="border-border bg-muted/50">
  <Layers className="h-4 w-4 text-muted-foreground" />
  <AlertTitle className="text-foreground text-sm font-medium">
    PDF Grande Detectado
  </AlertTitle>
  <AlertDescription className="text-muted-foreground text-xs">
    Este arquivo ({formatFileSize(selectedFile.size)}) será dividido automaticamente 
    em partes menores para processamento. Isso é normal e não afeta a qualidade da extração.
  </AlertDescription>
</Alert>
```

### Comparativo Visual

**Antes (amber - mau gosto):**
```text
┌──────────────────────────────────────────────┐
│  🔶 PDF Grande Detectado                     │  ← Fundo amarelo
│  Este arquivo (68.4 MB)...                   │  ← Texto amarelo
└──────────────────────────────────────────────┘
```

**Depois (slate - neutro/profissional):**
```text
┌──────────────────────────────────────────────┐
│  📄 PDF Grande Detectado                     │  ← Fundo cinza suave
│  Este arquivo (68.4 MB)...                   │  ← Texto neutro
└──────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/tools/ImportarAutosDialog.tsx` | MODIFICAR | Adicionar estado/badge de OCR provider + ajustar cores do alerta |
| `supabase/functions/check-import-status/index.ts` | MODIFICAR | Retornar informação do OCR provider na resposta |

---

## Benefícios

1. **Transparência**: Usuário sabe exatamente qual OCR está sendo usado durante o processamento
2. **Design Consistente**: Cores neutras seguem o design system médico profissional
3. **UX Melhorada**: Informação útil sem poluição visual
4. **Acessibilidade**: Contraste adequado mantido com cores do tema

