import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  FileOutput, 
  Brain, 
  Bone, 
  Heart, 
  Activity,
  Stethoscope,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLaudo } from "@/contexts/LaudoContext";

interface GerarLaudoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const tiposPericia = [
  { id: "acidente_trabalho", label: "Acidente de Trabalho", icon: Activity },
  { id: "doenca_ocupacional", label: "Doença Ocupacional", icon: Stethoscope },
  { id: "invalidez", label: "Invalidez", icon: Heart },
];

const modelosDisponiveis = [
  { 
    id: "padrao", 
    label: "Modelo Padrão", 
    description: "Modelo completo com todas as seções",
    icon: Activity,
    category: "geral"
  },
  { 
    id: "psiquiatrico", 
    label: "Laudo Psiquiátrico", 
    description: "Síndrome Burnout e transtornos mentais",
    icon: Brain,
    category: "psiquiatria"
  },
  { 
    id: "ortopedico", 
    label: "Laudo Ortopédico", 
    description: "Lesões de coluna e membros",
    icon: Bone,
    category: "ortopedia"
  },
  { 
    id: "ler_dort", 
    label: "LER/DORT", 
    description: "Lesões por Esforço Repetitivo",
    icon: Activity,
    category: "ortopedia"
  },
];

export function GerarLaudoDialog({ open, onOpenChange }: GerarLaudoDialogProps) {
  const navigate = useNavigate();
  const { createLaudo } = useLaudo();
  const [step, setStep] = useState<1 | 2>(1);
  const [tipoPericia, setTipoPericia] = useState<string>("");
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => {
    setStep(1);
    setTipoPericia("");
    setModeloSelecionado("");
    onOpenChange(false);
  };

  const handleNext = () => {
    if (step === 1 && tipoPericia) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setModeloSelecionado("");
    }
  };

  const handleCreate = async () => {
    if (!modeloSelecionado) return;
    
    setIsLoading(true);
    try {
      const id = await createLaudo();
      if (id) {
        handleClose();
        navigate(`/laudo/${id}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileOutput className="h-5 w-5 text-primary" />
            Gerar Novo Laudo
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Selecione o tipo de perícia para começar."
              : "Escolha um modelo de laudo para usar como base."}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 py-2">
          <div className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors",
            step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            1
          </div>
          <div className={cn(
            "flex-1 h-1 rounded-full transition-colors",
            step >= 2 ? "bg-primary" : "bg-muted"
          )} />
          <div className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors",
            step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            2
          </div>
        </div>

        {/* Step 1: Tipo de Perícia */}
        {step === 1 && (
          <RadioGroup
            value={tipoPericia}
            onValueChange={setTipoPericia}
            className="grid gap-3"
          >
            {tiposPericia.map((tipo) => {
              const Icon = tipo.icon;
              return (
                <Label
                  key={tipo.id}
                  htmlFor={tipo.id}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                    tipoPericia === tipo.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={tipo.id} id={tipo.id} className="sr-only" />
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
                    tipoPericia === tipo.id ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "h-6 w-6 transition-colors",
                      tipoPericia === tipo.id ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <span className="font-medium">{tipo.label}</span>
                </Label>
              );
            })}
          </RadioGroup>
        )}

        {/* Step 2: Modelo */}
        {step === 2 && (
          <RadioGroup
            value={modeloSelecionado}
            onValueChange={setModeloSelecionado}
            className="grid gap-3 max-h-[300px] overflow-y-auto"
          >
            {modelosDisponiveis.map((modelo) => {
              const Icon = modelo.icon;
              return (
                <Label
                  key={modelo.id}
                  htmlFor={modelo.id}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                    modeloSelecionado === modelo.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={modelo.id} id={modelo.id} className="sr-only" />
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    modeloSelecionado === modelo.id ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "h-5 w-5 transition-colors",
                      modeloSelecionado === modelo.id ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <span className="font-medium block">{modelo.label}</span>
                    <span className="text-sm text-muted-foreground">{modelo.description}</span>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        )}

        {/* Actions */}
        <div className="flex justify-between gap-3 pt-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleNext} disabled={!tipoPericia}>
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleBack}>
                Voltar
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={!modeloSelecionado || isLoading}
              >
                {isLoading ? "Criando..." : "Criar Laudo"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
