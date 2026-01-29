

## Plano: Resolver Crash de Memória e Fechamento Silencioso do Modal

---

## Diagnóstico Completo

### 1. Causa Raiz: Memory Limit Exceeded

Os logs mostram claramente:
```text
[pdf-splitter] Loading PDF (68.44MB)...
[pdf-splitter] Total pages: 796, bytesPerPage: 88KB, pagesPerPart: 443
[pdf-splitter] Creating part 1: pages 1-443 (443 pages)
Memory limit exceeded → shutdown
```

O problema ocorre no `pdf-splitter.ts` ao tentar:
1. Carregar 68MB do PDF na memória (`PDFDocument.load()`)
2. Criar um novo documento para a primeira parte (`PDFDocument.create()`)
3. Copiar 443 páginas (`copyPages()`)

Cada operação multiplica o uso de memória. Com ~150MB de limite do Worker, não é possível processar PDFs >50MB com splitting.

### 2. Problema Secundário: Modal Fecha Silenciosamente

O `Dialog` está configurado com `onOpenChange={handleClose}`, que:
- Permite fechamento via ESC ou clique fora
- Limpa TODO o estado interno sem feedback
- Não há bloqueio durante processamento ativo

---

## Solução Proposta (2 Partes)

---

### PARTE 1: Evitar Splitting para PDFs Grandes

Em vez de tentar dividir PDFs muito grandes na Edge Function, **rejeitar imediatamente** e pedir ao usuário para usar o Mistral OCR diretamente (que aceita até 50MB) ou dividir manualmente.

**Arquivo:** `supabase/functions/processar-autos/index.ts`

**Mudança:** Antes de tentar split, verificar se o PDF excede um limite seguro (~45MB) e usar fallback para Gemini direto via upload de bytes (que já está implementado) em vez de split.

```typescript
// ANTES (tenta split que causa OOM):
if (needsSplit(pdfBytes.length, MISTRAL_LIMIT)) {
  const splitResult = await splitPDF(pdfBytes, {...}); // 💥 OOM aqui
}

// DEPOIS (usar Gemini Files API para PDFs gigantes):
if (pdfBytes.length > MISTRAL_LIMIT && pdfBytes.length <= GEMINI_MAX_FILE_SIZE) {
  // Enviar direto para Gemini Files API (suporta até 2GB)
  // NÃO tentar split - consome muita memória
  console.log('[processar-autos] PDF muito grande para Mistral, usando Gemini Files API...');
  // ... usar extractVisualContent com bytes diretos
}
```

**Novo Fluxo para PDFs >50MB:**

| Tamanho | Ação |
|---------|------|
| < 50MB | Mistral OCR ou Gemini Vision (baseado em config) |
| 50-200MB | Gemini Files API direto (sem split) |
| > 200MB | Rejeitar com mensagem clara |

---

### PARTE 2: Bloquear Fechamento do Modal Durante Processamento

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

**Mudança:** Modificar o `onOpenChange` para bloquear fechamento acidental durante processamento ativo.

```tsx
// ANTES:
<Dialog open={open} onOpenChange={handleClose}>

// DEPOIS:
<Dialog 
  open={open} 
  onOpenChange={(isOpen) => {
    // Bloquear fechamento durante processamento
    if (!isOpen && (processingStep === 'uploading' || processingStep === 'analyzing')) {
      // Não fechar - mostrar toast de aviso
      toast({
        title: "Processamento em andamento",
        description: "Aguarde a conclusão ou use 'Cancelar' para interromper.",
      });
      return;
    }
    handleClose();
  }}
>
```

E adicionar `modal` prop para evitar interação com background:

```tsx
<DialogContent 
  className="sm:max-w-[600px]"
  onInteractOutside={(e) => {
    // Bloquear clique fora durante processamento
    if (processingStep === 'uploading' || processingStep === 'analyzing') {
      e.preventDefault();
    }
  }}
  onEscapeKeyDown={(e) => {
    // Bloquear ESC durante processamento
    if (processingStep === 'uploading' || processingStep === 'analyzing') {
      e.preventDefault();
    }
  }}
>
```

---

### PARTE 3: Melhorar Feedback de Erro para Memory Limit

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Melhorar a detecção de "stale job" para mostrar mensagem mais clara quando o backend não responde:

```tsx
// Quando job fica stale (sem updates por 5 min):
if (isJobStale) {
  // Verificar se o job ainda está como "processing" no banco
  // Se sim, provavelmente crashou - mostrar mensagem específica
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Processamento interrompido</AlertTitle>
    <AlertDescription>
      O servidor parou de responder. Isso pode ocorrer com arquivos muito grandes.
      <br />
      <strong>Sugestão:</strong> Divida o PDF em partes menores (máx. 50MB cada) e tente novamente.
    </AlertDescription>
  </Alert>
}
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/processar-autos/index.ts` | Não tentar split para PDFs >50MB, usar Gemini Files API direto ou rejeitar |
| `src/components/tools/ImportarAutosDialog.tsx` | Bloquear fechamento do modal durante processamento ativo |
| `src/components/tools/ImportarAutosDialog.tsx` | Melhorar mensagem quando job fica stale |

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         PDF RECEBIDO                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Tamanho do arquivo?  │
                    └───────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
     < 50MB               50-200MB               > 200MB
          │                     │                     │
          ▼                     ▼                     ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │ Mistral OCR │      │ Gemini Files│      │   REJEITAR  │
   │  ou Gemini  │      │ API (direto)│      │  com aviso  │
   │   Vision    │      │  sem split  │      │             │
   └─────────────┘      └─────────────┘      └─────────────┘
```

---

## Benefícios

1. **Estabilidade:** Elimina crashes de memória evitando operações caras
2. **UX:** Modal não fecha acidentalmente durante processamento
3. **Feedback:** Usuário entende claramente quando algo falha e por quê
4. **Graceful Degradation:** PDFs gigantes usam Gemini Files API que suporta até 2GB

