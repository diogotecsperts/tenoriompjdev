

# Fix: Heartbeat de Presenca - 3 Bugs Identificados

## Diagnostico

Dados do banco:
- `user_presence` tem apenas 1 registro (Diogo), com `is_online: false`
- Bruno (e48a06e4) nao tem NENHUM registro na tabela
- O heartbeat do Bruno falha silenciosamente (catch vazio esconde o erro)

3 bugs no codigo atual:

1. **Race condition**: `sendHeartbeat(false)` no cleanup do useEffect (linha 51) dispara em StrictMode e sobrescreve o `true` do re-mount
2. **Logica isOnline errada**: Verifica `is_online` flag antes do timestamp -- se flag=false, sempre offline mesmo com heartbeat recente
3. **sendBeacon sem autenticacao**: Falta header `apikey` no sendBeacon, Supabase rejeita silenciosamente

## Correcoes

### Arquivo 1: `src/hooks/usePresenceHeartbeat.ts`

Reescrever o hook com:

```typescript
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 60_000;

export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;

    const sendHeartbeat = async () => {
      if (!mountedRef.current) return;
      try {
        await (supabase.from("user_presence") as any).upsert(
          {
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            is_online: true,
          },
          { onConflict: "user_id" }
        );
      } catch {
        // Silent fail
      }
    };

    // Heartbeat inicial com delay para evitar race do StrictMode
    const initTimeout = setTimeout(() => sendHeartbeat(), 150);

    // Heartbeat periodico
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Ao fechar aba: sendBeacon COM headers de autenticacao
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${user.id}`;
      const body = JSON.stringify({
        is_online: false,
        last_seen_at: new Date().toISOString(),
      });
      // sendBeacon nao suporta headers customizados,
      // entao usamos fetch com keepalive como alternativa
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Prefer": "return=minimal",
        },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // NAO enviar sendHeartbeat(false) aqui - causa race condition
    };
  }, [user?.id]);
}
```

Mudancas chave:
- Removido o parametro `online` do `sendHeartbeat` -- ele so envia `true`
- Adicionado `mountedRef` para prevenir envio apos desmonte
- Delay de 150ms no heartbeat inicial contra race do StrictMode
- Removido `sendHeartbeat(false)` do cleanup (era a causa raiz)
- Substituido `sendBeacon` por `fetch` com `keepalive: true` (sendBeacon nao suporta headers customizados, e sem `apikey` o Supabase rejeita)

### Arquivo 2: `src/components/dev-panel/DevAccessHistory.tsx`

Alterar apenas a funcao `isOnline` (linhas 75-80):

De:
```typescript
const isOnline = (userId: string) => {
  const p = presence.find((pr) => pr.user_id === userId);
  if (!p || !p.is_online) return false;
  const diff = Date.now() - new Date(p.last_seen_at).getTime();
  return diff < 2 * 60 * 1000;
};
```

Para:
```typescript
const isOnline = (userId: string) => {
  const p = presence.find((pr) => pr.user_id === userId);
  if (!p) return false;
  const diff = Date.now() - new Date(p.last_seen_at).getTime();
  return diff < 2 * 60 * 1000; // Online = heartbeat nos ultimos 2 min
};
```

Unica mudanca: removido `!p.is_online` da condicao. Agora depende APENAS do timestamp do ultimo heartbeat, que e muito mais confiavel.

## Garantia de seguranca

Arquivos que NAO serao tocados:
- `supabase/functions/processar-autos/index.ts`
- `supabase/functions/gerar-resumos/index.ts`
- Qualquer edge function
- `src/contexts/AuthContext.tsx`
- `src/contexts/LaudoContext.tsx`
- `src/contexts/NavigationGuardContext.tsx`
- `src/components/tools/ImportarAutosDialog.tsx`
- `src/components/layout/AppLayout.tsx`
- Todas as tabelas existentes (laudos, profiles, etc.)

Somente 2 arquivos alterados, ambos exclusivos do sistema de monitoramento.
