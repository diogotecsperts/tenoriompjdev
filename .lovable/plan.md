
# Fix: Heartbeat em TODAS as rotas autenticadas

## Problema encontrado

O `usePresenceHeartbeat` esta no `AppLayout`, mas o **DevPanel nao usa AppLayout** -- ele usa apenas `DevProtectedRoute`. Por isso, quando voce esta no DevPanel, seu heartbeat para e voce aparece offline.

Alem disso, o Bruno nao tem NENHUM registro em `user_presence`, o que indica que o upsert falha silenciosamente para ele. Precisamos investigar e corrigir.

## Correcoes (2 alteracoes minimas)

### 1. Adicionar heartbeat no DevProtectedRoute

Arquivo: `src/components/DevProtectedRoute.tsx`

Adicionar o hook `usePresenceHeartbeat()` dentro do componente, logo apos as verificacoes de autenticacao. Isso garante que quando voce esta no DevPanel, o heartbeat continua rodando.

```typescript
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

export function DevProtectedRoute({ children }: DevProtectedRouteProps) {
  // ... existing code ...
  usePresenceHeartbeat(); // Adicionar aqui
  // ... rest of component ...
}
```

### 2. Adicionar log de debug temporario no heartbeat

Para diagnosticar por que o Bruno nao consegue inserir, adicionar um `console.warn` no catch do heartbeat para que possamos ver o erro real no console:

Arquivo: `src/hooks/usePresenceHeartbeat.ts`

```typescript
const sendHeartbeat = async () => {
  if (!mountedRef.current) return;
  try {
    const { error } = await (supabase.from("user_presence") as any).upsert(
      {
        user_id: user.id,
        last_seen_at: new Date().toISOString(),
        is_online: true,
      },
      { onConflict: "user_id" }
    );
    if (error) console.warn("[Heartbeat] upsert error:", error.message);
  } catch (e) {
    console.warn("[Heartbeat] exception:", e);
  }
};
```

Isso vai nos mostrar se ha erro de RLS, conflito de chave, ou outro problema impedindo o Bruno de registrar presenca.

## Sobre a tela de monitoramento

- **Refresh button**: Re-busca dados do banco a cada clique
- **Auto-refresh**: A cada 30 segundos automaticamente
- **NAO e real-time via websocket**: Usa polling. Se deixar aberta, atualiza a cada 30s
- **Status muda automaticamente**: Sim, desde que o heartbeat do usuario funcione. Quando o heartbeat enviar dados, no proximo ciclo de 30s a tela mostra "Online"

## Garantia de seguranca

- Nenhum edge function tocado
- AuthContext inalterado
- LaudoContext inalterado
- Pipeline de importacao intocado
- Apenas 2 arquivos alterados: `DevProtectedRoute.tsx` (1 linha) e `usePresenceHeartbeat.ts` (log de debug)
