
# Plano — Botão "Cancelar" Acessível Durante Importação

## Diagnóstico Completo do Estado Atual

### Fluxo atual (problema identificado)

O `Dialog` em `ImportarAutosDialog.tsx` usa a variável `isProcessingActive` (linha 1620) que é `true` quando `processingStep === 'uploading' || processingStep === 'analyzing'`. Durante esse estado:

- `onOpenChange` bloqueia o fechamento e mostra o toast _"Aguarde a conclusão ou use 'Cancelar' para interromper."_ (linha 1628–1631)
- `onInteractOutside` cancela o evento (linha 1639–1643)
- `onEscapeKeyDown` cancela o evento (linha 1644–1649)
- O botão X do canto superior direito dispara o mesmo `onOpenChange` bloqueado

**Resultado:** O usuário lê a mensagem pedindo para usar "Cancelar", mas esse botão não existe durante o processamento — ele só aparece na fase `preview`. O único "Cancelar" disponível durante processamento está dentro do alerta de `isJobStale` (linha 2013–2031), que só é exibido 5+ minutos após inatividade do job.

### Estrutura existente de cancelamento (referência)

O cancelamento via `isJobStale` já tem a lógica correta:
```typescript
if (pollingRef.current) {
  clearInterval(pollingRef.current);
  pollingRef.current = null;
}
setProcessingStep("idle");
toast({ variant: "destructive", title: "Processamento cancelado", ... });
```

Essa lógica já funciona e é o padrão a seguir.

---

## O que Será Implementado

### Operação A — Estado de confirmação de cancelamento

Adicionar um novo `useState` para controlar o estado do diálogo de confirmação de cancelamento, sem criar um Dialog adicional (será um painel inline dentro do modal existente):

```typescript
const [showCancelConfirm, setShowCancelConfirm] = useState(false);
```

E resetá-lo no `handleClose` para garantir limpeza total.

### Operação B — Função `handleForcedCancel`

Criar a função que executa o cancelamento efetivo quando confirmado:

```typescript
const handleForcedCancel = () => {
  // Para o polling imediatamente
  if (pollingRef.current) {
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }
  // Limpa todos os estados ativos
  setShowCancelConfirm(false);
  setProcessingStep("idle");
  setAnalysisStep("");
  setAnalysisProgress(0);
  setIsSplitting(false);
  // Reseta contadores de resiliência para não interferir em futuras importações
  networkErrorCountRef.current = 0;
  setIsReconnecting(false);
  setIsJobStale(false);
  lastJobUpdateRef.current = null;
  staleCheckCountRef.current = 0;
  setIsSlowAI(false);
  setSlowSteps([]);
  setStepsStatus(PROCESSING_STEPS.map(step => ({ ...step, status: 'pending' })));
  lastStepIdRef.current = null;
  // NÃO fecha o modal — retorna ao estado idle para nova tentativa
  toast({
    variant: "destructive",
    title: "Importação cancelada",
    description: "O processo foi interrompido. Você pode selecionar outro arquivo.",
  });
};
```

A função **não** chama `onOpenChange(false)` — retorna ao estado `idle` dentro do mesmo modal, permitindo nova tentativa sem precisar reabrir.

### Operação C — Botão "Cancelar importação" + Confirmação inline

Inserir, **dentro do bloco `processingStep === "analyzing"`** (após a barra de progresso, linha 2052–2056), um botão persistente de cancelar e seu painel de confirmação:

```tsx
{/* Botão persistente de cancelamento */}
{!showCancelConfirm ? (
  <div className="pt-2 flex justify-center">
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowCancelConfirm(true)}
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5"
    >
      <XCircle className="h-3.5 w-3.5" />
      Cancelar importação
    </Button>
  </div>
) : (
  <Alert className="border-destructive/50 bg-destructive/10">
    <AlertTriangle className="h-4 w-4 text-destructive" />
    <AlertTitle className="text-destructive">Cancelar importação?</AlertTitle>
    <AlertDescription className="text-destructive/80">
      O processamento em andamento será perdido. Você precisará iniciar uma nova importação.
    </AlertDescription>
    <div className="flex gap-2 mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowCancelConfirm(false)}
        className="text-xs"
      >
        Continuar processando
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleForcedCancel}
        className="text-xs"
      >
        <XCircle className="h-3.5 w-3.5 mr-1" />
        Confirmar cancelamento
      </Button>
    </div>
  </Alert>
)}
```

O mesmo padrão será aplicado ao bloco `isSplitting` (divisão do PDF no navegador, linha 1792–1831), já que o usuário também fica preso durante a divisão.

### Operação D — Corrigir o toast enganoso

Atualizar o texto do toast de bloqueio do `onOpenChange` (linha 1628–1631) para refletir a existência real do botão:

```typescript
toast({
  title: "Processamento em andamento",
  description: "Use o botão 'Cancelar importação' abaixo para interromper.",
});
```

### Operação E — Reset do `showCancelConfirm` no `handleClose`

Adicionar `setShowCancelConfirm(false)` ao `handleClose` (linha 1150) para garantir limpeza completa ao fechar o modal por qualquer caminho.

---

## Por que esta abordagem é segura

| Risco potencial | Como é mitigado |
|---|---|
| Cancelar limpa estados mas polling continua | `clearInterval(pollingRef.current)` é a primeira instrução do `handleForcedCancel` |
| Job no backend continua rodando | Esperado e aceitável — o backend expira por `wall_clock_limit` (600s). O frontend apenas para de escutar. O job fica com status `processing` no banco e não interfere com novos jobs (cada job tem UUID único) |
| Estado sujo em nova importação | Todos os refs e states são resetados explicitamente em `handleForcedCancel` — usando a mesma lista completa do `handleClose` |
| Confirmação acidental | O painel de confirmação requer segundo clique em "Confirmar cancelamento" + tem "Continuar processando" como saída fácil |
| Upload parcial em storage | Arquivos parciais em `processos-pdf` são orphans sem job associado. Não causam erros em processos futuros (paths têm timestamp único) |

---

## Escopo de Mudanças

| Arquivo | Mudanças |
|---|---|
| `src/components/tools/ImportarAutosDialog.tsx` | +1 useState `showCancelConfirm` + função `handleForcedCancel` + UI de botão/confirmação no bloco `analyzing` + UI no bloco `isSplitting` + correção do texto do toast |

- Nenhuma migração de banco
- Nenhuma edge function alterada
- Nenhum prompt modificado
- Zero impacto em PDF ou DOCX
- Zero impacto na lógica de polling e resiliência existente
