import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Scale, 
  Save,
  Copy,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Loader2,
  Trash2,
  FileUp,
  FileText
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LaudoSelector } from "@/components/impugnacao/LaudoSelector";
import { ImpugnacaoHistorico } from "@/components/impugnacao/ImpugnacaoHistorico";
import { generateImpugnacaoPDF } from "@/utils/generateImpugnacaoPDF";

interface Quesito {
  id: string;
  numero: number;
  texto: string;
  resposta: string;
  status: "pendente" | "respondido";
  gerado_por_ia?: boolean;
}

interface Laudo {
  id: string;
  title: string;
  vitima_nome: string | null;
  processo_numero: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  conclusao_analise: string | null;
}

interface Impugnacao {
  id: string;
  laudo_id: string | null;
  processo_numero: string | null;
  quesitos: Quesito[] | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  laudos?: {
    vitima_nome: string | null;
    title: string;
  } | null;
}

export default function Impugnacao() {
  const { user } = useAuth();
  const [impugnacaoId, setImpugnacaoId] = useState<string | null>(null);
  const [selectedLaudo, setSelectedLaudo] = useState<Laudo | null>(null);
  const [quesitos, setQuesitos] = useState<Quesito[]>([
    {
      id: "1",
      numero: 1,
      texto: "",
      resposta: "",
      status: "pendente"
    }
  ]);
  const [selectedQuesito, setSelectedQuesito] = useState<string>("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isImportingPDF, setIsImportingPDF] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save debounce
  const debouncedSave = useCallback(
    debounce(() => {
      if (hasUnsavedChanges && user) {
        handleSave(true);
      }
    }, 3000),
    [hasUnsavedChanges, user, selectedLaudo, quesitos, impugnacaoId]
  );

  useEffect(() => {
    if (hasUnsavedChanges) {
      debouncedSave();
    }
  }, [hasUnsavedChanges, debouncedSave]);

  const handleLaudoSelect = (laudo: Laudo | null) => {
    setSelectedLaudo(laudo);
    setHasUnsavedChanges(true);
  };

  const handleQuesitoChange = (id: string, field: "texto" | "resposta", value: string) => {
    setQuesitos(prev => prev.map(q => 
      q.id === id 
        ? { 
            ...q, 
            [field]: value, 
            status: field === "resposta" && value.trim() ? "respondido" : q.status 
          }
        : q
    ));
    setHasUnsavedChanges(true);
  };

  const handleAddQuesito = () => {
    const newId = Date.now().toString();
    const newNumero = quesitos.length + 1;
    setQuesitos([...quesitos, {
      id: newId,
      numero: newNumero,
      texto: "",
      resposta: "",
      status: "pendente"
    }]);
    setSelectedQuesito(newId);
    setHasUnsavedChanges(true);
  };

  const handleRemoveQuesito = (id: string) => {
    if (quesitos.length <= 1) {
      toast({
        title: "Ação não permitida",
        description: "Deve haver pelo menos um quesito.",
        variant: "destructive"
      });
      return;
    }

    const index = quesitos.findIndex(q => q.id === id);
    const newQuesitos = quesitos
      .filter(q => q.id !== id)
      .map((q, i) => ({ ...q, numero: i + 1 }));
    
    setQuesitos(newQuesitos);
    
    // Se removeu o selecionado, selecionar o anterior ou primeiro
    if (selectedQuesito === id) {
      const newIndex = Math.max(0, index - 1);
      setSelectedQuesito(newQuesitos[newIndex]?.id || newQuesitos[0]?.id);
    }
    
    setHasUnsavedChanges(true);
  };

  // Sanitize filename for Supabase Storage (remove accents and special characters)
  const sanitizeFileName = (name: string): string => {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9._-]/g, "_"); // Replace invalid chars with underscores
  };

  // PDF Import handler
  const handleImportPDF = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Selecione um arquivo PDF.",
        variant: "destructive"
      });
      return;
    }

    // Check size (50MB limit for Mistral OCR)
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > 50) {
      toast({
        title: "Arquivo muito grande",
        description: `O PDF tem ${sizeMB.toFixed(1)}MB. Limite: 50MB.`,
        variant: "destructive"
      });
      return;
    }

    setIsImportingPDF(true);
    const startTime = Date.now();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;

      if (!token || !userId) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      // Upload to storage (isolated path for impugnações)
      const timestamp = Date.now();
      const safeFileName = sanitizeFileName(file.name);
      const filePath = `${userId}/impugnacoes/${timestamp}-${safeFileName}`;

      toast({
        title: "Enviando PDF...",
        description: `${file.name} (${sizeMB.toFixed(1)}MB)`,
      });

      const { error: uploadError } = await supabase.storage
        .from("processos-pdf")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Call extraction edge function
      toast({
        title: "Extraindo texto do PDF...",
        description: "Isso pode levar alguns segundos.",
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extrair-texto-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ filePath })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao extrair texto do PDF");
      }

      const data = await response.json();
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // Insert extracted text into current quesito
      handleQuesitoChange(selectedQuesito, "texto", data.texto);

      toast({
        title: "PDF importado com sucesso!",
        description: `${data.pageCount} páginas extraídas em ${durationSec}s via ${data.provider}.`,
      });

    } catch (error) {
      console.error("[ImportPDF] Error:", error);
      toast({
        title: "Erro ao importar PDF",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsImportingPDF(false);
    }
  };

  const handleGenerateResponse = async () => {
    const currentQuesito = quesitos.find(q => q.id === selectedQuesito);
    
    if (!currentQuesito?.texto.trim()) {
      toast({
        title: "Quesito vazio",
        description: "Digite o texto do quesito antes de gerar a resposta.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedLaudo) {
      toast({
        title: "Laudo não selecionado",
        description: "Selecione o laudo vinculado à impugnação.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-resposta-impugnacao`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            laudo_id: selectedLaudo.id,
            quesito_texto: currentQuesito.texto,
            quesito_numero: currentQuesito.numero
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao gerar resposta");
      }

      const data = await response.json();
      
      setQuesitos(prev => prev.map(q => 
        q.id === selectedQuesito 
          ? { ...q, resposta: data.resposta, status: "respondido", gerado_por_ia: true }
          : q
      ));
      
      setHasUnsavedChanges(true);
      
      toast({
        title: "Resposta gerada",
        description: `Resposta fundamentada no laudo de ${data.laudo_info?.vitima_nome || "N/A"}.`,
      });
    } catch (error) {
      console.error("Erro ao gerar resposta:", error);
      toast({
        title: "Erro ao gerar resposta",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (silent = false) => {
    if (!user) {
      toast({
        title: "Não autenticado",
        description: "Faça login para salvar.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const respondidos = quesitos.filter(q => q.status === "respondido").length;
      const status = respondidos === quesitos.length && quesitos.length > 0 ? "respondido" : "pendente";

      // Cast quesitos to JSON-compatible type for Supabase
      const quesitosJson = quesitos.map(q => ({
        id: q.id,
        numero: q.numero,
        texto: q.texto,
        resposta: q.resposta,
        status: q.status,
        gerado_por_ia: q.gerado_por_ia || false
      }));

      if (impugnacaoId) {
        // Update existing
        const { error } = await supabase
          .from("impugnacoes")
          .update({
            laudo_id: selectedLaudo?.id || null,
            processo_numero: selectedLaudo?.processo_numero || null,
            quesitos: quesitosJson,
            status
          })
          .eq("id", impugnacaoId);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("impugnacoes")
          .insert({
            user_id: user.id,
            laudo_id: selectedLaudo?.id || null,
            processo_numero: selectedLaudo?.processo_numero || null,
            quesitos: quesitosJson,
            status
          })
          .select("id")
          .single();

        if (error) throw error;
        setImpugnacaoId(data.id);
      }

      setHasUnsavedChanges(false);
      
      if (!silent) {
        toast({
          title: "Salvo com sucesso",
          description: "Suas respostas foram salvas na nuvem.",
        });
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      if (!silent) {
        toast({
          title: "Erro ao salvar",
          description: error instanceof Error ? error.message : "Tente novamente.",
          variant: "destructive"
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadImpugnacao = (imp: Impugnacao) => {
    setImpugnacaoId(imp.id);
    
    // Load laudo if exists
    if (imp.laudo_id && imp.laudos) {
      setSelectedLaudo({
        id: imp.laudo_id,
        title: imp.laudos.title,
        vitima_nome: imp.laudos.vitima_nome,
        processo_numero: imp.processo_numero,
        status: null,
        created_at: null,
        updated_at: null,
        conclusao_analise: null
      });
    } else {
      setSelectedLaudo(null);
    }

    // Load quesitos
    if (imp.quesitos && Array.isArray(imp.quesitos) && imp.quesitos.length > 0) {
      setQuesitos(imp.quesitos);
      setSelectedQuesito(imp.quesitos[0].id);
    } else {
      setQuesitos([{
        id: "1",
        numero: 1,
        texto: "",
        resposta: "",
        status: "pendente"
      }]);
      setSelectedQuesito("1");
    }

    setHasUnsavedChanges(false);
  };

  const handleNewImpugnacao = () => {
    setImpugnacaoId(null);
    setSelectedLaudo(null);
    setQuesitos([{
      id: "1",
      numero: 1,
      texto: "",
      resposta: "",
      status: "pendente"
    }]);
    setSelectedQuesito("1");
    setHasUnsavedChanges(false);
  };

  const handleCopyAll = () => {
    const allResponses = quesitos
      .map(q => `QUESITO ${q.numero}:\n${q.texto || "(Sem texto)"}\n\nRESPOSTA:\n${q.resposta || "(Não respondido)"}\n`)
      .join("\n" + "—".repeat(50) + "\n\n");
    
    navigator.clipboard.writeText(allResponses);
    toast({
      title: "Copiado",
      description: "Todas as respostas foram copiadas para a área de transferência.",
    });
  };

  const handleGeneratePDF = async () => {
    if (!selectedLaudo) {
      toast({
        title: "Selecione um laudo",
        description: "Vincule o laudo original antes de gerar o PDF.",
        variant: "destructive"
      });
      return;
    }

    const respondidos = quesitos.filter(q => q.status === "respondido" && q.resposta.trim());
    
    if (respondidos.length === 0) {
      toast({
        title: "Nenhum quesito respondido",
        description: "Responda pelo menos um quesito antes de gerar o PDF.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingPDF(true);

    try {
      // Buscar dados completos do laudo
      const { data: laudoCompleto, error: laudoError } = await supabase
        .from("laudos")
        .select("*")
        .eq("id", selectedLaudo.id)
        .single();

      if (laudoError) throw laudoError;

      // Buscar dados do perfil do perito
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("nome, crm, especialidade, endereco")
        .eq("id", user?.id)
        .single();

      if (profileError) throw profileError;

      // Gerar PDF
      await generateImpugnacaoPDF({
        processoNumero: laudoCompleto.processo_numero || "",
        processoVara: laudoCompleto.processo_vara || "",
        reclamante: laudoCompleto.vitima_nome || laudoCompleto.reclamante || "",
        reclamada: laudoCompleto.reclamada || "",
        laudoData: laudoCompleto.created_at || "",
        laudoVitima: laudoCompleto.vitima_nome || "",
        laudoConclusao: laudoCompleto.conclusao_analise || "",
        quesitos: respondidos.map((q, i) => ({
          numero: i + 1,
          texto: q.texto,
          resposta: q.resposta
        })),
        peritoNome: profile?.nome || "",
        peritoCRM: profile?.crm || "",
        peritoEspecialidade: profile?.especialidade || "",
        peritoEndereco: profile?.endereco || ""
      });

      toast({
        title: "PDF gerado com sucesso!",
        description: "O documento foi baixado automaticamente."
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const respondidos = quesitos.filter(q => q.status === "respondido").length;
  const total = quesitos.length;
  const currentQuesito = quesitos.find(q => q.id === selectedQuesito);
  const hasRespondedQuesitos = quesitos.some(q => q.status === "respondido" && q.resposta.trim());

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
                Elabore respostas técnicas fundamentadas no laudo original
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              {respondidos}/{total} respondidos
            </Badge>
            <ImpugnacaoHistorico 
              onSelect={handleLoadImpugnacao}
              onNew={handleNewImpugnacao}
              currentImpugnacaoId={impugnacaoId}
            />
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar Tudo
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGeneratePDF}
              disabled={!hasRespondedQuesitos || isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {isGeneratingPDF ? "Gerando..." : "Gerar PDF"}
            </Button>
            <Button size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {hasUnsavedChanges ? "Salvar*" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Laudo + Quesitos List */}
        <div className="w-80 border-r border-border bg-muted/30 flex flex-col">
          {/* Laudo Selector */}
          <div className="p-4 border-b border-border">
            <LaudoSelector 
              selectedLaudo={selectedLaudo}
              onSelect={handleLaudoSelect}
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
                        {quesito.gerado_por_ia && (
                          <Sparkles className={`h-3 w-3 ml-1 ${
                            selectedQuesito === quesito.id 
                              ? "text-primary-foreground/70" 
                              : "text-blue-500"
                          }`} />
                        )}
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
          {currentQuesito && (
            <>
              {/* Quesito Header */}
              <div className="p-4 lg:p-6 border-b border-border bg-card">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="mt-0.5">
                      Quesito {currentQuesito.numero}
                    </Badge>
                    {quesitos.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveQuesito(currentQuesito.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-1">
                        <Textarea
                          value={currentQuesito.texto}
                          onChange={(e) => handleQuesitoChange(currentQuesito.id, "texto", e.target.value)}
                          placeholder="Digite o texto do quesito da impugnação ou importe um PDF..."
                          className="min-h-[80px] resize-y"
                          disabled={isImportingPDF}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isImportingPDF}
                          className="gap-1.5"
                        >
                          {isImportingPDF ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Importando...
                            </>
                          ) : (
                            <>
                              <FileUp className="h-4 w-4" />
                              Importar PDF
                            </>
                          )}
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handleImportPDF}
                          className="hidden"
                        />
                      </div>
                    </div>
                    {isImportingPDF && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Extraindo texto via OCR... Isso pode levar alguns segundos.
                      </div>
                    )}
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
                      disabled={isGenerating || !selectedLaudo}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      {isGenerating ? "Gerando..." : "Gerar com IA"}
                    </Button>
                  </div>
                  
                  {!selectedLaudo && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
                      Selecione o laudo vinculado para habilitar a geração automática de respostas.
                    </div>
                  )}
                  
                  <Textarea
                    value={currentQuesito.resposta}
                    onChange={(e) => handleQuesitoChange(currentQuesito.id, "resposta", e.target.value)}
                    placeholder="Digite sua resposta técnica ao quesito ou clique em 'Gerar com IA'..."
                    className="min-h-[300px] resize-none"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{currentQuesito.resposta?.length || 0} caracteres</span>
                  {currentQuesito.gerado_por_ia && (
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      Gerado por IA
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const currentIndex = quesitos.findIndex(q => q.id === selectedQuesito);
                      if (currentIndex > 0) {
                        setSelectedQuesito(quesitos[currentIndex - 1].id);
                      }
                    }}
                    disabled={quesitos.findIndex(q => q.id === selectedQuesito) === 0}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Quesito Anterior
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const currentIndex = quesitos.findIndex(q => q.id === selectedQuesito);
                      if (currentIndex < quesitos.length - 1) {
                        setSelectedQuesito(quesitos[currentIndex + 1].id);
                      }
                    }}
                    disabled={quesitos.findIndex(q => q.id === selectedQuesito) >= quesitos.length - 1}
                  >
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

// Utility function for debouncing
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
