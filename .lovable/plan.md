

# Fix: Status Offline demora varios minutos apos logout

## Problema

O status muda para offline apenas quando o threshold de 2 minutos sem heartbeat expira na UI. Nenhuma acao ativa marca o usuario como offline no momento do logout ou fechamento do browser.

## Causa raiz

1. **Logout (`AuthContext.tsx`)**: O `logout()` chama `signOut()` sem antes atualizar `user_presence.is_online = false`. O JWT e invalidado antes de qualquer tentativa de update.

2. **Fechar aba (`usePresenceHeartbeat.ts`)**: O `handleBeforeUnload` usa a anon key (`VITE_SUPABASE_PUBLISHABLE_KEY`) no header Authorization. A politica RLS exige `auth.uid() = user_id`, e a anon key nao possui `auth.uid()`. O PATCH e rejeitado silenciosamente.

## Solucao (2 arquivos)

### 1. `src/contexts/AuthContext.tsx`

No metodo `logout`, adicionar update de presenca **antes** do `signOut()`, enquanto o JWT ainda e valido:

```typescript
const logout = async () => {
  if (user) {
    await (supabase.from("user_presence") as any).update({
      is_online: false,
      last_seen_at: new Date().toISOString(),
    }).eq("user_id", user.id);
  }
  await supabase.auth.signOut();
  // ... reset state existente
};
```

### 2. `src/hooks/usePresenceHeartbeat.ts`

- Armazenar o `access_token` da sessao em um `useRef` (atualizado a cada heartbeat)
- No `handleBeforeUnload`, usar esse token JWT real no header Authorization em vez da anon key

```typescript
const tokenRef = useRef<string | null>(null);

// No sendHeartbeat, apos sucesso:
const { data: { session } } = await supabase.auth.getSession();
tokenRef.current = session?.access_token ?? null;

// No handleBeforeUnload:
"Authorization": `Bearer ${tokenRef.current ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
```

## Resultado esperado

- **Logout via botao**: offline imediato (SDK com JWT valido)
- **Fechar aba/browser**: offline imediato (fetch keepalive com JWT real)
- **Fallback**: se ambos falharem, UI mostra offline apos 2 min sem heartbeat

