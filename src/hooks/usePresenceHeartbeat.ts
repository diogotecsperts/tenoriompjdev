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

    // Ao fechar aba: fetch com keepalive (sendBeacon nao suporta headers)
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
