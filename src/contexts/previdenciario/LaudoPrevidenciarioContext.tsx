import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  getDefaultPrevData,
  mergePrevData,
  PrevData,
} from "@/lib/previdenciario/prev-data-defaults";

type LaudoRow = {
  id: string;
  user_id: string;
  title: string;
  status: string | null;
  tipo_laudo: string;
  prev_data: PrevData;
  // colunas nativas reaproveitadas
  perito_nome: string | null;
  perito_crm: string | null;
  perito_especialidade: string | null;
  perito_email: string | null;
  perito_telefone: string | null;
  perito_endereco: string | null;
  processo_numero: string | null;
  processo_vara: string | null;
  reclamante: string | null;
  reclamada: string | null;
  data_pericia: string | null;
  local_pericia: string | null;
  vitima_nome: string | null;
  vitima_nascimento: string | null;
  vitima_profissao: string | null;
  vitima_escolaridade: string | null;
  created_at: string;
  updated_at: string;
};

export type LaudoPrev = LaudoRow;

interface Ctx {
  laudo: LaudoPrev | null;
  loading: boolean;
  saving: boolean;
  createLaudo: () => Promise<string | null>;
  loadLaudo: (id: string) => Promise<void>;
  updateLaudo: (patch: Partial<LaudoPrev>) => void;
  updatePrevData: <K extends keyof PrevData>(group: K, patch: Partial<PrevData[K]>) => void;
  deleteLaudo: (id: string) => Promise<void>;
  flush: () => Promise<void>;
}

const LaudoPrevidenciarioContext = createContext<Ctx | undefined>(undefined);

// Whitelist: campos que a UI NUNCA pode alterar via patch
const FORBIDDEN_FIELDS: (keyof LaudoPrev)[] = [
  "id",
  "user_id",
  "tipo_laudo",
  "created_at",
];

export function LaudoPrevidenciarioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [laudo, setLaudo] = useState<LaudoPrev | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pendingPatchRef = useRef<Partial<LaudoPrev>>({});
  const saveTimerRef = useRef<number | null>(null);

  const persist = useCallback(async () => {
    if (!laudo) return;
    const patch = pendingPatchRef.current;
    if (!patch || Object.keys(patch).length === 0) return;

    pendingPatchRef.current = {};
    setSaving(true);
    try {
      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (!FORBIDDEN_FIELDS.includes(k as keyof LaudoPrev)) sanitized[k] = v;
      }
      const { error } = await supabase
        .from("laudos")
        .update(sanitized)
        .eq("id", laudo.id)
        .eq("tipo_laudo", "previdenciario" as any);
      if (error) throw error;
    } catch (err: any) {
      console.error("[LaudoPrev] save error:", err);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  }, [laudo]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persist();
    }, 800);
  }, [persist]);

  const flush = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persist();
  }, [persist]);

  const createLaudo = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      // Pré-preencher dados do perito a partir do profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome, email, crm, especialidade, telefone, endereco")
        .eq("id", user.id)
        .single();

      const { data, error } = await supabase
        .from("laudos")
        .insert({
          user_id: user.id,
          title: "Novo Laudo Previdenciário",
          tipo_laudo: "previdenciario" as any, // FORÇADO
          prev_data: getDefaultPrevData() as any,
          perito_nome: profile?.nome || "",
          perito_email: profile?.email || "",
          perito_crm: profile?.crm || "",
          perito_especialidade: profile?.especialidade || "",
          perito_telefone: profile?.telefone || "",
          perito_endereco: profile?.endereco || "",
        })
        .select()
        .single();

      if (error) throw error;
      return data?.id ?? null;
    } catch (err: any) {
      console.error("[LaudoPrev] create error:", err);
      toast({
        variant: "destructive",
        title: "Erro ao criar laudo",
        description: err.message,
      });
      return null;
    }
  }, [user]);

  const loadLaudo = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("laudos")
        .select("*")
        .eq("id", id)
        .eq("tipo_laudo", "previdenciario" as any)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setLaudo(null);
        toast({
          variant: "destructive",
          title: "Laudo não encontrado",
          description: "Este laudo não existe ou pertence a outro módulo.",
        });
        return;
      }

      const merged: LaudoPrev = {
        ...(data as any),
        prev_data: {
          ...getDefaultPrevData(),
          ...((data as any).prev_data || {}),
        },
      };
      setLaudo(merged);
    } catch (err: any) {
      console.error("[LaudoPrev] load error:", err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar laudo",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLaudo = useCallback(
    (patch: Partial<LaudoPrev>) => {
      setLaudo((cur) => {
        if (!cur) return cur;
        const sanitized: Partial<LaudoPrev> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (!FORBIDDEN_FIELDS.includes(k as keyof LaudoPrev)) {
            (sanitized as any)[k] = v;
          }
        }
        // acumula patch para o save debounced
        pendingPatchRef.current = {
          ...pendingPatchRef.current,
          ...sanitized,
        };
        return { ...cur, ...sanitized };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const updatePrevData = useCallback(
    <K extends keyof PrevData>(group: K, patch: Partial<PrevData[K]>) => {
      setLaudo((cur) => {
        if (!cur) return cur;
        const merged = mergePrevData(cur.prev_data, { [group]: patch } as Partial<PrevData>);
        pendingPatchRef.current = {
          ...pendingPatchRef.current,
          prev_data: merged,
        };
        return { ...cur, prev_data: merged };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const deleteLaudo = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("laudos")
      .delete()
      .eq("id", id)
      .eq("tipo_laudo", "previdenciario" as any);
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
      throw error;
    }
  }, []);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        void persist();
      }
    };
  }, [persist]);

  return (
    <LaudoPrevidenciarioContext.Provider
      value={{
        laudo,
        loading,
        saving,
        createLaudo,
        loadLaudo,
        updateLaudo,
        updatePrevData,
        deleteLaudo,
        flush,
      }}
    >
      {children}
    </LaudoPrevidenciarioContext.Provider>
  );
}

export function useLaudoPrev() {
  const ctx = useContext(LaudoPrevidenciarioContext);
  if (!ctx) {
    throw new Error("useLaudoPrev must be used within LaudoPrevidenciarioProvider");
  }
  return ctx;
}
