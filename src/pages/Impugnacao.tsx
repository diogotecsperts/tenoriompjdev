import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Scale, 
  FileText, 
  Send, 
  Save,
  Copy,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Quesito {
  id: string;
  numero: number;
  texto: string;
  resposta: string;
  status: "pendente" | "respondido";
}

export default function Impugnacao() {
  const [processoNumero, setProcessoNumero] = useState("");
  const [impugnacaoTexto, setImpugnacaoTexto] = useState("");
  const [quesitos, setQuesitos] = useState<Quesito[]>([
    {
      id: "1",
      numero: 1,
      texto: "O reclamante apresenta sequelas decorrentes do acidente de trabalho noticiado nos autos?",
      resposta: "",
      status: "pendente"
    },
    {
      id: "2",
      numero: 2,
      texto: "Caso positivo, qual o grau de incapacidade funcional apresentado?",
      resposta: "",
      status: "pendente"
    },
    {
      id: "3",
      numero: 3,
      texto: "Há nexo causal entre o acidente e as lesões apresentadas?",
      resposta: "",
      status: "pendente"
    },
  ]);
  const [selectedQuesito, setSelectedQuesito] = useState<string>("1");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleQuesitoChange = (id: string, resposta: string) => {
    setQuesitos(prev => prev.map(q => 
      q.id === id 
        ? { ...q, resposta, status: resposta.trim() ? "respondido" : "pendente" }
        : q
    ));
  };

  const handleAddQuesito = () => {
    const newId = (quesitos.length + 1).toString();
    setQuesitos([...quesitos, {
      id: newId,
      numero: quesitos.length + 1,
      texto: "",
      resposta: "",
      status: "pendente"
    }]);
    setSelectedQuesito(newId);
  };

  const handleGenerateResponse = async () => {
    setIsGenerating(true);
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentQuesito = quesitos.find(q => q.id === selectedQuesito);
    if (currentQuesito) {
      const mockResponse = `Com base na análise técnica realizada e nos documentos constantes dos autos, em resposta ao quesito formulado, esclareço que:\n\nA perícia médica realizada constatou que o periciando apresenta condição clínica compatível com os fatos narrados na inicial, conforme detalhadamente exposto no laudo pericial.\n\nDesta forma, mantenho integralmente as conclusões apresentadas no laudo pericial, por estarem fundamentadas em critérios técnicos e científicos adequados.`;
      
      handleQuesitoChange(selectedQuesito, mockResponse);
    }
    
    setIsGenerating(false);
    toast({
      title: "Resposta gerada",
      description: "A resposta foi gerada com base no laudo pericial.",
    });
  };

  const handleSave = () => {
    toast({
      title: "Rascunho salvo",
      description: "Suas respostas foram salvas com sucesso.",
    });
  };

  const handleCopyAll = () => {
    const allResponses = quesitos
      .map(q => `Quesito ${q.numero}: ${q.texto}\n\nResposta: ${q.resposta || "(Não respondido)"}\n`)
      .join("\n" + "—".repeat(50) + "\n\n");
    
    navigator.clipboard.writeText(allResponses);
    toast({
      title: "Copiado",
      description: "Todas as respostas foram copiadas para a área de transferência.",
    });
  };

  const respondidos = quesitos.filter(q => q.status === "respondido").length;
  const total = quesitos.length;

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-border bg-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Scale className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Responder Impugnação</h1>
              <p className="text-sm text-muted-foreground">
                Elabore respostas técnicas aos quesitos impugnados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              {respondidos}/{total} respondidos
            </Badge>
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar Tudo
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Quesitos List */}
        <div className="w-80 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-4 border-b border-border">
            <Label htmlFor="processo">Nº do Processo</Label>
            <Input
              id="processo"
              value={processoNumero}
              onChange={(e) => setProcessoNumero(e.target.value)}
              placeholder="0000000-00.0000.0.00.0000"
              className="mt-1.5"
            />
          </div>
          
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">Quesitos da Impugnação</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddQuesito}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {quesitos.map((quesito) => (
                <button
                  key={quesito.id}
                  onClick={() => setSelectedQuesito(quesito.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedQuesito === quesito.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      selectedQuesito === quesito.id 
                        ? "bg-primary-foreground/20" 
                        : "bg-muted"
                    }`}>
                      {quesito.numero}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">
                        {quesito.texto || "(Quesito vazio)"}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5">
                        {quesito.status === "respondido" ? (
                          <CheckCircle2 className={`h-3 w-3 ${
                            selectedQuesito === quesito.id 
                              ? "text-primary-foreground/70" 
                              : "text-emerald-500"
                          }`} />
                        ) : (
                          <AlertTriangle className={`h-3 w-3 ${
                            selectedQuesito === quesito.id 
                              ? "text-primary-foreground/70" 
                              : "text-amber-500"
                          }`} />
                        )}
                        <span className={`text-xs ${
                          selectedQuesito === quesito.id 
                            ? "text-primary-foreground/70" 
                            : "text-muted-foreground"
                        }`}>
                          {quesito.status === "respondido" ? "Respondido" : "Pendente"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 ${
                      selectedQuesito === quesito.id 
                        ? "text-primary-foreground/50" 
                        : "text-muted-foreground/50"
                    }`} />
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Response Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {quesitos.find(q => q.id === selectedQuesito) && (
            <>
              {/* Quesito Header */}
              <div className="p-4 lg:p-6 border-b border-border bg-card">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5">
                    Quesito {quesitos.find(q => q.id === selectedQuesito)?.numero}
                  </Badge>
                  <div className="flex-1">
                    <Textarea
                      value={quesitos.find(q => q.id === selectedQuesito)?.texto || ""}
                      onChange={(e) => {
                        setQuesitos(prev => prev.map(q =>
                          q.id === selectedQuesito ? { ...q, texto: e.target.value } : q
                        ));
                      }}
                      placeholder="Digite o texto do quesito..."
                      className="min-h-[80px] resize-none bg-transparent border-0 p-0 focus-visible:ring-0 text-base"
                    />
                  </div>
                </div>
              </div>

              {/* Response Area */}
              <div className="flex-1 p-4 lg:p-6 overflow-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Resposta Técnica</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGenerateResponse}
                      disabled={isGenerating}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {isGenerating ? "Gerando..." : "Gerar com IA"}
                    </Button>
                  </div>
                  <Textarea
                    value={quesitos.find(q => q.id === selectedQuesito)?.resposta || ""}
                    onChange={(e) => handleQuesitoChange(selectedQuesito, e.target.value)}
                    placeholder="Digite sua resposta técnica ao quesito..."
                    className="min-h-[300px] resize-none"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {quesitos.find(q => q.id === selectedQuesito)?.resposta?.length || 0} caracteres
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    const current = quesitos.findIndex(q => q.id === selectedQuesito);
                    if (current < quesitos.length - 1) {
                      setSelectedQuesito(quesitos[current + 1].id);
                    }
                  }}>
                    Próximo Quesito
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
