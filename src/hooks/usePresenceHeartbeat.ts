import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 60_000;

export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;
    let loginChecked = false;

    const checkAndNotifyLogin = async () => {
      if (loginChecked) return;
      loginChecked = true;
      try {
        // Última presença registrada
        const { data: prev } = await (supabase.from("user_presence") as any)
          .select("last_seen_at")
          .eq("user_id", user.id)
          .maybeSingle();

        const lastSeen = prev?.last_seen_at ? new Date(prev.last_seen_at).getTime() : 0;
        const gapMs = Date.now() - lastSeen;

        // Se nunca esteve online ou passou mais de 30 min inativo → nova sessão
        if (!lastSeen || gapMs > 30 * 60 * 1000) {
          const nome = (user.user_metadata as any)?.full_name
            || (user.user_metadata as any)?.nome
            || user.email
            || "Usuário";

          // Fire-and-forget: nunca bloqueia UX
          supabase.functions.invoke("send-tracking-email", {
            body: {
              type: "login",
              payload: { userId: user.id, userName: nome, userEmail: user.email ?? "" },
            },
          }).catch(() => {});

          void (supabase.from("email_login_events") as any).insert({
            user_id: user.id,
            session_started_at: new Date().toISOString(),
          }).then(() => {}, () => {});
        }
      } catch {
        // ignora falha na deteccao de login
      }
    };

    const sendHeartbeat = async () => {
      if (!mountedRef.current) return;
      try {
        // Checa login ANTES do upsert (para ler o valor anterior)
        await checkAndNotifyLogin();

        const { error } = await (supabase.from("user_presence") as any).upsert(
          {
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            is_online: true,
          },
          { onConflict: "user_id" }
        );
        if (error) console.warn("[Heartbeat] upsert error:", error.message);

        // Atualizar token JWT para uso no beforeunload
        const { data: { session } } = await supabase.auth.getSession();
        tokenRef.current = session?.access_token ?? null;
      } catch (e) {
        console.warn("[Heartbeat] exception:", e);
      }
    };

    // Heartbeat inicial com delay para evitar race do StrictMode
    const initTimeout = setTimeout(() => sendHeartbeat(), 150);

    // Heartbeat periodico
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Ao fechar aba: fetch com keepalive usando JWT real
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${user.id}`;
      const body = JSON.stringify({
        is_online: false,
        last_seen_at: new Date().toISOString(),
      });
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${tokenRef.current ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
