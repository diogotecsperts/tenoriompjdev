/**
 * Laudo Structure - Fonte única de verdade para a estrutura de cards/seções do laudo
 * 
 * Este módulo define a estrutura de navegação do LaudoEditor e é compartilhado
 * com a página de gerenciamento de prompts (DevPrompts) para garantir sincronização.
 * 
 * IMPORTANTE: Qualquer alteração aqui reflete automaticamente em:
 * - LaudoEditor (navegação e formulários)
 * - DevPrompts (organização de prompts por seção)
 * 
 * Ao adicionar uma nova seção:
 * 1. Adicione o componente em src/components/laudo/sections/
 * 2. Adicione a seção aqui no card apropriado
 * 3. Os prompts relacionados serão auto-descobertos e classificados automaticamente
 */

import { LucideIcon } from "lucide-react";

// ============================================
// TIPOS
// ============================================

export interface LaudoSection {
  id: string;
  label: string;
  component?: React.ComponentType<any>; // Opcional para permitir uso sem componentes
}

export interface LaudoCard {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  sections: LaudoSection[];
}

// Tipo para estrutura simplificada (sem componentes) usada em DevPrompts
export interface LaudoCardSimple {
  id: string;
  title: string;
  icon: LucideIcon;
  sections: { id: string; label: string }[];
}

// ============================================
// ESTRUTURA PRINCIPAL
// ============================================

/**
 * Estrutura completa dos cards do LaudoEditor
 * Organizada conforme modelo profissional de laudo médico pericial
 */
export const LAUDO_CARDS_STRUCTURE: Omit<LaudoCard, "icon">[] = [
  {
    id: "preliminares",
    label: "Dados Preliminares",
    description: "Dados do processo, objetivo e documentos avaliados",
    sections: [
      { id: "perito", label: "Dados do Perito" },
      { id: "processo", label: "Dados do Processo" },
      { id: "objetivo", label: "Objetivo da Perícia" },
      { id: "documentos", label: "Documentos Avaliados" },
    ],
  },
  {
    id: "resumo-autos",
    label: "Resumo dos Autos",
    description: "Resumo da petição inicial e contestação",
    sections: [
      { id: "resumo", label: "Resumo dos Autos" },
      { id: "metodologia", label: "Metodologia Pericial" },
    ],
  },
  {
    id: "periciando",
    label: "Dados do Periciando",
    description: "Dados da vítima, acidente e histórico clínico",
    sections: [
      { id: "vitima", label: "Dados da Vítima" },
      { id: "acidente", label: "Dados do Acidente" },
      { id: "anamnese", label: "Anamnese" },
      { id: "antecedentes", label: "Antecedentes Patológicos" },
    ],
  },
  {
    id: "posto-trabalho",
    label: "Posto de Trabalho",
    description: "Dados funcionais e descrição das atividades",
    sections: [
      { id: "dados-posto", label: "Dados do Posto de Trabalho" },
    ],
  },
  {
    id: "exame",
    label: "Exame Clínico",
    description: "Laudos médicos, exames e exame físico",
    sections: [
      { id: "laudos", label: "Laudos Médicos" },
      { id: "exames", label: "Exames Complementares" },
      { id: "exame-fisico", label: "Exame Físico" },
    ],
  },
  {
    id: "analise-tecnica",
    label: "Análise Técnica",
    description: "Descrição das doenças, nexo causal e incapacidade",
    sections: [
      { id: "descricao-doencas", label: "Descrição Técnica das Doenças" },
      { id: "nexo", label: "Nexo Causal" },
      { id: "analise-incapacidade", label: "Análise da Incapacidade" },
    ],
  },
  {
    id: "conclusao",
    label: "Conclusão",
    description: "Conclusão, sequelas e quesitos",
    sections: [
      { id: "conclusao", label: "Conclusão" },
      { id: "sequelas", label: "Avaliação de Sequelas" },
      { id: "quesitos", label: "Quesitos" },
    ],
  },
  {
    id: "referencias",
    label: "Referências",
    description: "Referências bibliográficas utilizadas",
    sections: [
      { id: "referencias", label: "Referências Bibliográficas" },
    ],
  },
];

