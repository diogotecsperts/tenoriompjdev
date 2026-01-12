import { useState, useCallback, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Sparkles,
  Eye,
  Cpu,
  Clock
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
    dominancia: string;
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
  documentos_checklist: {
    cat: boolean;
    prontuario: boolean;
    receitas: boolean;
    exames: boolean;
    laudos_anteriores: boolean;
    atestados: boolean;
    outros: string[];
  };
  historico: {
    historia_atual: string;
    historico_ocupacional: string;
    antecedentes_patologicos: string;
    tratamentos_realizados: string;
    afastamentos: string;
  };
  exame_clinico: {
    laudos_medicos: string;
    exames_complementares: string;
    lesoes_descritas: string;
  };
  informacoes_medicas: {
    cids_mencionados: string[];
    incapacidade_alegada: string;
    nexo_sugerido: string;
  };
  quesitos: {
    juizo: string;
    reclamante: string;
    reclamada: string;
  };
  textos_brutos: {
    peticao_inicial: string;
    contestacao: string;
  };
  resumos_ia: {
    resumo_peticao: string;
    resumo_contestacao: string;
    descricao_doencas: string;
    nexo_causal: string;
    incapacidade: string;
  };
  resumo: string;
}

interface AIConfigDisplay {
  provider: string;
  model: string;
}

