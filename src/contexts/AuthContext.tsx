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
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  profile: ProfileData | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Setup auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load profile when user logs in
        if (session?.user) {
          setTimeout(async () => {
            const { data } = await supabase
              .from('profiles')
              .select('nome, email, crm, especialidade, telefone, endereco')
              .eq('id', session.user.id)
              .single();
            
            if (data) {
              setProfile(data);
            }
          }, 0);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        supabase
          .from('profiles')
          .select('nome, email, crm, especialidade, telefone, endereco')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setProfile(data);
            }
          });
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

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
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
    navigate("/");
  };

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated: !!session, 
        user, 
        session, 
        profile, 
        login, 
        signup, 
        logout,
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
