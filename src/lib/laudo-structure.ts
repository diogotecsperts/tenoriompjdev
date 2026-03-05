/**
 * =========================================
 * LAUDO STRUCTURE - FONTE ÚNICA DE VERDADE
 * =========================================
 * 
 * Este módulo define a estrutura de cards/seções do laudo e é compartilhado
 * por todo o sistema para garantir sincronização.
 * 
 * ARQUIVOS QUE CONSOMEM ESTA ESTRUTURA:
 * - src/pages/LaudoEditor.tsx (navegação e formulários)
 * - src/components/dev-panel/DevPrompts.tsx (gerenciador de prompts)
 * 
 * =========================================
 * GUIA: COMO ADICIONAR UM NOVO CAMPO/SEÇÃO
 * =========================================
 * 
 * PASSO 1: ADICIONAR A SEÇÃO NESTA ESTRUTURA
 * -------------------------------------------
 * Localize o card apropriado em LAUDO_CARDS_STRUCTURE e adicione:
 *   { id: "novo-campo", label: "Nome do Novo Campo" }
 * 
 * Convenções de ID:
 * - Use kebab-case para IDs compostos (ex: "exame-fisico")
 * - Use nomes curtos e descritivos
 * - O ID será usado como referência em todo o sistema
 * 
 * 
 * PASSO 2: CRIAR O COMPONENTE DE FORMULÁRIO
 * -------------------------------------------
 * Arquivo: src/components/laudo/sections/NovoCampo.tsx
 * 
 * Template básico:
 *   export function NovoCampo() {
 *     const { laudo, updateLaudo, isLoading } = useLaudo();
 *     return (
 *       <LaudoTextareaAIField
 *         label="Nome do Campo"
 *         fieldName="nome_campo_banco"
 *         promptKey="novoCampo"
 *       />
 *     );
 *   }
 * 
 * 
 * PASSO 3: REGISTRAR O COMPONENTE NO LAUDOEDITOR
 * -----------------------------------------------
 * Arquivo: src/pages/LaudoEditor.tsx
 * 
 * a) Importar o componente:
 *    import { NovoCampo } from "@/components/laudo/sections/NovoCampo";
 * 
 * b) Adicionar ao renderSection():
 *    case "novo-campo": return <NovoCampo />;
 * 
 * 
 * PASSO 4: ADICIONAR PROMPT DE IMPORTAÇÃO (se aplicável)
 * -------------------------------------------------------
 * Arquivo: supabase/functions/_shared/build-import-prompt.ts
 * 
 * a) Adicionar ao DEFAULT_IMPORT_PROMPTS:
 *    prompt_import_novoCampo: {
 *      section: 'Nome do Campo',
 *      order: XX,  // Próximo número disponível
 *      prompt: `Instruções de extração...`
 *    }
 * 
 * b) Adicionar ao IMPORT_JSON_TEMPLATE a propriedade JSON correspondente
 * 
 * c) Adicionar mapeamento em seed-prompts/index.ts cardMapping:
 *    prompt_import_novoCampo: { cardId: 'card-id', sectionId: 'novo-campo' }
 * 
 * 
 * PASSO 5: ADICIONAR PROMPT DE REGENERAÇÃO (se aplicável)
 * --------------------------------------------------------
 * Arquivo: supabase/functions/seed-prompts/index.ts
 * 
 * Adicionar ao objeto regenPrompts:
 *   prompt_regen_novoCampo: {
 *     cardId: 'card-id',
 *     sectionId: 'novo-campo',
 *     description: 'Nome do Campo - Regerar via PDF',
 *     order: XX,
 *     prompt: `Instruções de regeneração...`
 *   }
 * 
 * 
 * PASSO 6: ADICIONAR PROMPT DE GERAÇÃO (se analítico)
 * ----------------------------------------------------
 * Arquivo: supabase/functions/seed-prompts/index.ts
 * 
 * Adicionar ao objeto genPrompts:
 *   prompt_gen_novoCampo: {
 *     cardId: 'card-id',
 *     sectionId: 'novo-campo',
 *     description: 'Nome do Campo',
 *     order: XX,
 *     prompt: `Instruções de geração...`,
 *     variables: ['var1', 'var2']  // Variáveis disponíveis
 *   }
 * 
 * 
 * PASSO 7: SINCRONIZAR NO DEVPANEL
 * ---------------------------------
 * 1. Acesse DevPanel > Prompts IA
 * 2. Clique em "Verificar Atualizações"
 * 3. Clique em "Sincronizar labels (preserva conteúdo)"
 * 4. Confirme que o novo campo aparece na seção correta
 * 
 * 
 * PASSO 8: TESTAR O FLUXO COMPLETO
 * ---------------------------------
 * a) Importação: Upload de PDF e verificar se campo é preenchido
 * b) Regeneração: Clicar no botão de refresh e verificar resultado
 * c) Geração: Se analítico, verificar se gera corretamente
 * d) Edição de Prompt: Editar no DevPanel e testar novamente
 * 
 */