/**
 * Cards adicionais específicos para gerenciamento de prompts
 * (não aparecem no LaudoEditor)
 */
export const PROMPT_ONLY_CARDS: Omit<LaudoCard, "icon">[] = [
  {
    id: "_system",
    label: "Sistema",
    description: "Prompts de sistema para funções de IA",
    sections: [
      { id: "_gerar_resumos", label: "System Prompt - Geração" },
      { id: "_import", label: "System Prompt - Importação" },
    ],
  },
  {
    id: "_global",
    label: "Globais",
    description: "Prompts globais aplicados em múltiplos contextos",
    sections: [
      { id: "_aprimorar", label: "Aprimorar Texto" },
    ],
  },
  {
    id: "impugnacao",
    label: "Impugnação",
    description: "Prompts para resposta a impugnações",
    sections: [
      { id: "resposta", label: "Resposta à Impugnação" },
    ],
  },
];

// ============================================
// HELPERS
// ============================================

/**
 * Retorna a lista de IDs de todos os cards do laudo
 */
export function getLaudoCardIds(): string[] {
  return LAUDO_CARDS_STRUCTURE.map(c => c.id);
}

/**
 * Retorna a lista de IDs de todas as seções (flat)
 */
export function getAllSectionIds(): string[] {
  return LAUDO_CARDS_STRUCTURE.flatMap(c => c.sections.map(s => s.id));
}

/**
 * Busca um card por ID
 */
export function getCardById(cardId: string): Omit<LaudoCard, "icon"> | undefined {
  return [...LAUDO_CARDS_STRUCTURE, ...PROMPT_ONLY_CARDS].find(c => c.id === cardId);
}

/**
 * Busca uma seção por ID (retorna card e seção)
 */
export function getSectionById(sectionId: string): { 
  card: Omit<LaudoCard, "icon">; 
  section: LaudoSection;
} | undefined {
  for (const card of [...LAUDO_CARDS_STRUCTURE, ...PROMPT_ONLY_CARDS]) {
    const section = card.sections.find(s => s.id === sectionId);
    if (section) {
      return { card, section };
    }
  }
  return undefined;
}

/**
 * Retorna o índice global de uma seção (para navegação sequencial)
 */
export function getSectionGlobalIndex(cardId: string, sectionId: string): number {
  let index = 0;
  for (const card of LAUDO_CARDS_STRUCTURE) {
    for (const section of card.sections) {
      if (card.id === cardId && section.id === sectionId) {
        return index;
      }
      index++;
    }
  }
  return -1;
}

/**
 * Retorna a próxima seção (para navegação)
 */
export function getNextSection(cardId: string, sectionId: string): { 
  cardId: string; 
  sectionId: string;
} | null {
  const currentIndex = getSectionGlobalIndex(cardId, sectionId);
  if (currentIndex === -1) return null;
  
  let index = 0;
  for (const card of LAUDO_CARDS_STRUCTURE) {
    for (const section of card.sections) {
      if (index === currentIndex + 1) {
        return { cardId: card.id, sectionId: section.id };
      }
      index++;
    }
  }
  return null;
}

/**
 * Retorna a seção anterior (para navegação)
 */
export function getPreviousSection(cardId: string, sectionId: string): { 
  cardId: string; 
  sectionId: string;
} | null {
  const currentIndex = getSectionGlobalIndex(cardId, sectionId);
  if (currentIndex <= 0) return null;
  
  let index = 0;
  for (const card of LAUDO_CARDS_STRUCTURE) {
    for (const section of card.sections) {
      if (index === currentIndex - 1) {
        return { cardId: card.id, sectionId: section.id };
      }
      index++;
    }
  }
  return null;
}

/**
 * Conta o total de seções
 */
export function getTotalSectionsCount(): number {
  return LAUDO_CARDS_STRUCTURE.reduce((acc, card) => acc + card.sections.length, 0);
}
