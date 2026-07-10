import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";

interface ProfileData {
  nome: string;
  email: string;
  crm: string | null;
  especialidade: string | null;
  telefone: string | null;
  endereco: string | null;
  user_id: string | null;
  avatar_url: string | null;
}

interface UserRole {
  role: 'admin' | 'user';
}

interface ImpersonationInfo {
  byUserId: string;
  byName: string;
  byUserIdCode: string;
  at: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  profile: ProfileData | null;
  userRole: 'admin' | 'user' | null;
  isAdmin: boolean;
  isImpersonating: boolean;
  impersonatedBy: ImpersonationInfo | null;
  login: (identifier: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Flags para evitar chamadas duplicadas
  const initialLoadDoneRef = useRef(false);
  const isLoadingUserDataRef = useRef(false);
  const loadedUserIdRef = useRef<string | null>(null);
  const impersonationLogInsertedRef = useRef<string | null>(null);

  useEffect(() => {
    // Timeout de segurança para evitar loading infinito (10 segundos)
    const PROFILE_LOAD_TIMEOUT = 10000;

    // Função centralizada para carregar dados do usuário
    const loadUserData = async (session: Session) => {
      // Evitar chamadas duplicadas
      if (isLoadingUserDataRef.current) return;
      isLoadingUserDataRef.current = true;

      // Se a sessão for impersonada, registrar UMA vez em access_logs
      // com event_type='impersonation_login' — nunca 'login'.
      const storedImpersonationMeta = (() => {
        if (typeof window === "undefined") return null;
        try {
          const raw = window.sessionStorage.getItem("lovable_impersonation_meta");
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
      const meta: any = {
        ...(session.user.user_metadata ?? {}),
        ...(storedImpersonationMeta ?? {}),
      };
      if (meta.impersonated_by && impersonationLogInsertedRef.current !== session.user.id) {
        impersonationLogInsertedRef.current = session.user.id;
        (supabase.from("access_logs") as any).insert({
          user_id: session.user.id,
          event_type: "impersonation_login",
          metadata: {
            method: "dev_impersonation",
            impersonated_by_user_id: meta.impersonated_by,
            impersonated_by_name: meta.impersonated_by_name ?? null,
            impersonated_by_user_id_code: meta.impersonated_by_user_id ?? null,
            impersonated_at: meta.impersonated_at ?? null,
          },
        }).then(() => {}, () => {});
      }

      // Timeout de segurança
      const timeoutId = setTimeout(() => {
        if (isLoadingUserDataRef.current) {
          console.error("Timeout ao carregar perfil - forçando fim do loading");
          isLoadingUserDataRef.current = false;
          setLoading(false);
          toast({
            variant: "destructive",
            title: "Erro ao carregar perfil",
            description: "Tempo esgotado. Tente recarregar a página.",
          });
        }
      }, PROFILE_LOAD_TIMEOUT);

      try {
        const [profileResult, roleResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("nome, email, crm, especialidade, telefone, endereco, user_id, avatar_url")
            .eq("id", session.user.id)
            .single(),
          supabase.rpc("is_admin"),
        ]);

        clearTimeout(timeoutId);

        // Verificar se houve erro de rede/RLS vs perfil realmente inexistente
        if (profileResult.error) {
          const errorCode = profileResult.error.code;
          const isTransientError = errorCode === 'PGRST301' || errorCode === '42501' || 
                                   profileResult.error.message?.includes('network') ||
                                   profileResult.error.message?.includes('fetch');
          
          if (isTransientError) {
            // Erro transitório - não deslogar, apenas avisar
            console.warn("Erro transitório ao carregar perfil:", profileResult.error);
            toast({
              variant: "destructive",
              title: "Erro ao carregar perfil",
              description: "Problema de conexão. Tente recarregar a página.",
            });
            isLoadingUserDataRef.current = false;
            setLoading(false);
            return;
          }
        }

        // Perfil realmente não existe (PGRST116 = no rows returned)
        if (!profileResult.data) {
          console.error("Usuário autenticado sem perfil válido - fazendo logout");
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Conta inválida",
            description: "Esta conta não possui um perfil válido. Entre em contato com o suporte.",
          });
          setSession(null);
          setUser(null);
          setProfile(null);
          setUserRole(null);
          loadedUserIdRef.current = null;
          isLoadingUserDataRef.current = false;
          setLoading(false);
          return;
        }

        const profileData = profileResult.data;
        // Sincronizar email se houver diferença entre Auth e profiles
        if (session.user.email && profileData.email !== session.user.email) {
          // Atualizar no banco em background (não bloquear)
          supabase.from("profiles").update({ email: session.user.email }).eq("id", session.user.id);
          profileData.email = session.user.email;
        }
        setProfile(profileData);
        setUserRole(roleResult.data ? "admin" : "user");
        loadedUserIdRef.current = session.user.id;
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Erro ao carregar dados do usuário:", error);
        toast({
          variant: "destructive",
          title: "Erro ao carregar perfil",
          description: "Não foi possível carregar seus dados. Tente recarregar.",
        });
      } finally {
        isLoadingUserDataRef.current = false;
        setLoading(false);
      }
    };

    // Setup auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignorar durante o carregamento inicial para evitar chamadas duplicadas
      if (!initialLoadDoneRef.current && event === "INITIAL_SESSION") {
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Evita piscadas: só entra em modo "loading" quando realmente precisa carregar perfil
        if (!isLoadingUserDataRef.current && loadedUserIdRef.current !== session.user.id) {
          setLoading(true);
          loadedUserIdRef.current = null;
          loadUserData(session);
        }
      } else {
        loadedUserIdRef.current = null;
        setProfile(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    // Check for existing session (carregamento inicial)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      initialLoadDoneRef.current = true;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Garantir que o app não tente renderizar rotas protegidas antes do perfil
        setLoading(true);
        loadedUserIdRef.current = null;
        await loadUserData(session);
      } else {
        loadedUserIdRef.current = null;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signup = async (email: string, password: string, fullName: string): Promise<boolean> => {
    try {
      const redirectUrl = `${window.location.origin}/dashboard`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          },
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro no cadastro",
          description: error.message
        });
        return false;
      }

      if (data.user) {
        toast({
          title: "Cadastro realizado!",
          description: "Você já pode fazer login no sistema."
        });
        return true;
      }

      return false;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao cadastrar. Tente novamente."
      });
      return false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('nome, email, crm, especialidade, telefone, endereco, user_id, avatar_url')
        .eq('id', user.id)
        .single();
      if (data) {
        setProfile(data);
      }
    }
  };

  const login = async (identifier: string, password: string): Promise<boolean> => {
    try {
      let emailToUse = identifier;
      
      // Se não contém @, buscar email pelo user_id via RPC (permite acesso sem autenticação)
      if (!identifier.includes('@')) {
        const { data: emailData, error: rpcError } = await supabase.rpc(
          'get_email_by_user_id' as any, 
          { p_user_id: identifier }
        );
        
        if (rpcError || !emailData) {
          toast({
            variant: "destructive",
            title: "ID não encontrado",
            description: "Verifique o ID informado e tente novamente."
          });
          return false;
        }
        emailToUse = emailData as string;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro de autenticação",
          description: error.message
        });
        return false;
      }

      if (data.user) {
        // Fire-and-forget: registrar acesso sem bloquear login
        (supabase.from('access_logs') as any).insert({
          user_id: data.user.id,
          event_type: 'login',
          metadata: { method: identifier.includes('@') ? 'email' : 'user_id' }
        }).then(() => {});

        // Navegação controlada pelo Login.tsx via useEffect
        return true;
      }

      return false;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao fazer login. Tente novamente."
      });
      return false;
    }
  };

  const logout = async () => {
    // Marcar offline ANTES do signOut (enquanto JWT ainda é válido)
    // Mas apenas se NÃO for sessão impersonada (não queremos mexer
    // no presence do cliente ao dev encerrar a impersonation).
    const impersonating =
      !!(user?.user_metadata as any)?.impersonated_by ||
      (typeof window !== "undefined" &&
        window.sessionStorage.getItem("lovable_impersonation_active") === "1");
    if (user && !impersonating) {
      await (supabase.from("user_presence") as any).update({
        is_online: false,
        last_seen_at: new Date().toISOString(),
      }).eq("user_id", user.id);
    }
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setUserRole(null);
    // Se era aba de impersonation, limpa o flag e fecha a aba
    if (impersonating) {
      window.sessionStorage.removeItem("lovable_impersonation_active");
      window.sessionStorage.removeItem("lovable_impersonation_meta");
      // Tenta fechar; se o browser bloquear, cai para navigate
      window.close();
    }
    navigate("/");
  };

  const storedImpersonationMeta = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem("lovable_impersonation_meta");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const impersonationMeta = {
    ...((user?.user_metadata as any) ?? {}),
    ...(storedImpersonationMeta ?? {}),
  };
  const impersonatedBy: ImpersonationInfo | null = impersonationMeta.impersonated_by
    ? {
        byUserId: String(impersonationMeta.impersonated_by),
        byName: String(impersonationMeta.impersonated_by_name ?? "Dev"),
        byUserIdCode: String(impersonationMeta.impersonated_by_user_id ?? ""),
        at: String(impersonationMeta.impersonated_at ?? ""),
      }
    : null;

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated: !!session, 
        user, 
        session, 
        profile, 
        userRole,
        isAdmin: userRole === 'admin',
        isImpersonating: !!impersonatedBy,
        impersonatedBy,
        login, 
        signup, 
        logout,
        refreshProfile,
        loading 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
