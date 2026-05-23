import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, ArrowLeft, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function PrevidenciarioHome() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Módulo Previdenciário</h1>
              <p className="text-xs text-muted-foreground">Perícias do INSS/BPC/LOAS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/hub")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Trocar módulo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-16">
        <Card>
          <CardContent className="p-12 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
              <Wrench className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Módulo em construção</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              O módulo de Perícia Previdenciária está sendo desenvolvido. Em breve você
              poderá gerenciar laudos previdenciários nesta área.
            </p>
            <Button onClick={() => navigate("/hub")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Voltar para o Hub
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
