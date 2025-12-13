import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Sparkles,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ImportarAutosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExtractedData {
  vitima: {
    nome: string;
    cpf: string;
    data_nascimento: string;
    profissao: string;
    escolaridade: string;
  };
  processo: {
    numero: string;
    vara: string;
    reclamante: string;
    reclamada: string;
  };
  acidente: {
    data: string;
    descricao: string;
    local: string;
  };
  informacoes_medicas: {
    cids_mencionados: string[];
    lesoes: string;
    tratamentos: string;
    afastamentos: string;
  };
  documentos_mencionados: string[];
  resumo: string;
}

type ProcessingStep = "idle" | "uploading" | "analyzing" | "preview" | "creating";

export function ImportarAutosDialog({ open, onOpenChange }: ImportarAutosDialogProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [usedModel, setUsedModel] = useState<string>("");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFile = droppedFiles.find(file => file.type === "application/pdf");

    if (!pdfFile) {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Apenas arquivos PDF são aceitos.",
      });
      return;
    }

    if (pdfFile.size > 20 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 20MB.",
      });
      return;
    }

    setSelectedFile(pdfFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Apenas arquivos PDF são aceitos.",
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 20MB.",
      });
      return;
    }

    setSelectedFile(file);
  };

  const processFile = async () => {
    if (!selectedFile || !user) return;

    try {
      // Step 1: Upload to storage
      setProcessingStep("uploading");
      setUploadProgress(0);

      const filePath = `${user.id}/${Date.now()}-${selectedFile.name}`;
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from('processos-pdf')
        .upload(filePath, selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Falha ao enviar arquivo');
      }

      // Step 2: Convert to base64 and send to edge function
      setProcessingStep("analyzing");

      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      const { data: functionData, error: functionError } = await supabase.functions.invoke('processar-autos', {
        body: { 
          pdfBase64: base64,
          fileName: selectedFile.name
        }
      });

      if (functionError) {
        console.error('Function error:', functionError);
        throw new Error('Falha ao processar documento com IA');
      }

      if (!functionData.success) {
        throw new Error(functionData.error || 'Erro ao extrair dados');
      }

      setExtractedData(functionData.data);
      setUsedModel(functionData.model);
      setProcessingStep("preview");

    } catch (error) {
      console.error('Processing error:', error);
      toast({
        variant: "destructive",
        title: "Erro no processamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setProcessingStep("idle");
    }
  };

  const createLaudo = async () => {
    if (!extractedData || !user) return;

    try {
      setProcessingStep("creating");

      const laudoData = {
        user_id: user.id,
        title: extractedData.vitima.nome 
          ? `Laudo - ${extractedData.vitima.nome}` 
          : `Laudo - Processo ${extractedData.processo.numero || 'Novo'}`,
        // Dados do perito (do perfil)
        perito_nome: profile?.nome || '',
        perito_crm: profile?.crm || '',
        perito_especialidade: profile?.especialidade || '',
        perito_email: profile?.email || '',
        perito_telefone: profile?.telefone || '',
        perito_endereco: profile?.endereco || '',
        // Dados do processo
        processo_numero: extractedData.processo.numero || '',
        processo_vara: extractedData.processo.vara || '',
        reclamante: extractedData.processo.reclamante || '',
        reclamada: extractedData.processo.reclamada || '',
        // Dados da vítima
        vitima_nome: extractedData.vitima.nome || '',
        vitima_profissao: extractedData.vitima.profissao || '',
        vitima_escolaridade: extractedData.vitima.escolaridade || '',
        vitima_nascimento: extractedData.vitima.data_nascimento || null,
        // Dados do acidente
        data_acidente: extractedData.acidente.data || null,
        historia_acidente: extractedData.acidente.descricao || '',
        // Informações médicas
        tratamentos: extractedData.informacoes_medicas.tratamentos || '',
        afastamentos: extractedData.informacoes_medicas.afastamentos || '',
        conclusao_cid: extractedData.informacoes_medicas.cids_mencionados?.join(', ') || '',
        // Resumo nas anotações
        anotacoes: extractedData.resumo ? `[Resumo extraído automaticamente]\n${extractedData.resumo}` : '',
        status: 'rascunho'
      };

      const { data: newLaudo, error } = await supabase
        .from('laudos')
        .insert(laudoData)
        .select()
        .single();

      if (error) {
        console.error('Error creating laudo:', error);
        throw new Error('Falha ao criar laudo');
      }

      toast({
        title: "Laudo criado com sucesso!",
        description: "Os dados foram importados automaticamente.",
      });

      handleClose();
      navigate(`/laudo/${newLaudo.id}`);

    } catch (error) {
      console.error('Error creating laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao criar laudo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setProcessingStep("preview");
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setProcessingStep("idle");
    setUploadProgress(0);
    setExtractedData(null);
    setUsedModel("");
    onOpenChange(false);
  };

  const renderPreview = () => {
    if (!extractedData) return null;

    return (
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Processado com {usedModel}
        </div>

        {/* Dados da Vítima */}
        {(extractedData.vitima.nome || extractedData.vitima.cpf) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Vítima/Periciando</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {extractedData.vitima.nome && (
                <div><span className="text-muted-foreground">Nome:</span> {extractedData.vitima.nome}</div>
              )}
              {extractedData.vitima.cpf && (
                <div><span className="text-muted-foreground">CPF:</span> {extractedData.vitima.cpf}</div>
              )}
              {extractedData.vitima.profissao && (
                <div><span className="text-muted-foreground">Profissão:</span> {extractedData.vitima.profissao}</div>
              )}
              {extractedData.vitima.data_nascimento && (
                <div><span className="text-muted-foreground">Nascimento:</span> {extractedData.vitima.data_nascimento}</div>
              )}
            </div>
          </div>
        )}

        {/* Dados do Processo */}
        {(extractedData.processo.numero || extractedData.processo.vara) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Processo</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {extractedData.processo.numero && (
                <div><span className="text-muted-foreground">Número:</span> {extractedData.processo.numero}</div>
              )}
              {extractedData.processo.vara && (
                <div><span className="text-muted-foreground">Vara:</span> {extractedData.processo.vara}</div>
              )}
              {extractedData.processo.reclamante && (
                <div className="col-span-2"><span className="text-muted-foreground">Reclamante:</span> {extractedData.processo.reclamante}</div>
              )}
              {extractedData.processo.reclamada && (
                <div className="col-span-2"><span className="text-muted-foreground">Reclamada:</span> {extractedData.processo.reclamada}</div>
              )}
            </div>
          </div>
        )}

        {/* Dados do Acidente */}
        {(extractedData.acidente.data || extractedData.acidente.descricao) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Acidente</h4>
            <div className="space-y-1 text-sm">
              {extractedData.acidente.data && (
                <div><span className="text-muted-foreground">Data:</span> {extractedData.acidente.data}</div>
              )}
              {extractedData.acidente.descricao && (
                <div><span className="text-muted-foreground">Descrição:</span> {extractedData.acidente.descricao}</div>
              )}
            </div>
          </div>
        )}

        {/* CIDs */}
        {extractedData.informacoes_medicas.cids_mencionados?.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">CIDs Mencionados</h4>
            <div className="flex flex-wrap gap-1">
              {extractedData.informacoes_medicas.cids_mencionados.map((cid, i) => (
                <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  {cid}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Resumo */}
        {extractedData.resumo && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Resumo</h4>
            <p className="text-sm text-muted-foreground">{extractedData.resumo}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Autos do Processo
          </DialogTitle>
          <DialogDescription>
            {processingStep === "preview" 
              ? "Revise os dados extraídos antes de criar o laudo."
              : "Faça upload do PDF para extrair informações automaticamente com IA."}
          </DialogDescription>
        </DialogHeader>

        {/* Idle/Upload State */}
        {(processingStep === "idle" || processingStep === "uploading") && (
          <>
            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
                selectedFile && "border-primary bg-primary/5"
              )}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={processingStep !== "idle"}
              />
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "h-14 w-14 rounded-full flex items-center justify-center transition-colors",
                  isDragging || selectedFile ? "bg-primary/20" : "bg-muted"
                )}>
                  {selectedFile ? (
                    <FileText className="h-6 w-6 text-primary" />
                  ) : (
                    <Upload className={cn(
                      "h-6 w-6 transition-colors",
                      isDragging ? "text-primary" : "text-muted-foreground"
                    )} />
                  )}
                </div>
                {selectedFile ? (
                  <div>
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-foreground">Arraste o PDF aqui</p>
                    <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Upload Progress */}
            {processingStep === "uploading" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando arquivo...
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </>
        )}

        {/* Analyzing State */}
        {processingStep === "analyzing" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-medium">Analisando documento com IA...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Extraindo informações do processo
              </p>
            </div>
          </div>
        )}

        {/* Preview State */}
        {processingStep === "preview" && renderPreview()}

        {/* Creating State */}
        {processingStep === "creating" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="font-medium">Criando laudo...</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={processingStep === "creating"}>
            Cancelar
          </Button>
          
          {processingStep === "idle" && (
            <Button onClick={processFile} disabled={!selectedFile}>
              <Sparkles className="mr-2 h-4 w-4" />
              Processar com IA
            </Button>
          )}

          {processingStep === "preview" && (
            <Button onClick={createLaudo}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Criar Laudo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
