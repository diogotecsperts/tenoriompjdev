import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  profile: ProfileData | null;
  userRole: 'admin' | 'user' | null;
  isAdmin: boolean;
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

  useEffect(() => {
    // Setup auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load profile and role when user logs in
        if (session?.user) {
          // Usar Promise.all para carregar profile e role em paralelo
          const loadUserData = async () => {
            const [profileResult, roleResult] = await Promise.all([
              supabase
                .from('profiles')
                .select('nome, email, crm, especialidade, telefone, endereco, user_id, avatar_url')
                .eq('id', session.user.id)
                .single(),
              supabase.rpc('is_admin')
            ]);
            
            // CRÍTICO: Verificar se o usuário tem perfil válido
            if (!profileResult.data) {
              console.error('Usuário autenticado sem perfil válido - fazendo logout');
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
              setLoading(false);
              return;
            }

            const profileData = profileResult.data;
            // Sincronizar email se houver diferença entre Auth e profiles
            if (session.user.email && profileData.email !== session.user.email) {
              // Atualizar no banco em background (não bloquear)
              supabase
                .from('profiles')
                .update({ email: session.user.email })
                .eq('id', session.user.id);
              profileData.email = session.user.email;
            }
            setProfile(profileData);

            setUserRole(roleResult.data ? 'admin' : 'user');
          };
          
          loadUserData();
        } else {
          setProfile(null);
          setUserRole(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('nome, email, crm, especialidade, telefone, endereco, user_id, avatar_url')
          .eq('id', session.user.id)
          .single();
        
        // CRÍTICO: Verificar se o usuário tem perfil válido
        if (!data) {
          console.error('Usuário autenticado sem perfil válido (getSession) - fazendo logout');
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
          setLoading(false);
          return;
        }

        // Sincronizar email se houver diferença entre Auth e profiles
        if (session.user.email && data.email !== session.user.email) {
          await supabase
            .from('profiles')
            .update({ email: session.user.email })
            .eq('id', session.user.id);
          data.email = session.user.email;
        }
        setProfile(data);

        // Fetch user role using is_admin RPC
        const { data: isAdminData } = await supabase.rpc('is_admin');
        setUserRole(isAdminData ? 'admin' : 'user');
      }
      
      setLoading(false);
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
        navigate("/dashboard");
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
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setUserRole(null);
    navigate("/");
  };

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated: !!session, 
        user, 
        session, 
        profile, 
        userRole,
        isAdmin: userRole === 'admin',
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
