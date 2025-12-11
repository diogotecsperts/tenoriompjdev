import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stethoscope, Lock, Mail, User, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailReadOnly, setEmailReadOnly] = useState(true);
  const [passwordReadOnly, setPasswordReadOnly] = useState(true);
  const { login, signup, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await login(email, password);
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName || fullName.trim().length < 3) {
      toast({
        variant: "destructive",
        title: "Nome inválido",
        description: "Por favor, insira seu nome completo.",
      });
      return;
    }

    setIsLoading(true);
    const success = await signup(email, password, fullName);
    setIsLoading(false);
    
    if (success) {
      setEmail("");
      setPassword("");
      setFullName("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Stethoscope className="mx-auto mb-4 h-12 w-12 animate-pulse text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border-[40px] border-primary-foreground" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full border-[60px] border-primary-foreground" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border-[30px] border-primary-foreground" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 text-primary-foreground">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-16 w-16 rounded-2xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center">
              <Stethoscope className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Tenório MPJ</h1>
              <p className="text-primary-foreground/80 text-sm">Médico Perito Judicial</p>
            </div>
          </div>
          
          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl font-bold leading-tight">
              Sistema completo para laudos periciais
            </h2>
            <p className="text-lg text-primary-foreground/80 leading-relaxed">
              Crie, gerencie e exporte laudos médicos periciais com eficiência e precisão profissional.
            </p>
            
            <div className="grid grid-cols-2 gap-4 pt-6">
              <div className="bg-primary-foreground/10 backdrop-blur rounded-xl p-4">
                <div className="text-3xl font-bold">100%</div>
                <div className="text-sm text-primary-foreground/70">Digital</div>
              </div>
              <div className="bg-primary-foreground/10 backdrop-blur rounded-xl p-4">
                <div className="text-3xl font-bold">Seguro</div>
                <div className="text-sm text-primary-foreground/70">Dados protegidos</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 bg-background">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary mb-4">
              <Stethoscope className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Tenório MPJ</h1>
            <p className="text-sm text-muted-foreground">Sistema de Laudos Periciais</p>
          </div>

          {/* Form Header */}
          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
            <p className="text-muted-foreground mt-1">
              Entre com suas credenciais para acessar o sistema
            </p>
          </div>

          <Card className="border-0 shadow-none lg:shadow-sm lg:border">
            <CardContent className="p-0 lg:p-6">
              <Tabs 
                defaultValue="login" 
                className="w-full"
                onValueChange={() => {
                  setEmailReadOnly(true);
                  setPasswordReadOnly(true);
                }}
              >
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar Conta</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          name="email-field"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onFocus={() => setEmailReadOnly(false)}
                          className="pl-10 h-11"
                          autoComplete="new-password"
                          readOnly={emailReadOnly}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Senha</Label>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => toast({
                            title: "Recuperação de senha",
                            description: "Entre em contato com o suporte para redefinir sua senha."
                          })}
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          name="password-field"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={() => setPasswordReadOnly(false)}
                          className="pl-10 pr-10 h-11"
                          autoComplete="new-password"
                          readOnly={passwordReadOnly}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading}>
                      {isLoading ? "Entrando..." : "Entrar"}
                    </Button>
                  </form>
                </TabsContent>
                
                <TabsContent value="signup" className="space-y-4">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome Completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          type="text"
                          name="name-field"
                          placeholder="Dr. Nome Completo"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          onFocus={() => setEmailReadOnly(false)}
                          className="pl-10 h-11"
                          autoComplete="new-password"
                          readOnly={emailReadOnly}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          name="email-field"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onFocus={() => setEmailReadOnly(false)}
                          className="pl-10 h-11"
                          autoComplete="new-password"
                          readOnly={emailReadOnly}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          name="password-field"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={() => setPasswordReadOnly(false)}
                          className="pl-10 pr-10 h-11"
                          autoComplete="new-password"
                          readOnly={passwordReadOnly}
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading}>
                      {isLoading ? "Criando conta..." : "Criar Conta"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
          {/* Footer */}
          <div className="mt-8 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Acesso restrito a profissionais autorizados
            </p>
            <p className="text-xs text-muted-foreground/60">
              by{" "}
              <a 
                href="https://tecsperts.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-muted-foreground transition-colors"
              >
                tecsperts
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
