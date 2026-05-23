import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Stethoscope,
  Scale,
  ShieldCheck,
  LogOut,
  Settings,
  Terminal,
  Lock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleCard {
  id: "trabalhista" | "previdenciario";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
}

const MODULES: ModuleCard[] = [
  {
    id: "trabalhista",
    title: "Perícia Trabalhista",
    description:
      "Sistema completo para laudos de perícia judicial trabalhista: anamnese, exame, nexo causal e exportação DOCX/PDF.",
    icon: Scale,
    route: "/dashboard",
  },
  {
    id: "previdenciario",
    title: "Perícia Previdenciária",
    description:
      "Módulo para laudos de perícia previdenciária (INSS, BPC/LOAS, aposentadoria por incapacidade).",
    icon: ShieldCheck,
    route: "/previdenciario",
  },
];

export default function Hub() {
  const { profile, user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const [{ data: mods }, { data: dev }] = await Promise.all([
        (supabase.from as any)("user_modules")
          .select("module, enabled")
          .eq("user_id", user.id)
          .eq("enabled", true),
        supabase.rpc("is_developer"),
      ]);
      const set = new Set<string>((mods ?? []).map((m: any) => m.module));
      // Admin/dev: liberar todos para navegar (ainda assim respeitando módulos)
      if (isAdmin || dev === true) {
        MODULES.forEach((m) => set.add(m.id));
      }
      setAllowed(set);
      setIsDeveloper(dev === true);
      setLoading(false);
    };
    load();
  }, [user, isAdmin]);

  const initials = profile?.nome
    ? profile.nome.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Tenório MPJ</h1>
              <p className="text-xs text-muted-foreground">Suíte de Perícias Judiciais</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:block mr-2">
              <p className="text-sm font-medium leading-tight">{profile?.nome}</p>
              <p className="text-xs text-muted-foreground leading-tight">
                {profile?.crm ? `CRM ${profile.crm}` : user?.email}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
              <Settings className="h-4 w-4" />
            </Button>
            {isDeveloper && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/dev-panel")}>
                <Terminal className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Bem-vindo(a){profile?.nome ? `, ${profile.nome.split(" ")[0]}` : ""}
          </h2>
          <p className="text-muted-foreground">
            Selecione o módulo de trabalho para iniciar uma nova perícia.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {MODULES.map((mod) => {
            const enabled = allowed.has(mod.id);
            const isPrev = mod.id === "previdenciario";
            const Icon = mod.icon;
            return (
              <Card
                key={mod.id}
                className={cn(
                  "transition-all border-2 h-full",
                  enabled
                    ? "hover:border-primary hover:shadow-lg cursor-pointer"
                    : "opacity-60 border-dashed cursor-not-allowed"
                )}
                onClick={() => enabled && navigate(mod.route)}
              >
                <CardContent className="p-8 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center",
                        isPrev
                          ? "bg-muted text-muted-foreground"
                          : enabled
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    {isPrev ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                        </span>
                        Em construção
                      </div>
                    ) : !enabled ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        <Lock className="h-3 w-3" />
                        Bloqueado
                      </div>
                    ) : null}
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    {mod.title}
                    {isPrev && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground align-middle">
                        (beta)
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">
                    {mod.description}
                  </p>
                  {enabled ? (
                    <Button className="w-full" variant={isPrev ? "secondary" : "default"}>
                      {isPrev ? "Acessar módulo (beta)" : "Acessar módulo"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      {isPrev ? "Módulo em construção" : "Solicite acesso ao administrador"}
                    </Button>
                  )}
                </CardContent>
              </Card>

            );
          })}
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4 border-t">
        Produto desenvolvido por{" "}
        <a
          href="https://nova.tecsperts.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline underline-offset-2"
        >
          Tecsperts tecnologia
        </a>
      </footer>
    </div>
  );
}
