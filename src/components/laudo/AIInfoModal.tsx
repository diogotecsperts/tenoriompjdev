import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Cpu, 
  Clock, 
  FileText, 
  Sparkles, 
  X,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface AIMetadata {
  importDate: string;
  pdfExtraction: {
    provider: string;
    model: string;
    durationMs?: number;
  };
  summaries: {
    provider: string;
    model: string;
    durationMs?: number;
    generated?: string[];
  };
  totalDurationMs?: number;
}

interface AIInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiMetadata: AIMetadata | null;
}

const formatProviderName = (provider: string) => {
  const names: Record<string, string> = {
    lovable: 'Lovable AI',
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    claude: 'Anthropic Claude',
    groq: 'Groq',
    deepseek: 'DeepSeek',
    openrouter: 'OpenRouter',
    none: 'Não configurado'
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
};

const formatModelName = (model: string) => {
  return model.replace('google/', '').replace('openai/', '');
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const SUMMARY_LABELS: Record<string, string> = {
  resumo_peticao: 'Resumo Petição Inicial',
  resumo_contestacao: 'Resumo Contestação',
  descricao_doencas: 'Descrição Técnica das Doenças',
  nexo_causal: 'Análise do Nexo Causal',
  incapacidade: 'Análise da Incapacidade Laboral'
};

export function AIInfoModal({ open, onOpenChange, aiMetadata }: AIInfoModalProps) {
  if (!aiMetadata) return null;

  const importDate = new Date(aiMetadata.importDate);
  const formattedDate = format(importDate, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });

  // Build rows for the table
  const rows: Array<{
    step: string;
    icon: React.ReactNode;
    provider: string;
    model: string;
    duration?: number;
    note?: string;
  }> = [
    {
      step: 'Extração do PDF (Vision)',
      icon: <FileText className="h-4 w-4 text-blue-500" />,
      provider: aiMetadata.pdfExtraction.provider,
      model: aiMetadata.pdfExtraction.model,
      duration: aiMetadata.pdfExtraction.durationMs,
      note: 'Gemini Vision obrigatório'
    }
  ];

  // Add summary rows
  const generatedSummaries = aiMetadata.summaries.generated || [];
  const summariesToShow = generatedSummaries.length > 0 
    ? generatedSummaries 
    : ['resumo_peticao', 'resumo_contestacao', 'descricao_doencas', 'nexo_causal', 'incapacidade'];

  summariesToShow.forEach((summaryType, index) => {
    rows.push({
      step: SUMMARY_LABELS[summaryType] || summaryType,
      icon: <Sparkles className="h-4 w-4 text-amber-500" />,
      provider: aiMetadata.summaries.provider,
      model: aiMetadata.summaries.model,
      // Distribute the duration proportionally if we only have total
      duration: aiMetadata.summaries.durationMs && summariesToShow.length > 0 
        ? Math.round(aiMetadata.summaries.durationMs / summariesToShow.length)
        : undefined,
      note: index === 0 ? 'Sua configuração' : undefined
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            Informações de IA do Laudo
          </DialogTitle>
          <DialogDescription>
            Detalhes das inteligências artificiais utilizadas na importação deste laudo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Import Date */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Data de Importação:</span>
            <span className="text-sm font-medium">{formattedDate}</span>
          </div>

          {/* AI Usage Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Etapa</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {row.icon}
                        <div>
                          <span className="block">{row.step}</span>
                          {row.note && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <AlertCircle className="h-3 w-3" />
                              {row.note}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {formatProviderName(row.provider)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatModelName(row.model)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.duration ? (
                        <span className="text-primary font-medium">
                          {formatDuration(row.duration)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Total Duration */}
          {aiMetadata.totalDurationMs && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Tempo Total de Processamento</span>
              </div>
              <span className="text-lg font-bold text-primary">
                {formatDuration(aiMetadata.totalDurationMs)}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