interface AIUsageInfo {
  pdfExtraction: {
    provider: string;
    model: string;
    note?: string;
    durationMs?: number;
  };
  summaries: {
    provider: string;
    model: string;
    count: number;
    durationMs?: number;
  };
  totalDurationMs?: number;
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
  const [aiUsage, setAiUsage] = useState<AIUsageInfo | null>(null);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfigDisplay | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user is developer and fetch AI config
  useEffect(() => {
    const checkDeveloperAndFetchConfig = async () => {
      if (!user) return;

      try {
        // Check developer role
        const { data: devData } = await supabase.rpc("is_developer");
        setIsDeveloper(devData === true);

        // Fetch AI configuration from system_config
        const { data: configData } = await supabase
          .from('system_config')
          .select('id, value')
          .in('id', ['default_ai_provider', 'default_ai_model']);

        if (configData && configData.length > 0) {
          const config: Record<string, any> = {};
          configData.forEach(item => {
            config[item.id] = item.value;
          });
          
          const provider = config.default_ai_provider || 'lovable';
          const model = config.default_ai_model || 'google/gemini-2.5-flash';
          
          setAiConfig({ provider, model });
        }
      } catch (err) {
        console.error("Error checking developer role or AI config:", err);
      }
    };

    if (open) {
      checkDeveloperAndFetchConfig();
    }
  }, [user, open]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatProviderName = (provider: string) => {
    const names: Record<string, string> = {
      lovable: 'Lovable AI',
      gemini: 'Google Gemini',
      openai: 'OpenAI',
      claude: 'Anthropic Claude',
      groq: 'Groq',
      deepseek: 'DeepSeek',
      openrouter: 'OpenRouter'
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const formatModelName = (model: string) => {
    // Remove prefixes like "google/" for cleaner display
    return model.replace('google/', '').replace('openai/', '');
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
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

  const checkJobStatus = async (jobId: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-import-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ jobId }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao verificar status');
      }

      const data = await response.json();
      
      // Update UI with current progress
      setAnalysisStep(data.currentStep || 'Processando...');
      setAnalysisProgress(data.progress || 0);

      if (data.status === 'completed' && data.result) {
        // Success!
        setExtractedData(data.result.data);
        setAiUsage(data.result.aiUsage || null);
        setUsedModel(data.result.aiUsage?.pdfExtraction?.model || 'gemini-2.5-flash');
        setProcessingStep("preview");
        return true; // Stop polling
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Erro no processamento');
      }

      return false; // Continue polling
    } catch (error) {
      console.error('Polling error:', error);
      throw error;
    }
  };

  const processFile = async () => {
    if (!selectedFile || !user) return;

    try {
      // Step 1: Upload to storage
      setProcessingStep("uploading");
      setUploadProgress(0);

      const filePath = `${user.id}/${Date.now()}-${selectedFile.name}`;
      
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

      // Step 2: Convert to base64 and start async processing
      setProcessingStep("analyzing");
      setAnalysisStep("Convertendo documento...");
      setAnalysisProgress(0);

      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      setAnalysisStep("Iniciando análise com IA...");

      // Get session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      // Send to edge function (now returns immediately with jobId)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/processar-autos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ 
            pdfBase64: base64,
            fileName: selectedFile.name
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Function error:', errorText);
        throw new Error('Falha ao iniciar processamento');
      }

      const { jobId } = await response.json();
      console.log('Job started:', jobId);

      // Start polling for status
      setAnalysisStep("Processando documento...");

      pollingRef.current = setInterval(async () => {
        try {
          const isDone = await checkJobStatus(jobId);
          if (isDone && pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } catch (error) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          console.error('Processing error:', error);
          toast({
            variant: "destructive",
            title: "Erro no processamento",
            description: error instanceof Error ? error.message : "Erro desconhecido",
          });
          setProcessingStep("idle");
          setAnalysisStep("");
        }
      }, 3000); // Poll every 3 seconds

    } catch (error) {
      console.error('Processing error:', error);
      toast({
        variant: "destructive",
        title: "Erro no processamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setProcessingStep("idle");
      setAnalysisStep("");
    }
  };

  // Build documentos array from checklist
  const buildDocumentosArray = (checklist: ExtractedData['documentos_checklist']): string[] => {
    const docs: string[] = [];
    if (checklist.cat) docs.push('cat');
    if (checklist.prontuario) docs.push('prontuario');
    if (checklist.receitas) docs.push('receitas');
    if (checklist.exames) docs.push('exames');
    if (checklist.laudos_anteriores) docs.push('laudos_anteriores');
    if (checklist.atestados) docs.push('atestados');
    return docs;
  };

  const createLaudo = async () => {
    if (!extractedData || !user) return;

    try {
      setProcessingStep("creating");

      const documentosArray = buildDocumentosArray(extractedData.documentos_checklist);

      const laudoData = {
        user_id: user.id,
        title: extractedData.vitima.nome 
          ? `Laudo - ${extractedData.vitima.nome}` 
          : `Laudo - Processo ${extractedData.processo.numero || 'Novo'}`,
        
        perito_nome: profile?.nome || '',
        perito_crm: profile?.crm || '',
        perito_especialidade: profile?.especialidade || '',
        perito_email: profile?.email || '',
        perito_telefone: profile?.telefone || '',
        perito_endereco: profile?.endereco || '',
        
        processo_numero: extractedData.processo.numero || '',
        processo_vara: extractedData.processo.vara || '',
        reclamante: extractedData.processo.reclamante || '',
        reclamada: extractedData.processo.reclamada || '',
        
        vitima_nome: extractedData.vitima.nome || '',
        vitima_profissao: extractedData.vitima.profissao || '',
        vitima_escolaridade: extractedData.vitima.escolaridade || '',
        vitima_nascimento: extractedData.vitima.data_nascimento || null,
        vitima_dominancia: extractedData.vitima.dominancia || '',
        
        data_acidente: extractedData.acidente.data || null,
        historia_acidente: extractedData.acidente.descricao || '',
        
        documentos: documentosArray,
        
        historia_atual: extractedData.historico.historia_atual || '',
        historico_ocupacional: extractedData.historico.historico_ocupacional || '',
        antecedentes: extractedData.historico.antecedentes_patologicos || '',
        tratamentos: extractedData.historico.tratamentos_realizados || '',
        afastamentos: extractedData.historico.afastamentos || '',
        
        laudos_medicos: extractedData.exame_clinico.laudos_medicos || '',
        exames_complementares: extractedData.exame_clinico.exames_complementares || '',
        
        conclusao_cid: extractedData.informacoes_medicas.cids_mencionados?.join(', ') || '',
        conclusao_incapacidade: extractedData.informacoes_medicas.incapacidade_alegada || '',
        nexo_causal_tipo: extractedData.informacoes_medicas.nexo_sugerido || '',
        
        quesitos_juizo: extractedData.quesitos.juizo || '',
        quesitos_reclamante: extractedData.quesitos.reclamante || '',
        quesitos_reclamada: extractedData.quesitos.reclamada || '',
        
        resumo_peticao_inicial: extractedData.resumos_ia?.resumo_peticao || '',
        resumo_contestacao: extractedData.resumos_ia?.resumo_contestacao || '',
        descricao_tecnica_doencas: extractedData.resumos_ia?.descricao_doencas || '',
        nexo_causal_justificativa: extractedData.resumos_ia?.nexo_causal || '',
        analise_incapacidade_laboral: extractedData.resumos_ia?.incapacidade || '',
        
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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setSelectedFile(null);
    setProcessingStep("idle");
    setUploadProgress(0);
    setExtractedData(null);
    setUsedModel("");
    setAiUsage(null);
    setAnalysisStep("");
    setAnalysisProgress(0);
    onOpenChange(false);
  };

  const countFilledFields = (): { filled: number; total: number } => {
    if (!extractedData) return { filled: 0, total: 0 };
    
    let filled = 0;
    let total = 0;
    
    Object.values(extractedData.vitima).forEach(v => { total++; if (v) filled++; });
    Object.values(extractedData.processo).forEach(v => { total++; if (v) filled++; });
    Object.values(extractedData.acidente).forEach(v => { total++; if (v) filled++; });
    Object.values(extractedData.historico).forEach(v => { total++; if (v) filled++; });
    Object.values(extractedData.exame_clinico).forEach(v => { total++; if (v) filled++; });
    Object.values(extractedData.quesitos).forEach(v => { total++; if (v) filled++; });
    const docs = extractedData.documentos_checklist;
    if (docs.cat) filled++;
    if (docs.prontuario) filled++;
    if (docs.receitas) filled++;
    if (docs.exames) filled++;
    if (docs.laudos_anteriores) filled++;
    if (docs.atestados) filled++;
    total += 6;
    total++;
    if (extractedData.informacoes_medicas.cids_mencionados?.length > 0) filled++;
    
    return { filled, total };
  };

  const renderPreview = () => {
    if (!extractedData) return null;
    
    const { filled, total } = countFilledFields();
    const percentage = Math.round((filled / total) * 100);

    return (
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {/* AI Usage Breakdown */}
        {aiUsage && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Inteligências Artificiais Utilizadas
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* PDF Extraction */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Extração do PDF
                </div>
                <div className="text-sm font-medium">
                  {formatModelName(aiUsage.pdfExtraction.model)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatProviderName(aiUsage.pdfExtraction.provider)}
                </div>
                {aiUsage.pdfExtraction.durationMs && (
                  <div className="text-xs text-primary flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(aiUsage.pdfExtraction.durationMs)}
                  </div>
                )}
                <div className="text-xs text-blue-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3 w-3" />
                  Gemini Vision obrigatório para PDFs
                </div>
              </div>
              
              {/* Summaries Generation */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Geração dos Resumos
                </div>
                <div className="text-sm font-medium">
                  {aiUsage.summaries.provider === 'none' 
                    ? 'Não configurado' 
                    : formatModelName(aiUsage.summaries.model)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {aiUsage.summaries.provider === 'none' 
                    ? 'Sem API key' 
                    : formatProviderName(aiUsage.summaries.provider)}
                </div>
                {aiUsage.summaries.durationMs && (
                  <div className="text-xs text-primary flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(aiUsage.summaries.durationMs)}
                  </div>
                )}
                {aiUsage.summaries.count > 0 && (
                  <div className="text-xs text-green-500 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {aiUsage.summaries.count} textos gerados
                  </div>
                )}
              </div>
            </div>
            
            {/* Total Duration */}
            {aiUsage.totalDurationMs && (
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Tempo total:</span>
                <span className="font-medium">{formatDuration(aiUsage.totalDurationMs)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-primary">{filled}/{total} campos extraídos ({percentage}%)</span>
          </div>
        </div>

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

        {extractedData.resumos_ia && (extractedData.resumos_ia.resumo_peticao || extractedData.resumos_ia.nexo_causal) && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Resumos Gerados por IA
            </h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              {extractedData.resumos_ia.resumo_peticao && <div>✓ Resumo da petição inicial</div>}
              {extractedData.resumos_ia.resumo_contestacao && <div>✓ Resumo da contestação</div>}
              {extractedData.resumos_ia.descricao_doencas && <div>✓ Descrição técnica das doenças</div>}
              {extractedData.resumos_ia.nexo_causal && <div>✓ Análise do nexo causal</div>}
              {extractedData.resumos_ia.incapacidade && <div>✓ Análise da incapacidade</div>}
            </div>
          </div>
        )}

        {extractedData.informacoes_medicas.cids_mencionados?.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">CIDs Identificados</h4>
            <div className="flex flex-wrap gap-2">
              {extractedData.informacoes_medicas.cids_mencionados.map((cid, i) => (
                <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                  {cid}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Autos do Processo
          </DialogTitle>
          <DialogDescription>
            Envie o PDF dos autos do processo para extrair automaticamente as informações para o laudo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {processingStep === "idle" && (
            <>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                  selectedFile ? "border-primary bg-primary/5" : ""
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      Arraste um arquivo PDF aqui ou
                    </p>
                    <label>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <Button variant="secondary" asChild>
                        <span>Selecionar arquivo</span>
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-2">
                      Máximo 20MB • Apenas PDF
                    </p>
                    
                    {/* Developer-only AI Config Badge */}
                    {isDeveloper && aiConfig && (
                      <div className="flex items-center justify-center gap-2 mt-4">
                        <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                          <Cpu className="h-3 w-3" />
                          <span className="font-medium">{formatProviderName(aiConfig.provider)}</span>
                          <span className="text-muted-foreground">•</span>
                          <span>{formatModelName(aiConfig.model)}</span>
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedFile && (
                <div className="space-y-2">
                  {/* Developer-only AI Config Badge when file is selected */}
                  {isDeveloper && aiConfig && (
                    <div className="flex items-center justify-center">
                      <Badge variant="secondary" className="flex items-center gap-1.5 text-xs">
                        <Cpu className="h-3 w-3" />
                        <span>{formatProviderName(aiConfig.provider)} • {formatModelName(aiConfig.model)}</span>
                      </Badge>
                    </div>
                  )}
                  <Button onClick={processFile} className="w-full">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Processar com IA
                  </Button>
                </div>
              )}
            </>
          )}

          {processingStep === "uploading" && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium">Enviando arquivo...</p>
                <p className="text-sm text-muted-foreground">{uploadProgress}%</p>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {processingStep === "analyzing" && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <Sparkles className="h-5 w-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium">Analisando documento com IA</p>
                <p className="text-sm text-muted-foreground mt-1">{analysisStep}</p>
                {isDeveloper && aiConfig && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    <Cpu className="h-3 w-3 mr-1" />
                    {formatProviderName(aiConfig.provider)} • {formatModelName(aiConfig.model)}
                  </Badge>
                )}
              </div>
              <Progress value={analysisProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                Este processo pode levar alguns minutos para PDFs grandes
              </p>
            </div>
          )}

          {processingStep === "preview" && (
            <>
              {renderPreview()}
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={createLaudo} className="flex-1">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Criar Laudo
                </Button>
              </div>
            </>
          )}

          {processingStep === "creating" && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium">Criando laudo...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