import { LucideIcon } from "lucide-react";

// ============================================
// CAMPOS FIXOS (gerenciados via system_config)
// ============================================

/**
 * Mapeamento de seções que são gerenciadas via tabela system_config
 * (não possuem prompts de IA associados).
 * 
 * Formato: { sectionId: configId }
 * - sectionId: ID da seção no LAUDO_CARDS_STRUCTURE
 * - configId: ID na tabela system_config
 */
export const FIXED_CONFIG_SECTIONS: Record<string, string> = {
  'metodologia': 'config_metodologia_padrao',
};

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
// TIPOS DE PROMPT ESPERADOS POR SEÇÃO
// ============================================

/**
 * Mapeamento de quais tipos de prompt são esperados para cada seção.
 * Usado pelo DevPrompts para exibir checklist de cobertura.
 * 
 * Tipos:
 * - 'import': Extração inicial do PDF (processar-autos)
 * - 'gen': Geração analítica (gerar-resumos)
 * - 'regen': Regeneração via botão refresh (regerar-campo-pdf)
 * 
 * Seções com array vazio [] são preenchidas manualmente pelo usuário.
 */
export type PromptType = 'import' | 'gen' | 'regen';

export const EXPECTED_PROMPT_TYPES: Record<string, PromptType[]> = {
  // Preliminares
  'perito': [],           // Preenchimento manual (dados do perfil)
  'processo': ['import'], // Número do processo, vara, partes
  'objetivo': [],         // Preenchimento manual
  'documentos': [],       // Checkbox manual
  
  // Resumo dos Autos
  'resumo': ['import', 'regen'],  // Petição inicial e contestação
  'metodologia': [],              // Preenchimento manual
  
  // Periciando
  'vitima': ['import'],           // Dados pessoais
  'acidente': ['import', 'regen'], // Histórico ocupacional, história do acidente
  'anamnese': ['import', 'regen'], // História atual, tratamentos
  'antecedentes': ['import', 'regen'],
  
  // Posto de Trabalho
  'dados-posto': ['import', 'regen'],
  
  // Exame Clínico
  'laudos': ['import', 'regen'],
  'exames': ['import', 'regen'],
  'exame-fisico': ['import', 'regen'],
  
  // Análise Técnica
  'descricao-doencas': ['import', 'gen', 'regen'],
  'nexo': ['import', 'gen'],
  'analise-incapacidade': ['import', 'gen'],
  
  // Conclusão
  'conclusao': ['regen'],
  'quesitos': ['import'],
  
  // Referências
  'referencias': ['gen'],
};

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
    description: "Conclusão e quesitos",
    sections: [
      { id: "conclusao", label: "Conclusão" },
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
      { id: "_internal", label: "Prompts Internos" },
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
