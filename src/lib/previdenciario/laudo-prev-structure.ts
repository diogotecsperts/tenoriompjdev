/**
 * SSOT do módulo PREVIDENCIÁRIO
 * Isolado de src/lib/laudo-structure.ts. Não importar entre si.
 */

export interface PrevSection {
  id: string;
  label: string;
}

export interface PrevCard {
  id: string;
  label: string;
  description: string;
  sections: PrevSection[];
}

export const LAUDO_PREV_CARDS_STRUCTURE: PrevCard[] = [
  {
    id: "preliminares",
    label: "Dados Preliminares",
    description: "Perito, processo, objetivo e documentos",
    sections: [
      { id: "perito", label: "Dados do Perito" },
      { id: "processo", label: "Dados do Processo" },
      { id: "objetivo", label: "Objetivo da Perícia" },
      { id: "documentos", label: "Documentos Avaliados" },
    ],
  },
  {
    id: "resumo-adm",
    label: "Resumo Administrativo",
    description: "Resumo do recurso/petição e metodologia",
    sections: [
      { id: "resumo-adm", label: "Resumo Administrativo" },
      { id: "metodologia-prev", label: "Metodologia Pericial" },
    ],
  },
  {
    id: "segurado",
    label: "Segurado",
    description: "Identificação, qualidade de segurado e benefício",
    sections: [
      { id: "identificacao", label: "Identificação" },
      { id: "qualidade-segurado", label: "Qualidade de Segurado" },
      { id: "beneficio", label: "Benefício Pleiteado" },
    ],
  },
  {
    id: "historia",
    label: "História",
    description: "História clínica, laboral e antecedentes",
    sections: [
      { id: "historia-clinica", label: "História Clínica" },
      { id: "historia-laboral", label: "História Laboral" },
      { id: "antecedentes", label: "Antecedentes Patológicos" },
      { id: "tratamentos", label: "Tratamentos" },
    ],
  },
  {
    id: "exame",
    label: "Exame Clínico",
    description: "Laudos, exames e exame físico",
    sections: [
      { id: "laudos-medicos", label: "Laudos Médicos" },
      { id: "exames-complementares", label: "Exames Complementares" },
      { id: "exame-fisico", label: "Exame Físico" },
    ],
  },
  {
    id: "analise-tecnica",
    label: "Análise Técnica",
    description: "CIDs, nexo, incapacidade e enquadramento legal",
    sections: [
      { id: "cids", label: "Diagnóstico (CID-10)" },
      { id: "nexo-prev", label: "Nexo Previdenciário" },
      { id: "incapacidade", label: "Análise da Incapacidade" },
      { id: "enquadramento-legal", label: "Enquadramento Legal" },
    ],
  },
  {
    id: "conclusao",
    label: "Conclusão",
    description: "Parecer final e quesitos",
    sections: [
      { id: "conclusao-prev", label: "Conclusão Previdenciária" },
      { id: "quesitos-prev", label: "Quesitos" },
    ],
  },
  {
    id: "referencias",
    label: "Referências",
    description: "Referências bibliográficas",
    sections: [
      { id: "referencias", label: "Referências Bibliográficas" },
    ],
  },
];

export function getPrevCardById(cardId: string) {
  return LAUDO_PREV_CARDS_STRUCTURE.find((c) => c.id === cardId);
}

export function getPrevSectionById(sectionId: string) {
  for (const card of LAUDO_PREV_CARDS_STRUCTURE) {
    const section = card.sections.find((s) => s.id === sectionId);
    if (section) return { card, section };
  }
  return undefined;
}

export function getAllPrevSectionIds(): string[] {
  return LAUDO_PREV_CARDS_STRUCTURE.flatMap((c) => c.sections.map((s) => s.id));
}
