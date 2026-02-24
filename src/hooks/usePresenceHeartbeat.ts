import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds

export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async (online: boolean) => {
      try {
        await (supabase.from("user_presence") as any).upsert(
          {
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            is_online: online,
          },
          { onConflict: "user_id" }
        );
      } catch {
        // Silent fail
      }
    };

    // Initial heartbeat
    sendHeartbeat(true);

    // Periodic heartbeat
    intervalRef.current = setInterval(() => sendHeartbeat(true), HEARTBEAT_INTERVAL);

    // On tab close / navigate away
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on tab close
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${user.id}`;
      const body = JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() });
      navigator.sendBeacon(
        url,
        new Blob([body], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sendHeartbeat(false);
    };
  }, [user?.id]);
}
