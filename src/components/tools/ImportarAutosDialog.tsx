import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  Clock,
  AlertTriangle,
  RefreshCw,
  History,
  ChevronDown,
  XCircle,
  Turtle,
  Layers,
  Scissors
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { splitPDFClientSide, needsClientSplit } from "@/lib/pdf-splitter";

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
  posto_trabalho: {
    cargo_funcao: string;
    data_admissao: string;
    data_afastamento: string;
    descricao_ambiente: string;
    descricao_atividades: string;
  };
  exame_clinico: {
    laudos_medicos: string;
    exames_complementares: string;
    lesoes_descritas: string;
    exame_fisico: string;
  };
  informacoes_medicas: {
    cids_mencionados: string[];
    incapacidade_alegada: string;
    nexo_sugerido: string;
    tipo_incapacidade: string;
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
    conclusao: string;
    destino_sugerido: string;
    referencias_bibliograficas: string;
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
    usedFallback?: boolean;
    originalProvider?: string;
    fallbackReason?: string;
    strategy?: 'single_pass' | 'two_phase' | 'client_side_split';
    partsProcessed?: number;
    totalPages?: number;
  };
  summaries: {
    provider: string;
    model: string;
    count: number;
    durationMs?: number;
  };
  totalDurationMs?: number;
}

interface ImportAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  status: string;
  result: {
    summariesCount?: number;
    truncated?: boolean;
    model?: string;
    totalDurationMs?: number;
  } | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

type ProcessingStep = "idle" | "uploading" | "analyzing" | "preview" | "creating";

// Maximum processing time before showing timeout warning (25 minutes)
const MAX_PROCESSING_TIME_MS = 25 * 60 * 1000;

// Average step times (in ms) - based on historical data
const AVERAGE_STEP_TIMES: Record<string, number> = {
  upload: 3000,           // 3s
  extraction: 80000,      // 80s (Vision is naturally slow)
  processing: 5000,       // 5s
  resumo_peticao: 15000,  // 15s
  resumo_contestacao: 15000, // 15s
  descricao_doencas: 45000,  // 45s
  nexo_causal: 35000,     // 35s
  incapacidade: 25000,    // 25s
  referencias_bibliograficas: 20000, // 20s
  finalizing: 3000        // 3s
};

// Multiplier to consider "slow" (1.5x = 50% slower than average)
const SLOW_THRESHOLD_MULTIPLIER = 1.5;

// Processing steps definition for visual tracking
interface StepStatus {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error';
  startTime?: number;
  duration?: number;
}

