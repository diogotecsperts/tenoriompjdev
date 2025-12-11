import { useMemo } from "react";
import { LaudoData } from "@/contexts/LaudoContext";

// Define which fields belong to each card section
const cardFields: Record<string, (keyof LaudoData)[]> = {
  preliminares: [
    "peritoNome",
    "peritoEspecialidade", 
    "peritoCRM",
    "peritoEmail",
    "peritoTelefone",
    "peritoEndereco",
    "processoNumero",
    "processoVara",
    "reclamante",
    "reclamada",
    "dataAcidente",
    "dataPericia",
    "documentos",
  ],
  periciando: [
    "vitimaName",
    "vitimaEscolaridade",
    "vitimaNascimento",
    "vitimaProfissao",
    "vitimaDominancia",
    "historicoOcupacional",
    "historiaAcidente",
    "historiaAtual",
    "antecedentes",
    "tratamentos",
    "afastamentos",
    "planejamento",
  ],
  exame: [
    "laudosMedicos",
    "examesComplementares",
    "exameFisico",
  ],
  conclusao: [
    "nexoCausalTipo",
    "nexoCausalJustificativa",
    "conclusaoCID",
    "conclusaoAnalise",
    "conclusaoIncapacidade",
    "conclusaoStatus",
    "conclusaoJustificativa",
    "conclusaoDestino",
    "tabelaSUSEP",
    "danoEstetico",
    "auxilioTerceiros",
  ],
  quesitos: [
    "quesitosJuizo",
    "quesitosReclamante",
    "quesitosReclamada",
  ],
};

function isFieldFilled(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export interface CardProgress {
  cardId: string;
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
