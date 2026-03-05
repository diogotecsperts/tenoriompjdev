import { useMemo } from "react";
import { LaudoData } from "@/contexts/LaudoContext";

// Define which fields belong to each card section
// Atualizado para incluir os novos campos do modelo completo
const cardFields: Record<string, (keyof LaudoData)[]> = {
  preliminares: [
    "processoNumero",
    "processoVara",
    "reclamante",
    "reclamada",
    "dataPericia",
    "documentos",
    "assistenteTecnicoReclamante",
    "assistenteTecnicoReclamada",
    "localPericia",
    "objetivoPericia",
  ],
  "resumo-autos": [
    "resumoPeticaoInicial",
    "resumoContestacao",
    "metodologiaPericial",
  ],
  periciando: [
    "vitimaName",
    "vitimaEscolaridade",
    "vitimaNascimento",
    "vitimaProfissao",
    "vitimaDominancia",
    "dataAcidente",
    "historiaAcidente",
    "historicoOcupacional",
    "historiaAtual",
    "antecedentes",
    "tratamentos",
    "afastamentos",
  ],
  "posto-trabalho": [
    "dadosFuncionaisCargo",
    "dadosFuncionaisAdmissao",
    "dadosFuncionaisAfastamento",
    "descricaoAtividadesLaborais",
  ],
  exame: [
    "laudosMedicos",
    "examesComplementares",
    "exameFisico",
  ],
  "analise-tecnica": [
    "descricaoTecnicaDoencas",
    "nexoCausalTipo",
    "nexoCausalJustificativa",
    "analiseIncapacidadeLaboral",
  ],
  conclusao: [
    "conclusaoCID",
    "conclusaoAnalise",
    "conclusaoIncapacidade",
    "conclusaoStatus",
    "conclusaoJustificativa",
    "conclusaoDestino",
    "quesitosJuizo",
    "quesitosReclamante",
    "quesitosReclamada",
  ],
  referencias: [
    "referenciasBibliograficas",
  ],
};

// Labels amigáveis para cada card
const cardLabels: Record<string, string> = {
  preliminares: "Dados Preliminares",
  "resumo-autos": "Resumo dos Autos",
  periciando: "Dados do Periciando",
  "posto-trabalho": "Posto de Trabalho",
  exame: "Exame Clínico",
  "analise-tecnica": "Análise Técnica",
  conclusao: "Conclusão",
  referencias: "Referências",
};

function isFieldFilled(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export interface CardProgress {
  cardId: string;
  cardLabel: string;
  filledFields: number;
  totalFields: number;
  percentage: number;
}

export interface LaudoProgress {
  totalFilledFields: number;
  totalFields: number;
  overallPercentage: number;
  cardProgress: CardProgress[];
}

export function useLaudoProgress(laudo: LaudoData | null): LaudoProgress {
  return useMemo(() => {
    if (!laudo) {
      return {
        totalFilledFields: 0,
        totalFields: 0,
        overallPercentage: 0,
        cardProgress: [],
      };
    }

    let totalFilledFields = 0;
    let totalFields = 0;
    const cardProgress: CardProgress[] = [];

    for (const [cardId, fields] of Object.entries(cardFields)) {
      let filledInCard = 0;
      
      for (const field of fields) {
        if (isFieldFilled(laudo[field])) {
          filledInCard++;
        }
      }

      totalFilledFields += filledInCard;
      totalFields += fields.length;

      cardProgress.push({
        cardId,
        cardLabel: cardLabels[cardId] || cardId,
        filledFields: filledInCard,
        totalFields: fields.length,
        percentage: Math.round((filledInCard / fields.length) * 100),
      });
    }

    return {
      totalFilledFields,
      totalFields,
      overallPercentage: totalFields > 0 
        ? Math.round((totalFilledFields / totalFields) * 100) 
        : 0,
      cardProgress,
    };
  }, [laudo]);
}