const PROCESSING_STEPS: Array<{ id: string; label: string }> = [
  { id: 'upload', label: 'Upload do PDF' },
  { id: 'extraction', label: 'Extração de dados (Vision)' },
  { id: 'processing', label: 'Processando dados extraídos' },
  { id: 'resumo_peticao', label: 'Resumo da Petição Inicial' },
  { id: 'resumo_contestacao', label: 'Resumo da Contestação' },
  { id: 'descricao_doencas', label: 'Descrição Técnica das Doenças' },
  { id: 'nexo_causal', label: 'Análise de Nexo Causal' },
  { id: 'incapacidade', label: 'Análise de Incapacidade' },
  { id: 'referencias_bibliograficas', label: 'Referências Bibliográficas' },
  { id: 'finalizing', label: 'Finalizando processamento' },
];

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
  const [maxPdfSizeMb, setMaxPdfSizeMb] = useState<number>(50); // Dynamic from system_config
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfigDisplay | null>(null);
  const [ocrConfig, setOcrConfig] = useState<{ provider: string; model: string } | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<ImportAttempt[]>([]);
  const [retryInfo, setRetryInfo] = useState<{ isRetrying: boolean; retryCount: number; lastError: string | null } | null>(null);
  const [currentOCRProvider, setCurrentOCRProvider] = useState<string | null>(null);
  
  // Timing state
  const processingStartTime = useRef<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [backendLogs, setBackendLogs] = useState<Array<{ level: string; message: string; created_at: string }>>([]);
  
  // Step-by-step tracking
  const [stepsStatus, setStepsStatus] = useState<StepStatus[]>(
    PROCESSING_STEPS.map(step => ({ ...step, status: 'pending' }))
  );
  const lastStepIdRef = useRef<string | null>(null);
  
  // Slow AI detection state
  const [isSlowAI, setIsSlowAI] = useState(false);
  const [slowSteps, setSlowSteps] = useState<string[]>([]);
  
  // Partial failures state (NEW)
  const [partialFailures, setPartialFailures] = useState<{
    failedSummaries: string[];
    errors: Record<string, string>;
  } | null>(null);
  
  // Stale job detection (NEW)
  const [isJobStale, setIsJobStale] = useState(false);
  const lastJobUpdateRef = useRef<string | null>(null);
  const staleCheckCountRef = useRef(0);
  const STALE_THRESHOLD_POLLS = 100; // 100 polls * 3s = 300 segundos (5 min) sem update = stale
  
  // Partial results recovery state (for stale/crashed jobs)
  const [partialResults, setPartialResults] = useState<{
    partial: boolean;
    resumos_parciais: Record<string, string>;
    summariesGenerated: number;
    lastCompletedSummary: string;
  } | null>(null);

  // Client-side PDF splitting state (NEW for large PDFs)
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState(0);
  const [splitMessage, setSplitMessage] = useState('');
  const [splitParts, setSplitParts] = useState<Array<{
    partNumber: number;
    pageRange: { start: number; end: number };
    sizeMB: number;
  }>>([]);
  const [currentUploadingPart, setCurrentUploadingPart] = useState(0);

  // Cancel confirmation state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Check if user is developer and fetch AI config
  useEffect(() => {
    const checkDeveloperAndFetchConfig = async () => {
      if (!user) return;

      try {
        // Check developer role
        const { data: devData } = await supabase.rpc("is_developer");
        setIsDeveloper(devData === true);

        // Fetch AI configuration and max PDF size from system_config
        const { data: configData } = await supabase
          .from('system_config')
          .select('id, value')
          .in('id', ['default_ai_provider', 'default_ai_model', 'max_pdf_size_mb', 'phase1_ocr_provider', 'phase1_gemini_model']);

        if (configData && configData.length > 0) {
          const config: Record<string, any> = {};
          configData.forEach(item => {
            config[item.id] = item.value;
          });

          const provider = config.default_ai_provider || 'lovable';
          const model = config.default_ai_model || 'google/gemini-2.5-flash';
          const maxSize = config.max_pdf_size_mb;

          setAiConfig({ provider, model });

          // OCR unificado: mesma config para single-pass e two-phase (todos os módulos)
          const ocrProvider = config.phase1_ocr_provider || 'gemini';
          const ocrModel = config.phase1_gemini_model || 'gemini-2.5-flash';
          setOcrConfig({ provider: ocrProvider, model: ocrModel });

          
          // Set max PDF size if configured (handle both string and number values)
          if (maxSize !== undefined && maxSize !== null) {
            const sizeValue = typeof maxSize === 'string' ? parseInt(maxSize, 10) : maxSize;
            if (!isNaN(sizeValue) && sizeValue > 0) {
              setMaxPdfSizeMb(sizeValue);
            }
          }
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

  // Elapsed time timer during analysis
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (processingStep === 'analyzing' && processingStartTime.current > 0) {
      timer = setInterval(() => {
        const elapsed = Date.now() - processingStartTime.current;
        setElapsedTime(elapsed);
        
        // Check for global timeout
        if (elapsed > MAX_PROCESSING_TIME_MS) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          
          toast({
            variant: "destructive",
            title: "Tempo limite excedido",
            description: "O processamento demorou mais de 25 minutos. Verifique os logs no DevPanel para mais detalhes.",
          });
          
          setProcessingStep("idle");
          setAnalysisStep("");
        }
        
        // Check for slow steps
        const currentProcessingStep = stepsStatus.find(s => s.status === 'processing');
        if (currentProcessingStep?.startTime) {
          const elapsedForStep = Date.now() - currentProcessingStep.startTime;
          const expectedTime = AVERAGE_STEP_TIMES[currentProcessingStep.id] || 30000;
          const slowThreshold = expectedTime * SLOW_THRESHOLD_MULTIPLIER;
          
          if (elapsedForStep > slowThreshold && !slowSteps.includes(currentProcessingStep.id)) {
            setIsSlowAI(true);
            setSlowSteps(prev => [...prev, currentProcessingStep.id]);
          }
        }
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [processingStep]);

  // Fetch attempts when preview is shown
  useEffect(() => {
    const fetchAttempts = async () => {
      if (processingStep === 'preview' && currentJobId) {
        try {
          const { data, error } = await supabase
            .from('import_attempts')
            .select('*')
            .eq('job_id', currentJobId)
            .order('attempt_number', { ascending: true });
          
          if (!error && data) {
            setAttempts(data as ImportAttempt[]);
          }
        } catch (err) {
          console.error('Error fetching attempts:', err);
        }
      }
    };

    fetchAttempts();
  }, [processingStep, currentJobId]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatProviderName = (provider: string) => {
    const names: Record<string, string> = {
      lovable: 'IA Integrada',
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

  // Nome curto e correto do provedor de OCR configurado no DevPanel.
  // Suporta gemini / mistral / glm / minimax. Sem fallback silencioso pra Gemini
  // (informação inconsistente é pior que ausência).
  const formatOcrProviderLabel = (provider: string | null | undefined, model?: string): string | null => {
    if (!provider) return null;
    const p = provider.toLowerCase();
    if (p === 'glm' || p === 'glm-ocr') return 'GLM-OCR';
    if (p === 'mistral' || p === 'mistral-ocr') return 'Mistral OCR';
    if (p === 'minimax') return 'MiniMax';
    if (p === 'gemini' || p.startsWith('gemini-')) {
      return model ? `Gemini ${formatModelName(model)}` : 'Gemini Vision';
    }
    return provider;
  };

  // Sub-linha dinâmica com detalhe técnico do OCR em curso.
  // Só retorna string se a combinação (provider × etapa) for coerente; caso
  // contrário null (nunca renderizar info que possa estar errada).
  const getOcrSubStepLabel = (
    provider: string | null | undefined,
    currentStep: string,
    fileSizeMB: number | null,
  ): string | null => {
    if (!provider) return null;
    const p = provider.toLowerCase();
    const step = (currentStep || '').toLowerCase();
    const isExtractionPhase =
      step.includes('extrai') ||
      step.includes('ocr') ||
      step.includes('parte') ||
      step.includes('dividindo') ||
      step.includes('processando parte');
    if (!isExtractionPhase) return null;

    if (p === 'glm' || p === 'glm-ocr') {
      return 'GLM-OCR · rasterização página a página no servidor';
    }
    if (p === 'mistral' || p === 'mistral-ocr') {
      if (step.includes('parte') || step.includes('dividindo')) {
        return 'Mistral OCR · processando por partes (limite de 50MB por chamada)';
      }
      return 'Mistral OCR · documento inteiro em uma chamada';
    }
    if (p === 'minimax') {
      return 'MiniMax · rasterização no navegador (fluxo canônico)';
    }
    if (p === 'gemini' || p.startsWith('gemini-')) {
      if (fileSizeMB !== null && fileSizeMB > 30) {
        return 'Gemini Files API · streaming direto (sem carregar em memória)';
      }
      return 'Gemini Vision · envio inline';
    }
    return null;
  };

  
  // NEW: Format summary type name for display
  const formatSummaryTypeName = (tipo: string) => {
    const names: Record<string, string> = {
      resumo_peticao: 'Resumo da Petição Inicial',
      resumo_contestacao: 'Resumo da Contestação',
      descricao_doencas: 'Descrição Técnica das Doenças',
      nexo_causal: 'Análise de Nexo Causal',
      incapacidade: 'Análise de Incapacidade',
      referencias_bibliograficas: 'Referências Bibliográficas'
    };
    return names[tipo] || tipo;
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

    if (pdfFile.size > maxPdfSizeMb * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: `O arquivo deve ter no máximo ${maxPdfSizeMb}MB.`,
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

    if (file.size > maxPdfSizeMb * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: `O arquivo deve ter no máximo ${maxPdfSizeMb}MB.`,
      });
      return;
    }

    setSelectedFile(file);
  };

  // Update step status based on stepId from backend
  const updateStepProgress = (stepId: string | null) => {
    if (!stepId || stepId === lastStepIdRef.current) return;
    
    lastStepIdRef.current = stepId;
    
    setStepsStatus(prev => {
      const currentIndex = PROCESSING_STEPS.findIndex(s => s.id === stepId);
      
      return prev.map((step, index) => {
        if (step.id === stepId) {
          // Current step is processing
          return { 
            ...step, 
            status: 'processing' as const,
            startTime: step.startTime || Date.now()
          };
        } else if (index < currentIndex) {
          // Previous steps should be completed
          if (step.status === 'processing' || step.status === 'pending') {
            return { 
              ...step, 
              status: 'completed' as const,
              duration: step.startTime ? Date.now() - step.startTime : undefined
            };
          }
          return step;
        }
        return step;
      });
    });
  };

  // Mark all remaining steps as completed when processing finishes
  const markAllStepsCompleted = () => {
    setStepsStatus(prev => prev.map(step => {
      if (step.status === 'processing' || step.status === 'pending') {
        // Check if this was a summary step that might have been skipped
        const summarySteps = ['resumo_peticao', 'resumo_contestacao', 'descricao_doencas', 'nexo_causal', 'incapacidade'];
        if (summarySteps.includes(step.id) && step.status === 'pending') {
          return { ...step, status: 'skipped' as const };
        }
        return { 
          ...step, 
          status: 'completed' as const,
          duration: step.startTime ? Date.now() - step.startTime : undefined
        };
      }
      return step;
    }));
  };

  // Consecutive network errors counter for resilient polling
  const networkErrorCountRef = useRef(0);
  const MAX_CONSECUTIVE_NETWORK_ERRORS = 10; // ~30s of failures before giving up
  const [isReconnecting, setIsReconnecting] = useState(false);

  const checkJobStatus = async (jobId: string): Promise<boolean> => {
    try {
      // Use supabase.functions.invoke instead of raw fetch for better auth handling
      const { data, error } = await supabase.functions.invoke('check-import-status', {
        body: { jobId }
      });

      // Handle invocation error (e.g., network issues)
      if (error) {
        throw error;
      }
      
      // Reset network error counter on success
      networkErrorCountRef.current = 0;
      setIsReconnecting(false);
      
      // NEW: Detect stale job (updated_at não muda)
      if (lastJobUpdateRef.current === data.updatedAt) {
        staleCheckCountRef.current++;
        
        if (staleCheckCountRef.current >= STALE_THRESHOLD_POLLS && !isJobStale) {
          console.warn('[ImportarAutosDialog] Job appears stale - no updates for 5+ minutes');
          setIsJobStale(true);
          
          // Check if the job has partial results we can recover
          if (data.result && data.result.partial && data.result.resumos_parciais) {
            console.log(`[ImportarAutosDialog] Found partial results: ${data.result.summariesGenerated} summaries`);
            setPartialResults(data.result);
          }
        }
      } else {
        // Reset counter when we see an update
        lastJobUpdateRef.current = data.updatedAt;
        staleCheckCountRef.current = 0;
        setIsJobStale(false);
      }
      
      // Update UI with current progress
      setAnalysisStep(data.currentStep || 'Processando...');
      setAnalysisProgress(data.progress || 0);
      
      // Update step progress based on stepId
      updateStepProgress(data.stepId);
      
      // Update retry info for visual indicator
      if (data.retryInfo) {
        setRetryInfo(data.retryInfo);
      }
      
      // Update OCR provider indicator
      if (data.ocrProvider) {
        setCurrentOCRProvider(data.ocrProvider);
      }

      if (data.status === 'completed' && data.result) {
        // Mark all steps as completed
        markAllStepsCompleted();
        
        // Success!
        setExtractedData(data.result.data);
        setAiUsage(data.result.aiUsage || null);
        setUsedModel(data.result.aiUsage?.pdfExtraction?.model || 'gemini-2.5-flash');
        
        // NEW: Capture partial failures
        if (data.result.partialFailures) {
          setPartialFailures(data.result.partialFailures);
        }
        
        setProcessingStep("preview");
        return true; // Stop polling
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Erro no processamento');
      }

      return false; // Continue polling
    } catch (error) {
      console.error('Polling error:', error);
      
      // Check if this is a network error (Failed to fetch)
      const isNetworkError = error instanceof TypeError && 
        (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
      
      // Also check for FunctionsHttpError with network-like issues
      const isInvokeNetworkError = error && 
        typeof error === 'object' && 
        'name' in error && 
        (error.name === 'FunctionsRelayError' || error.name === 'FunctionsFetchError');
      
      if (isNetworkError || isInvokeNetworkError) {
        networkErrorCountRef.current++;
        console.warn(`[ImportarAutosDialog] Network error ${networkErrorCountRef.current}/${MAX_CONSECUTIVE_NETWORK_ERRORS}`);
        
        if (networkErrorCountRef.current < MAX_CONSECUTIVE_NETWORK_ERRORS) {
          // Show reconnecting indicator but don't fail yet
          setIsReconnecting(true);
          setAnalysisStep('Conexão instável, reconectando...');
          return false; // Continue polling
        }
        
        // Too many failures, give up
        console.error('[ImportarAutosDialog] Too many consecutive network errors, stopping polling');
        toast({
          variant: "destructive",
          title: "Conexão perdida",
          description: "Não foi possível reconectar após várias tentativas. O processamento pode ainda estar rodando no servidor.",
        });
      }
      
      throw error;
    }
  };

  const processFile = async () => {
    if (!selectedFile || !user) return;

    try {
      // Start timing
      processingStartTime.current = Date.now();
      setBackendLogs([]);
      
      const fileSizeMB = selectedFile.size / (1024 * 1024);

      // GLM tem limite duro de ~50 MB E ≤100 páginas por chamada. Para atender
      // ambos os limites usamos o mesmo pipeline "raster+clean+split" que o
      // Previdenciário: rasteriza cada página em JPEG, remonta um PDF só-imagens
      // (elimina bug do copyPages/pdf-lib) e divide por páginas quando preciso.
      // Providers não-GLM continuam com o split pdf-lib halving legado (mais
      // rápido e sem regressão para quem já usa).
      const isGlm = ocrConfig?.provider === 'glm';

      let glmRasterResult:
        | { parts: Blob[]; pageRanges: Array<{ start: number; end: number }>; totalPages: number }
        | null = null;

      if (isGlm) {
        // Probe rápido de páginas (~50-200ms) — decide se precisa raster
        const { probePdfPageCount, pdfNeedsRasterSplit, rebuildPdfAsRasterClean, splitCleanPdfByPages, RASTER_SPLIT_MAX_BYTES, RASTER_SPLIT_MAX_PAGES } = await import('@/lib/pdf-preprocess');

        setIsSplitting(true);
        setSplitProgress(0);
        setSplitMessage('Analisando PDF (contagem de páginas)...');

        const probe = await pdfNeedsRasterSplit(selectedFile);
        console.log(`[ImportarAutosDialog][glm] probe: ${probe.pageCount} págs, ${(probe.sizeBytes / 1024 / 1024).toFixed(1)}MB, precisa raster=${probe.needs}`);

        if (probe.needs) {
          setSplitMessage(`Rasterizando página 0/${probe.pageCount}...`);
          const rebuilt = await rebuildPdfAsRasterClean(selectedFile, RASTER_SPLIT_MAX_BYTES, {
            parallelism: 4,
            onPageProgress: (done, total) => {
              setSplitMessage(`Rasterizando página ${done}/${total}...`);
              setSplitProgress(Math.floor((done / total) * 60));
            },
          });
          console.log(`[ImportarAutosDialog][glm] raster limpo: ${rebuilt.pageCount} págs @ ${rebuilt.dpiUsed}dpi q=${rebuilt.qualityUsed} → ${(rebuilt.blob.size / 1024 / 1024).toFixed(1)}MB`);

          const cleanBytes = new Uint8Array(await rebuilt.blob.arrayBuffer());
          const cleanFitsSingle =
            rebuilt.blob.size <= RASTER_SPLIT_MAX_BYTES && rebuilt.pageCount <= RASTER_SPLIT_MAX_PAGES;

          if (cleanFitsSingle) {
            setSplitMessage(`PDF limpo cabe em chamada única (${rebuilt.pageCount} págs, ${(rebuilt.blob.size / 1024 / 1024).toFixed(1)}MB)`);
            glmRasterResult = {
              parts: [rebuilt.blob],
              pageRanges: [{ start: 1, end: rebuilt.pageCount }],
              totalPages: rebuilt.pageCount,
            };
          } else {
            setSplitMessage('Dividindo PDF limpo em partes...');
            setSplitProgress(70);
            const cleanParts = await splitCleanPdfByPages(cleanBytes, RASTER_SPLIT_MAX_PAGES, RASTER_SPLIT_MAX_BYTES);
            const parts = cleanParts.map(p => p.blob);
            const pageRanges = cleanParts.map(p => ({ start: p.startPage, end: p.endPage }));
            const totalPages = rebuilt.pageCount;
            // Popula o estado visual usado pelo modal (splitParts) para consistência
            setSplitParts(cleanParts.map((p, idx) => ({
              partNumber: idx + 1,
              pageRange: { start: p.startPage, end: p.endPage },
              sizeMB: Number((p.blob.size / 1024 / 1024).toFixed(1)),
            })));
            setSplitProgress(90);
            setSplitMessage(`Dividido em ${parts.length} parte(s)`);
            glmRasterResult = { parts, pageRanges, totalPages };
          }
        } else {
          // GLM aceita o PDF original tal como está — não precisa raster nem split.
          console.log('[ImportarAutosDialog][glm] PDF dentro dos limites; upload direto');
          setIsSplitting(false);
        }
      }

      // Para providers não-GLM mantém o split pdf-lib halving legado.
      const splitOptions = { maxSizeBytes: 20_000_000, maxPagesPerPart: 50 };
      const shouldSplit = isGlm
        ? glmRasterResult !== null
        : needsClientSplit(fileSizeMB);

      // === CHECK IF CLIENT-SIDE SPLIT IS NEEDED ===
      if (shouldSplit) {
        console.log(`[ImportarAutosDialog] Large PDF detected (${fileSizeMB.toFixed(2)}MB, provider=${ocrConfig?.provider}), starting client-side split`);

        // === CHUNKED UPLOAD MODE ===
        if (!isGlm) {
          setIsSplitting(true);
          setSplitProgress(0);
          setSplitMessage('Preparando divisão do PDF...');
          setSplitParts([]);
          setCurrentUploadingPart(0);
        }

        try {
          let parts: Blob[];
          let pageRanges: Array<{ start: number; end: number }>;
          let totalPages: number;

          if (isGlm && glmRasterResult) {
            parts = glmRasterResult.parts;
            pageRanges = glmRasterResult.pageRanges;
            totalPages = glmRasterResult.totalPages;
          } else {
            const legacy = await splitPDFClientSide(
              selectedFile,
              splitOptions,
              (progress, message) => {
                setSplitProgress(progress);
                setSplitMessage(message);
              },
              (partInfo) => {
                setSplitParts(prev => [...prev, partInfo]);
              },
            );
            parts = legacy.parts;
            pageRanges = legacy.pageRanges;
            totalPages = legacy.totalPages;
          }

          console.log(`[ImportarAutosDialog] Split complete: ${parts.length} parts, ${totalPages} pages`);
          
          setIsSplitting(false);
          setProcessingStep("uploading");
          setUploadProgress(0);
          
          // Upload each part
          const partPaths: string[] = [];
          const baseName = selectedFile.name.replace('.pdf', '');
          const timestamp = Date.now();
          
          for (let i = 0; i < parts.length; i++) {
            setCurrentUploadingPart(i);
            const uploadPercent = Math.floor((i / parts.length) * 90);
            setUploadProgress(uploadPercent);
            
            const partPath = `${user.id}/${timestamp}-${baseName}_part_${i + 1}.pdf`;
            console.log(`[ImportarAutosDialog] Uploading part ${i + 1}/${parts.length}: ${partPath}`);
            
            const { error: uploadError } = await supabase.storage
              .from('processos-pdf')
              .upload(partPath, parts[i]);
            
            if (uploadError) {
              console.error(`[ImportarAutosDialog] Upload failed for part ${i + 1}:`, uploadError);
              throw new Error(`Falha no upload da parte ${i + 1}: ${uploadError.message}`);
            }
            
            partPaths.push(partPath);
          }
          
          setCurrentUploadingPart(parts.length); // Mark all as done
          setUploadProgress(100);
          console.log(`[ImportarAutosDialog] All ${parts.length} parts uploaded`);
          
          // Store first part as file path for reference
          setCurrentFilePath(partPaths[0]);
          
          // Mark upload step as completed
          setStepsStatus(prev => prev.map(step => 
            step.id === 'upload' ? { ...step, status: 'completed' as const } : step
          ));
          
          // Call Edge Function with array of parts
          setProcessingStep("analyzing");
          setAnalysisStep("Processando partes do documento...");
          setAnalysisProgress(0);
          
          // Reset steps for new processing (keep upload as completed)
          setStepsStatus(PROCESSING_STEPS.map(step => ({ 
            ...step, 
            status: step.id === 'upload' ? 'completed' as const : 'pending' as const 
          })));
          lastStepIdRef.current = null;
          
          // Invoke Edge Function with chunked upload info
          const { data: invokeData, error: invokeError } = await supabase.functions.invoke('processar-autos', {
            body: { 
              fileName: selectedFile.name,
              fileParts: partPaths,
              pageRanges,
              totalPages,
              isChunkedUpload: true
            }
          });
          
          if (invokeError) {
            console.error('Function error:', invokeError);
            throw new Error('Falha ao iniciar processamento');
          }
          
          const jobId = invokeData.jobId;
          console.log('[ImportarAutosDialog] Chunked job started:', jobId);
          setCurrentJobId(jobId);
          
          // Start polling for status
          setAnalysisStep("Processando partes com IA...");
          
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
          }, 3000);
          
        } catch (splitError) {
          console.error('[ImportarAutosDialog] Split error:', splitError);
          setIsSplitting(false);
          throw splitError;
        }
        
        return; // Exit after chunked processing started
      }
      
      // === NORMAL UPLOAD MODE (small files) ===
      // Step 1: Upload to storage
      setProcessingStep("uploading");
      setUploadProgress(0);

      const filePathToUpload = `${user.id}/${Date.now()}-${selectedFile.name}`;
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from('processos-pdf')
        .upload(filePathToUpload, selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Falha ao enviar arquivo');
      }

      // Store file path for potential retry
      setCurrentFilePath(filePathToUpload);
      
      // Mark upload step as completed
      setStepsStatus(prev => prev.map(step => 
        step.id === 'upload' ? { ...step, status: 'completed' as const } : step
      ));

      // Step 2: Start async processing (PDF is already in storage, no need to send base64)
      setProcessingStep("analyzing");
      setAnalysisStep("Iniciando análise com IA...");
      setAnalysisProgress(0);
      
      // Reset steps for new processing (keep upload as completed)
      setStepsStatus(PROCESSING_STEPS.map(step => ({ 
        ...step, 
        status: step.id === 'upload' ? 'completed' as const : 'pending' as const 
      })));
      lastStepIdRef.current = null;

      // Get session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      // Use supabase.functions.invoke for better reliability
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('processar-autos', {
        body: { 
          fileName: selectedFile.name,
          filePath: filePathToUpload
        }
      });

      if (invokeError) {
        console.error('Function error:', invokeError);
        throw new Error('Falha ao iniciar processamento');
      }

      const jobId = invokeData.jobId;
      console.log('Job started:', jobId);
      setCurrentJobId(jobId);

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
      setIsSplitting(false);
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

      // Refresh session before inserting to ensure valid token after long processing
      const { error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError) {
        console.warn('[createLaudo] Session refresh failed:', sessionError.message);
        // Continue anyway, the current token might still be valid
      }

      // Buscar texto padrão da Metodologia Pericial do banco de dados
      let metodologiaPadrao = '';
      try {
        const { data: metodologiaConfig } = await supabase
          .from('system_config')
          .select('value')
          .eq('id', 'config_metodologia_padrao')
          .single();
        
        if (metodologiaConfig?.value) {
          const parsed = typeof metodologiaConfig.value === 'string' 
            ? JSON.parse(metodologiaConfig.value) 
            : metodologiaConfig.value;
          metodologiaPadrao = parsed.texto || '';
        }
      } catch (err) {
        console.warn('[createLaudo] Failed to fetch metodologia padrao:', err);
      }

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
        
        // Dados do Posto de Trabalho (CAMPO UNIFICADO)
        dados_funcionais_cargo: extractedData.posto_trabalho?.cargo_funcao || '',
        dados_funcionais_admissao: extractedData.posto_trabalho?.data_admissao || null,
        dados_funcionais_afastamento: extractedData.posto_trabalho?.data_afastamento || null,
        descricao_posto_trabalho: '', // Campo legado - não mais usado
        // Campo unificado: prioriza ambiente_e_atividades (novo), fallback para concatenar campos antigos
        descricao_atividades_laborais: 
          (extractedData.posto_trabalho as any)?.ambiente_e_atividades || 
          [extractedData.posto_trabalho?.descricao_ambiente, extractedData.posto_trabalho?.descricao_atividades]
            .filter(Boolean).join('\n\n') || '',
        
        laudos_medicos: extractedData.exame_clinico.laudos_medicos || '',
        exames_complementares: extractedData.exame_clinico.exames_complementares || '',
        // Exame Físico - NOVO campo mapeado
        exame_fisico: extractedData.exame_clinico?.exame_fisico || '',
        
        conclusao_cid: extractedData.informacoes_medicas.cids_mencionados?.join(', ') || '',
        conclusao_incapacidade: extractedData.informacoes_medicas.incapacidade_alegada || '',
        nexo_causal_tipo: extractedData.informacoes_medicas.nexo_sugerido || '',
        // Mapear tipo_incapacidade para conclusao_status (marcação de checkbox)
        conclusao_status: extractedData.informacoes_medicas.tipo_incapacidade || '',
        
        quesitos_juizo: '',
        quesitos_reclamante: '',
        quesitos_reclamada: '',
        
        resumo_peticao_inicial: extractedData.resumos_ia?.resumo_peticao || '',
        resumo_contestacao: extractedData.resumos_ia?.resumo_contestacao || '',
        descricao_tecnica_doencas: extractedData.resumos_ia?.descricao_doencas || '',
        // Mapear análises geradas pela IA para os campos corretos do laudo
        nexo_causal_justificativa: extractedData.resumos_ia?.nexo_causal || '',
        analise_incapacidade_laboral: extractedData.resumos_ia?.incapacidade || '',
        // Análise Conclusiva - vazio na importação (isFieldEmpty oculta a seção no DOCX/PDF)
        conclusao_analise: extractedData.resumos_ia?.conclusao || '',
        conclusao_destino: extractedData.resumos_ia?.destino_sugerido || '',
        referencias_bibliograficas: extractedData.resumos_ia?.referencias_bibliograficas || '',
        
        // Campo fixo gerenciado via banco de dados (config_metodologia_padrao)
        metodologia_pericial: metodologiaPadrao,
        
        anotacoes: extractedData.resumo ? `[Resumo extraído automaticamente]\n${extractedData.resumo}` : '',
        status: 'rascunho',
        
        // AI Metadata for tracking + PDF source for regeneration
        ai_metadata: aiUsage ? {
          importDate: new Date().toISOString(),
          pdfFilePath: currentFilePath,
          importJobId: currentJobId,
          // NEW: Store extracted content path for more accurate regeneration
          extracted_content_path: (extractedData as any).extracted_content_path || null,
          pdfExtraction: {
            provider: aiUsage.pdfExtraction.provider,
            model: aiUsage.pdfExtraction.model,
            durationMs: aiUsage.pdfExtraction.durationMs,
            strategy: (aiUsage.pdfExtraction as any).strategy || 'single_pass'
          },
          summaries: {
            provider: aiUsage.summaries.provider,
            model: aiUsage.summaries.model,
            durationMs: aiUsage.summaries.durationMs,
            generated: ['resumo_peticao', 'resumo_contestacao', 'descricao_doencas', 'referencias_bibliograficas'].filter(
              key => extractedData.resumos_ia?.[key as keyof typeof extractedData.resumos_ia]
            )
          },
          // NEW: Mark which sections failed for retry in editor
          failedSummaries: partialFailures?.failedSummaries || [],
          totalDurationMs: aiUsage.totalDurationMs
        } : null
      };

      // Retry logic with exponential backoff for network resilience
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data: newLaudo, error } = await supabase
            .from('laudos')
            .insert(laudoData)
            .select()
            .single();

          if (error) {
            throw error;
          }

          // Success!
          toast({
            title: "Laudo criado com sucesso!",
            description: "Os dados foram importados automaticamente.",
          });

          handleClose();
          navigate(`/laudo/${newLaudo.id}`);
          return;

        } catch (insertError) {
          lastError = insertError instanceof Error ? insertError : new Error(String(insertError));
          console.warn(`[createLaudo] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

          if (attempt < maxRetries) {
            // Wait before retry (exponential backoff: 1s, 2s, 3s)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            
            // Refresh session before retry
            await supabase.auth.refreshSession();
          }
        }
      }

      // All retries failed
      throw lastError || new Error('Falha ao criar laudo após múltiplas tentativas');

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

  // Handle using partial results from a stale/crashed job
  const handleUsePartialResults = (partial: NonNullable<typeof partialResults>) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    // Build a minimal ExtractedData with the partial summaries injected
    const partialResumosIA = {
      resumo_peticao: partial.resumos_parciais?.resumo_peticao || '',
      resumo_contestacao: partial.resumos_parciais?.resumo_contestacao || '',
      descricao_doencas: partial.resumos_parciais?.descricao_doencas || '',
      nexo_causal: partial.resumos_parciais?.nexo_causal || '',
      incapacidade: partial.resumos_parciais?.incapacidade || '',
      conclusao: partial.resumos_parciais?.conclusao || '',
      destino_sugerido: partial.resumos_parciais?.destino_sugerido || '',
      referencias_bibliograficas: partial.resumos_parciais?.referencias_bibliograficas || '',
    };
    
    // If we already have extractedData from checkJobStatus, use it
    // Otherwise create a minimal structure (user will need to fill manually)
    if (extractedData) {
      setExtractedData({
        ...extractedData,
        resumos_ia: partialResumosIA
      });
    } else {
      // Create empty structure with just the summaries
      const emptyData: ExtractedData = {
        vitima: { nome: '', cpf: '', data_nascimento: '', profissao: '', escolaridade: '', dominancia: '' },
        processo: { numero: '', vara: '', reclamante: '', reclamada: '' },
        acidente: { data: '', descricao: '', local: '' },
        documentos_checklist: { cat: false, prontuario: false, receitas: false, exames: false, laudos_anteriores: false, atestados: false, outros: [] },
        historico: { historia_atual: '', historico_ocupacional: '', antecedentes_patologicos: '', tratamentos_realizados: '', afastamentos: '' },
        posto_trabalho: { cargo_funcao: '', data_admissao: '', data_afastamento: '', descricao_ambiente: '', descricao_atividades: '' },
        exame_clinico: { laudos_medicos: '', exames_complementares: '', lesoes_descritas: '', exame_fisico: '' },
        informacoes_medicas: { cids_mencionados: [], incapacidade_alegada: '', nexo_sugerido: '', tipo_incapacidade: '' },
        quesitos: { juizo: '', reclamante: '', reclamada: '' },
        textos_brutos: { peticao_inicial: '', contestacao: '' },
        resumos_ia: partialResumosIA,
        resumo: ''
      };
      setExtractedData(emptyData);
    }
    
    // Determine which summaries failed
    const allTypes = ['descricao_doencas', 'nexo_causal', 'incapacidade', 'resumo_peticao', 'resumo_contestacao', 'referencias_bibliograficas'];
    const failed = allTypes.filter(t => !partial.resumos_parciais?.[t]);
    if (failed.length > 0) {
      setPartialFailures({
        failedSummaries: failed,
        errors: Object.fromEntries(failed.map(f => [f, 'Job interrompido antes da geração']))
      });
    }
    
    setProcessingStep("preview");
    setIsJobStale(false);
    setPartialResults(null);
    
    toast({
      title: `${partial.summariesGenerated} resumos recuperados`,
      description: `Dados parciais recuperados. ${failed.length > 0 ? `${failed.length} seção(ões) precisarão ser geradas manualmente.` : ''}`,
    });
  };

  // Forced cancel during active processing — stops polling and resets all state to idle
  const handleForcedCancel = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setShowCancelConfirm(false);
    setProcessingStep("idle");
    setAnalysisStep("");
    setAnalysisProgress(0);
    setIsSplitting(false);
    networkErrorCountRef.current = 0;
    setIsReconnecting(false);
    setIsJobStale(false);
    lastJobUpdateRef.current = null;
    staleCheckCountRef.current = 0;
    setIsSlowAI(false);
    setSlowSteps([]);
    setStepsStatus(PROCESSING_STEPS.map(step => ({ ...step, status: 'pending' })));
    lastStepIdRef.current = null;
    toast({
      variant: "destructive",
      title: "Importação cancelada",
      description: "O processo foi interrompido. Você pode selecionar outro arquivo.",
    });
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
    setIsRetrying(false);
    setCurrentFilePath(null);
    setCurrentJobId(null);
    setAttempts([]);
    // Reset steps status
    setStepsStatus(PROCESSING_STEPS.map(step => ({ ...step, status: 'pending' })));
    lastStepIdRef.current = null;
    // Reset slow AI detection
    setIsSlowAI(false);
    setSlowSteps([]);
    // Reset partial failures
    setPartialFailures(null);
    // Reset stale detection
    setIsJobStale(false);
    lastJobUpdateRef.current = null;
    staleCheckCountRef.current = 0;
    setPartialResults(null);
    // Reset network error tracking
    networkErrorCountRef.current = 0;
    setIsReconnecting(false);
    // Reset cancel confirmation
    setShowCancelConfirm(false);
    // Reset client-side splitting state
    setIsSplitting(false);
    setSplitProgress(0);
    setSplitMessage('');
    onOpenChange(false);
  };

  // Retry processing for incomplete extractions
  const handleRetry = async () => {
    if (!currentFilePath || !user || !selectedFile) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não é possível reprocessar: arquivo não encontrado.",
      });
      return;
    }

    setIsRetrying(true);
    setProcessingStep("analyzing");
    setAnalysisStep("Reprocessando documento...");
    setAnalysisProgress(0);
    
    // Reset steps for retry (keep upload as completed)
    setStepsStatus(PROCESSING_STEPS.map(step => ({ 
      ...step, 
      status: step.id === 'upload' ? 'completed' as const : 'pending' as const 
    })));
    lastStepIdRef.current = null;

    try {
      // Use supabase.functions.invoke for retry as well
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('processar-autos', {
        body: { 
          retryFilePath: currentFilePath,
          fileName: selectedFile.name
        }
      });

      if (invokeError) {
        console.error('Retry function error:', invokeError);
        throw new Error('Falha ao iniciar reprocessamento');
      }

      const jobId = invokeData.jobId;
      console.log('Retry job started:', jobId);
      setCurrentJobId(jobId); // Update to new jobId for fetching attempts

      // Start polling for status
      setAnalysisStep("Reprocessando documento...");

      pollingRef.current = setInterval(async () => {
        try {
          const isDone = await checkJobStatus(jobId);
          if (isDone && pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            setIsRetrying(false);
          }
        } catch (error) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          console.error('Retry processing error:', error);
          toast({
            variant: "destructive",
            title: "Erro no reprocessamento",
            description: error instanceof Error ? error.message : "Erro desconhecido",
          });
          setProcessingStep("preview");
          setIsRetrying(false);
        }
      }, 3000);

    } catch (error) {
      console.error('Retry error:', error);
      toast({
        variant: "destructive",
        title: "Erro no reprocessamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setProcessingStep("preview");
      setIsRetrying(false);
    }
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

    // Após a refatoração AI Bias, apenas 2 resumos são auto-gerados durante o import:
    // resumo_peticao e resumo_contestacao. Os demais campos (justificativas, conclusão,
    // destino, quesitos, referências) são gerados sob demanda pelo médico no editor.
    const EXPECTED_AUTO_SUMMARIES = 2;

    // Só marca como incompleto se houve falha real (zero resumos ou provider inválido).
    const isIncompleteExtraction = aiUsage && (
      aiUsage.summaries.provider === 'none' ||
      aiUsage.summaries.count === 0
    );

    return (
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {/* Warning for incomplete extraction with retry option */}
        {isIncompleteExtraction && (
          <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <div className="flex-1">
              <AlertTitle className="flex items-center justify-between">
                <span>Extração parcial</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetry}
                  disabled={isRetrying || !currentFilePath}
                  className="h-7 text-xs border-yellow-500/50 hover:bg-yellow-500/20"
                >
                  {isRetrying ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Tentar novamente
                </Button>
              </AlertTitle>
              <AlertDescription>
                Alguns campos não puderam ser extraídos automaticamente. 
                O documento pode estar incompleto ou muito extenso para processar completamente.
                {aiUsage && aiUsage.summaries.count < EXPECTED_AUTO_SUMMARIES && (
                  <span className="block mt-1 font-medium">
                    Apenas {aiUsage.summaries.count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos foram gerados.
                    Os demais campos são preenchidos sob demanda no editor.
                  </span>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}
        
        {/* NEW: Warning for partial failures (specific summaries that failed) */}
        {partialFailures && partialFailures.failedSummaries.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Importação parcial</AlertTitle>
            <AlertDescription>
              <p className="mb-2">Algumas seções não puderam ser geradas automaticamente:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {partialFailures.failedSummaries.map(tipo => (
                  <li key={tipo}>
                    <span className="font-medium">{formatSummaryTypeName(tipo)}</span>
                    {partialFailures.errors[tipo] && (
                      <span className="text-muted-foreground ml-1">
                        ({partialFailures.errors[tipo].substring(0, 50)}...)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Você poderá gerar essas seções manualmente no editor do laudo usando o botão "🔄 Regenerar".
              </p>
            </AlertDescription>
          </Alert>
        )}

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
                {/* Fallback indicator */}
                {aiUsage.pdfExtraction.usedFallback && aiUsage.pdfExtraction.originalProvider && (
                  <div className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                    <RefreshCw className="h-3 w-3" />
                    Fallback de {aiUsage.pdfExtraction.originalProvider}
                  </div>
                )}
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
                {(() => {
                  // Distingue falha real (partialFailures) de "pulo legítimo" (contestação vazia).
                  const hasRealFailure =
                    !!partialFailures && partialFailures.failedSummaries.length > 0;
                  const count = aiUsage.summaries.count;
                  const complete = count >= EXPECTED_AUTO_SUMMARIES;

                  if (count === 0) {
                    return (
                      <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        Nenhum resumo gerado
                      </div>
                    );
                  }
                  if (complete) {
                    return (
                      <div className="text-xs text-green-500 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos
                      </div>
                    );
                  }
                  if (hasRealFailure) {
                    return (
                      <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        {count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos
                      </div>
                    );
                  }
                  // Pulo legítimo (ex.: PDF sem contestação) — sem alarme.
                  return (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos
                      <span className="ml-1 opacity-80">(demais seções sem conteúdo no PDF)</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {/* Chunked Processing Indicator */}
            {aiUsage.pdfExtraction.strategy === 'client_side_split' && aiUsage.pdfExtraction.partsProcessed && (
              <div className="col-span-2 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <Layers className="h-4 w-4 text-purple-900 dark:text-purple-300" />
                    <span className="font-medium text-purple-900 dark:text-purple-300">
                      Processamento Chunked
                    </span>
                    <Badge variant="secondary" className="bg-purple-500/20 text-purple-900 dark:text-purple-200 border-0">
                      {aiUsage.pdfExtraction.partsProcessed} partes
                    </Badge>
                    {aiUsage.pdfExtraction.totalPages && (
                      <span className="text-xs text-muted-foreground">
                        ({aiUsage.pdfExtraction.totalPages} páginas totais)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            
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

        {/* Attempts History */}
        {attempts.length > 1 && (
          <Collapsible className="border rounded-lg bg-muted/20">
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-primary" />
                Histórico de Tentativas ({attempts.length})
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="space-y-2 pt-2 border-t border-border">
                {attempts.map((attempt, index) => (
                  <div 
                    key={attempt.id} 
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md text-sm",
                      index === attempts.length - 1 
                        ? "bg-primary/10 border border-primary/30" 
                        : "bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={attempt.status === 'completed' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        #{attempt.attempt_number}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(attempt.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.result && (
                        <span className="text-xs text-muted-foreground">
                          {attempt.result.summariesCount || 0}/5 resumos
                        </span>
                      )}
                      {attempt.result?.totalDurationMs && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(attempt.result.totalDurationMs)}
                        </span>
                      )}
                      {attempt.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : attempt.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
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

  // Check if processing is active (should block closing)
  const isProcessingActive = processingStep === 'uploading' || processingStep === 'analyzing';
  
  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Block closing during active processing
        if (!isOpen && isProcessingActive) {
          toast({
            title: "Processamento em andamento",
            description: "Use o botão 'Cancelar importação' abaixo para interromper.",
          });
          return;
        }
        handleClose();
      }}
    >
      <DialogContent 
        className="sm:max-w-[600px]"
        onInteractOutside={(e) => {
          // Block clicking outside during processing
          if (isProcessingActive) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Block ESC key during processing
          if (isProcessingActive) {
            e.preventDefault();
          }
        }}
      >
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
                  "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ease-out",
                  isDragging 
                    ? "border-primary border-[3px] bg-primary/10 scale-[1.02] shadow-lg shadow-primary/20 ring-4 ring-primary/20" 
                    : "border-muted-foreground/25 hover:border-muted-foreground/40",
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
                    <Upload 
                      className={cn(
                        "h-10 w-10 mx-auto mb-4 transition-all duration-300",
                        isDragging 
                          ? "text-primary scale-110 animate-bounce" 
                          : "text-muted-foreground"
                      )} 
                    />
                    <p className={cn(
                      "mb-2 transition-colors duration-300",
                      isDragging ? "text-primary font-medium" : "text-muted-foreground"
                    )}>
                      {isDragging ? "Solte o arquivo aqui!" : "Arraste um arquivo PDF aqui ou"}
                    </p>
                    <label>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <Button variant="secondary" asChild>
                        <span className="relative overflow-hidden transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-md active:scale-[0.98] active:shadow-sm cursor-pointer group">
                          <span className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md" />
                          <span className="relative z-10 flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Selecionar arquivo
                          </span>
                        </span>
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-2">
                      Máximo {maxPdfSizeMb}MB • Apenas PDF
                    </p>
                    
                    {/* AI Models Badge - GLOBAL for ALL users */}
                    {(aiConfig || ocrConfig) && (
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                        {ocrConfig && (
                          <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                            <Eye className="h-3 w-3" />
                            <span className="text-muted-foreground">OCR:</span>
                            <span className="font-medium">
                              {formatOcrProviderLabel(ocrConfig.provider, ocrConfig.model) || ocrConfig.provider}
                            </span>
                          </Badge>
                        )}
                        {aiConfig && (
                          <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                            <Cpu className="h-3 w-3" />
                            <span className="text-muted-foreground">IA:</span>
                            <span className="font-medium">{formatProviderName(aiConfig.provider)}</span>
                            <span className="text-muted-foreground">•</span>
                            <span>{formatModelName(aiConfig.model)}</span>
                          </Badge>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedFile && (
                <div className="space-y-3">
                  {/* AI Config Badge - GLOBAL for ALL users */}
                  {aiConfig && (
                    <div className="flex items-center justify-center">
                      <Badge variant="secondary" className="flex items-center gap-1.5 text-xs">
                        <Cpu className="h-3 w-3" />
                        <span>{formatProviderName(aiConfig.provider)} • {formatModelName(aiConfig.model)}</span>
                      </Badge>
                    </div>
                  )}
                  
                  {/* Large PDF Client-Side Split Indicator */}
                  {needsClientSplit(selectedFile.size / (1024 * 1024)) && (
                    <Alert className="border-border bg-muted/50">
                      <Scissors className="h-4 w-4 text-muted-foreground" />
                      <AlertTitle className="text-foreground text-sm font-medium">
                        PDF Grande - Divisão Automática
                      </AlertTitle>
                      <AlertDescription className="text-muted-foreground text-xs">
                        Este arquivo ({formatFileSize(selectedFile.size)}) será dividido no seu navegador antes do upload.
                        Isso evita erros de memória e garante processamento confiável.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <Button onClick={processFile} className="w-full">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Processar com IA
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Client-Side Splitting UI - Enhanced with parts details */}
          {isSplitting && (
            <div className="space-y-4 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="h-5 w-5 animate-pulse text-primary" />
                  <span className="font-medium">Dividindo PDF no navegador...</span>
                </div>
                {splitParts.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {splitParts.length} parte{splitParts.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              
              <Progress value={splitProgress} />
              <p className="text-sm text-muted-foreground text-center">{splitMessage}</p>
              
              {/* Parts grid - shows each part as it's created */}
              {splitParts.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {splitParts.map((part) => (
                    <div key={part.partNumber} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs border border-border/50">
                      <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span className="font-medium">Parte {part.partNumber}</span>
                      <span className="text-muted-foreground">
                        p.{part.pageRange.start}-{part.pageRange.end}
                      </span>
                      <Badge variant="secondary" className="ml-auto text-[10px] py-0">
                        {part.sizeMB.toFixed(1)}MB
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-xs text-center text-muted-foreground">
                Processamento local para evitar erros de memória no servidor.
              </p>

              {/* Cancel button during splitting */}
              {!showCancelConfirm ? (
                <div className="pt-1 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar importação
                  </Button>
                </div>
              ) : (
                <Alert className="border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-destructive">Cancelar importação?</AlertTitle>
                  <AlertDescription className="text-destructive/80">
                    O processamento em andamento será perdido. Você precisará iniciar uma nova importação.
                  </AlertDescription>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelConfirm(false)}
                      className="text-xs"
                    >
                      Continuar processando
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleForcedCancel}
                      className="text-xs"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Confirmar cancelamento
                    </Button>
                  </div>
                </Alert>
              )}
            </div>
          )}

          {/* Uploading Parts UI - Enhanced with individual part tracking */}
          {processingStep === "uploading" && !isSplitting && (
            <div className="space-y-4 py-6">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="font-medium">
                  {splitParts.length > 0 
                    ? `Enviando partes (${Math.min(currentUploadingPart + 1, splitParts.length)}/${splitParts.length})...`
                    : 'Enviando arquivo...'
                  }
                </span>
              </div>
              
              <Progress value={uploadProgress} />
              <p className="text-sm text-muted-foreground text-center">{uploadProgress}%</p>
              
              {/* Per-part upload status */}
              {splitParts.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  {splitParts.map((part, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs px-2">
                      {idx < currentUploadingPart ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : idx === currentUploadingPart ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                      )}
                      <span className={idx < currentUploadingPart ? "text-muted-foreground" : ""}>
                        Parte {part.partNumber}
                      </span>
                      <span className="text-muted-foreground">
                        ({part.sizeMB.toFixed(1)}MB)
                      </span>
                      {idx < currentUploadingPart && (
                        <span className="text-green-500 ml-auto">Enviada</span>
                      )}
                      {idx === currentUploadingPart && (
                        <span className="text-primary ml-auto">Enviando...</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {processingStep === "analyzing" && (
            <div className="space-y-4 py-4">
              {/* Header com tempo decorrido */}
              <div className="text-center mb-2">
                <p className="font-medium text-lg flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Analisando documento com IA
                </p>
                <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Tempo decorrido: {formatDuration(elapsedTime)}
                </p>
                {/* OCR Provider Indicator - GLOBAL for ALL users during extraction */}
                {(() => {
                  const isExtracting =
                    stepsStatus.find(s => s.id === 'extraction')?.status === 'processing';
                  if (!isExtracting) return null;
                  // Preferir o provider real vindo do backend (currentOCRProvider),
                  // caindo pra config do DevPanel (ocrConfig.provider) até o polling
                  // trazer o valor efetivo. Nunca inventa Gemini.
                  const effectiveProvider = currentOCRProvider || ocrConfig?.provider || null;
                  const label = formatOcrProviderLabel(effectiveProvider, ocrConfig?.model);
                  if (!label) return null;
                  const fileSizeMB = selectedFile ? selectedFile.size / (1024 * 1024) : null;
                  const subStep = getOcrSubStepLabel(effectiveProvider, analysisStep, fileSizeMB);
                  return (
                    <>
                      <Badge
                        variant="outline"
                        className="mt-2 text-xs flex items-center gap-1.5 border-border bg-muted/50 text-foreground"
                      >
                        <Eye className="h-3 w-3 text-primary" />
                        {label}
                      </Badge>
                      {subStep && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground italic">
                          └─ {subStep}
                        </p>
                      )}
                    </>
                  );
                })()}
                
                {/* Main AI Indicator - GLOBAL for ALL users after OCR completes */}
                {stepsStatus.find(s => s.id === 'extraction')?.status === 'completed' && 
                 stepsStatus.some(s => s.status === 'processing') &&
                 aiConfig && (
                  <Badge 
                    variant="outline" 
                    className="mt-2 text-xs flex items-center gap-1.5 border-border bg-muted/50 text-foreground"
                  >
                    <Cpu className="h-3 w-3 text-primary" />
                    {formatProviderName(aiConfig.provider)} • {formatModelName(aiConfig.model)}
                  </Badge>
                )}

                {/* Fallback Indicator - Shown when OCR provider falls back */}
                {analysisStep && (
                  analysisStep.toLowerCase().includes('fallback') || 
                  analysisStep.toLowerCase().includes('falhou')
                ) && (
                  <Badge 
                    variant="outline" 
                    className="mt-2 text-xs flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    <RefreshCw className="h-3 w-3" />
                    IA de fallback assumiu
                  </Badge>
                )}
              </div>
              
              {/* Lista de etapas */}
              <div className="space-y-1.5 max-w-md mx-auto">
                {stepsStatus.map((step) => (
                  <div 
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg transition-all duration-300",
                      step.status === 'processing' && "bg-primary/10",
                      step.status === 'completed' && "text-muted-foreground",
                      step.status === 'error' && "bg-destructive/10"
                    )}
                  >
                    {/* Ícone de status */}
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {step.status === 'pending' && (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      {step.status === 'processing' && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                      {step.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {step.status === 'skipped' && (
                        <div className="w-3.5 h-3.5 rounded-full bg-muted-foreground/20 flex items-center justify-center">
                          <span className="text-[8px] text-muted-foreground">–</span>
                        </div>
                      )}
                      {step.status === 'error' && (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    
                    {/* Label da etapa */}
                    <span className={cn(
                      "text-sm flex-1",
                      step.status === 'processing' && "font-medium text-primary",
                      step.status === 'completed' && "line-through opacity-70",
                      step.status === 'skipped' && "opacity-50"
                    )}>
                      {step.label}
                    </span>
                    
                    {/* Slow indicator per step */}
                    {step.status === 'processing' && slowSteps.includes(step.id) && (
                      <Turtle className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
                    )}
                    
                    {/* Duração (se concluída) */}
                    {step.status === 'completed' && step.duration && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(step.duration)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Slow AI Indicator */}
              {isSlowAI && (
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <Turtle className="h-4 w-4 text-blue-500" />
                  <AlertTitle className="text-blue-600 dark:text-blue-400">
                    IA processando com calma
                  </AlertTitle>
                  <AlertDescription className="text-blue-600/80 dark:text-blue-400/80">
                    O modelo de IA selecionado é mais lento, mas geralmente oferece 
                    resultados de maior qualidade. Aguarde...
                  </AlertDescription>
                </Alert>
              )}
              
              {/* NEW: Stale Job Indicator */}
              {isJobStale && (
                <Alert className="bg-orange-500/10 border-orange-500/30">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <AlertTitle className="text-orange-600 dark:text-orange-400">
                    Processamento lento
                  </AlertTitle>
                  <AlertDescription className="text-orange-600/80 dark:text-orange-400/80">
                    <p>O processamento não teve atualizações nos últimos 5 minutos.</p>
                    {partialResults && (
                      <p className="text-sm mt-1 font-medium text-green-600 dark:text-green-400">
                        ✓ {partialResults.summariesGenerated} de 6 resumos foram salvos antes da parada.
                      </p>
                    )}
                    <p className="text-sm mt-1">
                      {partialResults 
                        ? 'Você pode usar os resumos já gerados ou continuar esperando.'
                        : 'Isso pode indicar que o servidor está sobrecarregado ou o modelo de IA está lento.'
                      }
                    </p>
                    <div className="flex gap-2 mt-3">
                      {partialResults && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleUsePartialResults(partialResults)}
                          className="text-xs border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Usar {partialResults.summariesGenerated} resumos gerados
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          staleCheckCountRef.current = 0;
                          setIsJobStale(false);
                          setPartialResults(null);
                        }}
                        className="text-xs"
                      >
                        Continuar esperando
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => {
                          if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                            pollingRef.current = null;
                          }
                          setProcessingStep("idle");
                          toast({
                            variant: "destructive",
                            title: "Processamento cancelado",
                            description: "Você pode tentar novamente com outro arquivo ou configuração."
                          });
                        }}
                        className="text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Retry Indicator */}
              {retryInfo && retryInfo.retryCount > 0 && (
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />
                  <AlertTitle className="text-amber-600 dark:text-amber-400">
                    Reconectando ao servidor de IA
                  </AlertTitle>
                  <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
                    Limite temporário atingido. Tentativa {retryInfo.retryCount}/3 em andamento...
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Barra de progresso geral */}
              <div className="pt-2">
                <Progress value={analysisProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {analysisProgress}% concluído
                </p>
              </div>

              {/* Cancel button during analyzing */}
              {!showCancelConfirm ? (
                <div className="pt-1 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar importação
                  </Button>
                </div>
              ) : (
                <Alert className="border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-destructive">Cancelar importação?</AlertTitle>
                  <AlertDescription className="text-destructive/80">
                    O processamento em andamento será perdido. Você precisará iniciar uma nova importação.
                  </AlertDescription>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelConfirm(false)}
                      className="text-xs"
                    >
                      Continuar processando
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleForcedCancel}
                      className="text-xs"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Confirmar cancelamento
                    </Button>
                  </div>
                </Alert>
              )}
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
