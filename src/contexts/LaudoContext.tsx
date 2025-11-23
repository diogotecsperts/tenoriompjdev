import { createContext, useContext, useState, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";

export interface LaudoData {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  // Dados do Perito
  peritoNome: string;
  peritoEspecialidade: string;
  peritoCRM: string;
  peritoEmail: string;
  peritoTelefone: string;
  peritoEndereco: string;
  // Dados do Processo
  processoNumero: string;
  processoVara: string;
  reclamante: string;
  reclamada: string;
  dataAcidente: string;
  dataPericia: string;
  // Documentos
  documentos: string[];
  // Dados da Vítima
  vitimaName: string;
  vitimaEscolaridade: string;
  vitimaNascimento: string;
  vitimaProfissao: string;
  vitimaDominancia: string;
  // Dados do Acidente
  historicoOcupacional: string;
  historiaAcidente: string;
  // Anamnese
  historiaAtual: string;
  // Antecedentes
  antecedentes: string;
  tratamentos: string;
  afastamentos: string;
  // Planejamento
  planejamento: string[];
  // Laudos e Exames
  laudosMedicos: string;
  examesComplementares: string;
  exameFisico: string;
  // Nexo Causal
  nexoCausalTipo: string;
  nexoCausalJustificativa: string;
  // Conclusão
  conclusaoCID: string;
  conclusaoAnalise: string;
  conclusaoIncapacidade: string;
  conclusaoStatus: string;
  conclusaoJustificativa: string;
  conclusaoDestino: string;
  // Avaliação Sequelas
  tabelaSUSEP: string;
  danoEstetico: string;
  auxilioTerceiros: string;
  // Quesitos
  quesitosJuizo: string;
  quesitosReclamante: string;
  quesitosReclamada: string;
}

interface LaudoContextType {
  laudos: LaudoData[];
  currentLaudo: LaudoData | null;
  createLaudo: () => string;
  loadLaudo: (id: string) => void;
  updateLaudo: (data: Partial<LaudoData>) => void;
  saveLaudo: () => void;
  deleteLaudo: (id: string) => void;
}

const defaultLaudoData: Omit<LaudoData, "id" | "title" | "createdAt" | "updatedAt"> = {
  peritoNome: "",
  peritoEspecialidade: "",
  peritoCRM: "",
  peritoEmail: "",
  peritoTelefone: "",
  peritoEndereco: "",
  processoNumero: "",
  processoVara: "",
  reclamante: "",
  reclamada: "",
  dataAcidente: "",
  dataPericia: "",
  documentos: [],
  vitimaName: "",
  vitimaEscolaridade: "",
  vitimaNascimento: "",
  vitimaProfissao: "",
  vitimaDominancia: "",
  historicoOcupacional: "",
  historiaAcidente: "",
  historiaAtual: "",
  antecedentes: "",
  tratamentos: "",
  afastamentos: "",
  planejamento: [],
  laudosMedicos: "",
  examesComplementares: "",
  exameFisico: "",
  nexoCausalTipo: "",
  nexoCausalJustificativa: "",
  conclusaoCID: "",
  conclusaoAnalise: "",
  conclusaoIncapacidade: "",
  conclusaoStatus: "",
  conclusaoJustificativa: "",
  conclusaoDestino: "",
  tabelaSUSEP: "",
  danoEstetico: "",
  auxilioTerceiros: "",
  quesitosJuizo: "",
  quesitosReclamante: "",
  quesitosReclamada: "",
};

const LaudoContext = createContext<LaudoContextType | undefined>(undefined);

export function LaudoProvider({ children }: { children: ReactNode }) {
  const [laudos, setLaudos] = useState<LaudoData[]>(() => {
    const stored = localStorage.getItem("laudos");
    return stored ? JSON.parse(stored) : [];
  });
  const [currentLaudo, setCurrentLaudo] = useState<LaudoData | null>(null);

  const createLaudo = () => {
    const newId = `laudo-${Date.now()}`;
    const newLaudo: LaudoData = {
      id: newId,
      title: `Laudo ${laudos.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...defaultLaudoData,
    };
    setCurrentLaudo(newLaudo);
    return newId;
  };

  const loadLaudo = (id: string) => {
    const laudo = laudos.find((l) => l.id === id);
    if (laudo) {
      setCurrentLaudo(laudo);
    }
  };

  const updateLaudo = (data: Partial<LaudoData>) => {
    if (currentLaudo) {
      setCurrentLaudo({
        ...currentLaudo,
        ...data,
        updatedAt: new Date(),
      });
    }
  };

  const saveLaudo = () => {
    if (currentLaudo) {
      const existing = laudos.find((l) => l.id === currentLaudo.id);
      let updatedLaudos;
      if (existing) {
        updatedLaudos = laudos.map((l) =>
          l.id === currentLaudo.id ? currentLaudo : l
        );
      } else {
        updatedLaudos = [...laudos, currentLaudo];
      }
      setLaudos(updatedLaudos);
      localStorage.setItem("laudos", JSON.stringify(updatedLaudos));
      toast({
        title: "Laudo salvo",
        description: "Suas alterações foram salvas com sucesso.",
      });
    }
  };

  const deleteLaudo = (id: string) => {
    const updated = laudos.filter((l) => l.id !== id);
    setLaudos(updated);
    localStorage.setItem("laudos", JSON.stringify(updated));
    toast({
      title: "Laudo excluído",
      description: "O laudo foi removido com sucesso.",
    });
  };

  return (
    <LaudoContext.Provider
      value={{
        laudos,
        currentLaudo,
        createLaudo,
        loadLaudo,
        updateLaudo,
        saveLaudo,
        deleteLaudo,
      }}
    >
      {children}
    </LaudoContext.Provider>
  );
}

export function useLaudo() {
  const context = useContext(LaudoContext);
  if (context === undefined) {
    throw new Error("useLaudo must be used within a LaudoProvider");
  }
  return context;
}
