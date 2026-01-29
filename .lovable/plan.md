

## Plano: Corrigir "Falha ao criar laudo" - Erro de Rede/Token

---

## Diagnóstico Confirmado

Os logs mostram claramente:

```
Error creating laudo: {
  "message": "TypeError: Failed to fetch",
  ...
  "at createLaudo (ImportarAutosDialog.tsx:655:47)"
}
```

**O job processou com sucesso!** O banco mostra:
- `progress: 100`
- `status: completed`
- Dados extraídos corretamente (vitima, processo, quesitos, resumos IA)

**O problema é na criação do laudo** - quando você clica em "Criar Laudo", a inserção no banco falha por erro de rede.

---

## Causa Raiz Provável

1. **Token de sessão expirado** - O processamento levou ~96 segundos. Durante esse tempo, o token JWT pode ter se tornado inválido ou estar próximo do limite
2. **Conexão de rede instável** - Perda momentânea durante o insert

---

## Solução Proposta

Adicionar **retry automático com refresh de sessão** na função `createLaudo`:

```typescript
const createLaudo = async () => {
  if (!extractedData || !user) return;

  try {
    setProcessingStep("creating");

    // NOVO: Refresh session before inserting to ensure valid token
    const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
    if (sessionError) {
      console.error('Session refresh failed:', sessionError);
      // Continue anyway, the current token might still be valid
    }

    // ... preparar laudoData ...

    // NOVO: Retry logic para insert
    let retryCount = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        const { data: newLaudo, error } = await supabase
          .from('laudos')
          .insert(laudoData)
          .select()
          .single();

        if (error) {
          throw error;
        }

        // Sucesso!
        toast({ title: "Laudo criado com sucesso!", ... });
        handleClose();
        navigate(`/laudo/${newLaudo.id}`);
        return;

      } catch (insertError) {
        lastError = insertError instanceof Error ? insertError : new Error(String(insertError));
        retryCount++;
        console.warn(`[createLaudo] Attempt ${retryCount} failed:`, lastError.message);
        
        if (retryCount < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, 1000 * retryCount));
          
          // Refresh session before retry
          await supabase.auth.refreshSession();
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Falha ao criar laudo');

  } catch (error) {
    console.error('Error creating laudo:', error);
    toast({
      variant: "destructive",
      title: "Erro ao criar laudo",
      description: error instanceof Error ? error.message : "Erro desconhecido",
    });
    setProcessingStep("preview");
  }
};
```

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `src/components/tools/ImportarAutosDialog.tsx` | Adicionar `refreshSession()` antes do insert |
| `src/components/tools/ImportarAutosDialog.tsx` | Adicionar retry com backoff exponencial (3 tentativas) |

---

## Por Que Isso Vai Funcionar

1. **`refreshSession()`** garante token válido após o longo processamento
2. **Retry com backoff** protege contra falhas de rede temporárias
3. **Mantém UX** - O usuário só vê erro após 3 tentativas falharem

---

## Resultado Esperado

| Situação | Antes | Depois |
|----------|-------|--------|
| Token expirado | ❌ Falha | ✅ Refresh automático |
| Rede instável | ❌ Falha | ✅ Retry automático |
| Falha permanente | ❌ Erro genérico | ✅ Erro após 3 tentativas |

