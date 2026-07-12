import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Stethoscope, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function SolicitarCadastro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    nome_completo: "",
    login_desejado: "",
    email: "",
    medico_vinculado: "",
    informacoes_adicionais: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validação local
    if (form.nome_completo.trim().length < 3) {
      toast({ variant: "destructive", title: "Nome inválido", description: "Informe seu nome completo." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast({ variant: "destructive", title: "Email inválido", description: "Informe um email válido." });
      return;
    }
    if (form.medico_vinculado.trim().length < 2) {
      toast({ variant: "destructive", title: "Médico vinculado", description: "Informe o nome do médico vinculado." });
      return;
    }
    if (form.informacoes_adicionais.trim().length < 20) {
      toast({
        variant: "destructive",
        title: "Informações adicionais",
        description: "Descreva sua autorização de uso com pelo menos 20 caracteres.",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.functions.invoke("signup-request-create", { body: form });
    setLoading(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: "Tente novamente em alguns instantes.",
      });
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Solicitação enviada</h1>
            <p className="text-muted-foreground">
              Aguarde liberação e email com link para finalizar cadastro.
            </p>
            <Button className="w-full" onClick={() => navigate("/")}>
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="mb-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mb-3">
            <Stethoscope className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Solicitar novo cadastro</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha seus dados. Sua solicitação será analisada e você receberá um email com o link para finalizar o cadastro.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo *</Label>
                <Input
                  id="nome"
                  value={form.nome_completo}
                  onChange={(e) => setForm((f) => ({ ...f, nome_completo: e.target.value }))}
                  maxLength={200}
                  required
                  placeholder="Dr. Nome Sobrenome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login">Login desejado *</Label>
                <Input
                  id="login"
                  value={form.login_desejado}
                  onChange={(e) => setForm((f) => ({ ...f, login_desejado: e.target.value }))}
                  maxLength={60}
                  required
                  placeholder="Ex.: joao.silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  maxLength={255}
                  required
                  placeholder="seu@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medico">Nome do médico vinculado *</Label>
                <Input
                  id="medico"
                  value={form.medico_vinculado}
                  onChange={(e) => setForm((f) => ({ ...f, medico_vinculado: e.target.value }))}
                  maxLength={200}
                  required
                  placeholder="Dr. Nome do médico"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="info">Informações adicionais *</Label>
                <Textarea
                  id="info"
                  value={form.informacoes_adicionais}
                  onChange={(e) => setForm((f) => ({ ...f, informacoes_adicionais: e.target.value }))}
                  minLength={20}
                  maxLength={2000}
                  rows={6}
                  required
                  placeholder="Deixe mais informações sobre sua autorização de uso do app (cliente vinculado, motivo do acesso, etc.)"
                />
                <p className="text-xs text-muted-foreground">Mínimo 20 caracteres.</p>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? "Enviando..." : "Solicitar novo cadastro"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
