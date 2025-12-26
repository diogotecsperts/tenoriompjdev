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

  const [analysisStep, setAnalysisStep] = useState<string>("");

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
      setAnalysisStep("Convertendo documento...");

      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      setAnalysisStep("Enviando para análise com IA...");

      // Use fetch with AbortController for 5-minute timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

      // Get session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      // Simulate progress steps during analysis
      const progressSteps = [
        { step: "Extraindo dados do documento...", delay: 3000 },
        { step: "Identificando informações do processo...", delay: 6000 },
        { step: "Analisando histórico médico...", delay: 10000 },
        { step: "Gerando resumo da petição inicial...", delay: 15000 },
        { step: "Gerando resumo da contestação...", delay: 25000 },
        { step: "Gerando descrição técnica das doenças...", delay: 35000 },
        { step: "Analisando nexo causal...", delay: 50000 },
        { step: "Analisando incapacidade laboral...", delay: 70000 },
        { step: "Finalizando análise...", delay: 90000 },
      ];

      let stepIndex = 0;
      const stepInterval = setInterval(() => {
        if (stepIndex < progressSteps.length) {
          setAnalysisStep(progressSteps[stepIndex].step);
          stepIndex++;
        }
      }, 8000);

      try {
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
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);
        clearInterval(stepInterval);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Function error:', errorText);
          throw new Error('Falha ao processar documento com IA');
        }

        const functionData = await response.json();

        if (!functionData.success) {
          throw new Error(functionData.error || 'Erro ao extrair dados');
        }

        setExtractedData(functionData.data);
        setUsedModel(functionData.model);
        setProcessingStep("preview");
        setAnalysisStep("");

      } catch (fetchError) {
        clearTimeout(timeoutId);
        clearInterval(stepInterval);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('O processamento excedeu o tempo limite de 5 minutos. Tente com um PDF menor.');
        }
        throw fetchError;
      }

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

      // Build documentos array from checklist
      const documentosArray = buildDocumentosArray(extractedData.documentos_checklist);

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
        
        // Dados da vítima - COMPLETO
        vitima_nome: extractedData.vitima.nome || '',
        vitima_profissao: extractedData.vitima.profissao || '',
        vitima_escolaridade: extractedData.vitima.escolaridade || '',
        vitima_nascimento: extractedData.vitima.data_nascimento || null,
        vitima_dominancia: extractedData.vitima.dominancia || '',
        
        // Dados do acidente
        data_acidente: extractedData.acidente.data || null,
        historia_acidente: extractedData.acidente.descricao || '',
        
        // Documentos - checkboxes
        documentos: documentosArray,
        
        // Histórico - COMPLETO
        historia_atual: extractedData.historico.historia_atual || '',
        historico_ocupacional: extractedData.historico.historico_ocupacional || '',
        antecedentes: extractedData.historico.antecedentes_patologicos || '',
        tratamentos: extractedData.historico.tratamentos_realizados || '',
        afastamentos: extractedData.historico.afastamentos || '',
        
        // Exame clínico
        laudos_medicos: extractedData.exame_clinico.laudos_medicos || '',
        exames_complementares: extractedData.exame_clinico.exames_complementares || '',
        
        // Conclusão
        conclusao_cid: extractedData.informacoes_medicas.cids_mencionados?.join(', ') || '',
        conclusao_incapacidade: extractedData.informacoes_medicas.incapacidade_alegada || '',
        nexo_causal_tipo: extractedData.informacoes_medicas.nexo_sugerido || '',
        
        // Quesitos - 3 abas
        quesitos_juizo: extractedData.quesitos.juizo || '',
        quesitos_reclamante: extractedData.quesitos.reclamante || '',
        quesitos_reclamada: extractedData.quesitos.reclamada || '',
        
        // RESUMOS GERADOS POR IA
        resumo_peticao_inicial: extractedData.resumos_ia?.resumo_peticao || '',
        resumo_contestacao: extractedData.resumos_ia?.resumo_contestacao || '',
        descricao_tecnica_doencas: extractedData.resumos_ia?.descricao_doencas || '',
        nexo_causal_justificativa: extractedData.resumos_ia?.nexo_causal || '',
        analise_incapacidade_laboral: extractedData.resumos_ia?.incapacidade || '',
        
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
    setAnalysisStep("");
    onOpenChange(false);
  };

  // Count filled fields for preview
  const countFilledFields = (): { filled: number; total: number } => {
    if (!extractedData) return { filled: 0, total: 0 };
    
    let filled = 0;
    let total = 0;
    
    // Count vitima fields
    Object.values(extractedData.vitima).forEach(v => { total++; if (v) filled++; });
    // Count processo fields
    Object.values(extractedData.processo).forEach(v => { total++; if (v) filled++; });
    // Count acidente fields
    Object.values(extractedData.acidente).forEach(v => { total++; if (v) filled++; });
    // Count historico fields
    Object.values(extractedData.historico).forEach(v => { total++; if (v) filled++; });
    // Count exame_clinico fields
    Object.values(extractedData.exame_clinico).forEach(v => { total++; if (v) filled++; });
    // Count quesitos
    Object.values(extractedData.quesitos).forEach(v => { total++; if (v) filled++; });
    // Count documentos
    const docs = extractedData.documentos_checklist;
    if (docs.cat) filled++;
    if (docs.prontuario) filled++;
    if (docs.receitas) filled++;
    if (docs.exames) filled++;
    if (docs.laudos_anteriores) filled++;
    if (docs.atestados) filled++;
    total += 6;
    // CIDs
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
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Processado com {usedModel}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-primary">{filled}/{total} campos ({percentage}%)</span>
          </div>
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
              {extractedData.vitima.dominancia && (
                <div><span className="text-muted-foreground">Dominância:</span> {extractedData.vitima.dominancia}</div>
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

        {/* Documentos Identificados */}
        {(extractedData.documentos_checklist.cat || extractedData.documentos_checklist.prontuario || 
          extractedData.documentos_checklist.receitas || extractedData.documentos_checklist.exames) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Documentos Identificados</h4>
            <div className="flex flex-wrap gap-1">
              {extractedData.documentos_checklist.cat && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">CAT</span>
              )}
              {extractedData.documentos_checklist.prontuario && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Prontuário</span>
              )}
              {extractedData.documentos_checklist.receitas && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Receitas</span>
              )}
              {extractedData.documentos_checklist.exames && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Exames</span>
              )}
              {extractedData.documentos_checklist.laudos_anteriores && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Laudos Anteriores</span>
              )}
              {extractedData.documentos_checklist.atestados && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Atestados</span>
              )}
            </div>
          </div>
        )}

        {/* Histórico */}
        {(extractedData.historico.historia_atual || extractedData.historico.historico_ocupacional) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Histórico</h4>
            <div className="space-y-2 text-sm">
              {extractedData.historico.historia_atual && (
                <div><span className="text-muted-foreground">História Atual:</span> <span className="line-clamp-2">{extractedData.historico.historia_atual}</span></div>
              )}
              {extractedData.historico.historico_ocupacional && (
                <div><span className="text-muted-foreground">Histórico Ocupacional:</span> <span className="line-clamp-2">{extractedData.historico.historico_ocupacional}</span></div>
              )}
              {extractedData.historico.antecedentes_patologicos && (
                <div><span className="text-muted-foreground">Antecedentes:</span> <span className="line-clamp-2">{extractedData.historico.antecedentes_patologicos}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Quesitos */}
        {(extractedData.quesitos.juizo || extractedData.quesitos.reclamante || extractedData.quesitos.reclamada) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Quesitos Encontrados</h4>
            <div className="flex flex-wrap gap-1">
              {extractedData.quesitos.juizo && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Do Juízo</span>
              )}
              {extractedData.quesitos.reclamante && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Do Reclamante</span>
              )}
              {extractedData.quesitos.reclamada && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">Da Reclamada</span>
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

        {/* Nexo Sugerido */}
        {extractedData.informacoes_medicas.nexo_sugerido && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Nexo Causal Sugerido</h4>
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs capitalize">
              {extractedData.informacoes_medicas.nexo_sugerido}
            </span>
          </div>
        )}

        {/* Resumos Gerados por IA */}
        {extractedData.resumos_ia && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Resumos Gerados por IA
            </h4>
            <div className="flex flex-wrap gap-1">
              {extractedData.resumos_ia.resumo_peticao && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  ✓ Resumo Petição Inicial
                </span>
              )}
              {extractedData.resumos_ia.resumo_contestacao && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  ✓ Resumo Contestação
                </span>
              )}
              {extractedData.resumos_ia.descricao_doencas && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  ✓ Descrição Técnica Doenças
                </span>
              )}
              {extractedData.resumos_ia.nexo_causal && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  ✓ Análise Nexo Causal
                </span>
              )}
              {extractedData.resumos_ia.incapacidade && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                  ✓ Análise Incapacidade
                </span>
              )}
              {!extractedData.resumos_ia.resumo_peticao && 
               !extractedData.resumos_ia.resumo_contestacao && 
               !extractedData.resumos_ia.descricao_doencas &&
               !extractedData.resumos_ia.nexo_causal &&
               !extractedData.resumos_ia.incapacidade && (
                <span className="text-xs text-muted-foreground">
                  Nenhum resumo gerado (dados insuficientes no documento)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Resumo */}
        {extractedData.resumo && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Resumo Geral</h4>
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
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-medium">Processando documento com IA...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Este processo pode levar até 3 minutos
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                (timeout: 5 minutos)
              </p>
            </div>
            <div className="w-full max-w-xs space-y-2 mt-2">
              <div className="flex items-center gap-2 text-sm bg-primary/5 rounded-lg p-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                <span className="text-primary font-medium">
                  {analysisStep || "Iniciando processamento..."}
                </span>
              </div>
              <div className="text-xs text-muted-foreground/70 text-center mt-4">
                Por favor, aguarde. Não feche esta janela.
              </div>
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
