/**
 * Estrutura de cards/seções do DevPrompts para o módulo Previdenciário.
 * Espelha o formato de LAUDO_CARDS_STRUCTURE (Trabalhista), mas é totalmente
 * independente — permite que o DevPrompts filtre apenas prompts do prefixo
 * `prompt_prev_*` quando o usuário escolhe "Previdenciário" no seletor de módulo.
 *
 * Os sectionIds aqui DEVEM coincidir com os `sectionId` usados nas chamadas a
 * `getPrompt()` dentro das edge functions do módulo Previdenciário
 * (ex.: `prev-pre-processar/index.ts`), caso contrário o prompt cai em
 * "Não classificados" do módulo.
 */

import type { PromptType } from "@/lib/laudo-structure";

export const PREV_CARDS_STRUCTURE = [
  {
    id: "previdenciario",
    label: "Pré-laudo Previdenciário",
    description: "Prompts usados na extração via IA do PDF do processo previdenciário",
    sections: [
      { id: "pre-processamento", label: "Extração do Processo (PDF)" },
      { id: "identificacao", label: "Identificação" },
      { id: "queixa", label: "Queixa Principal" },
      { id: "medicacao", label: "Medicação em Uso" },
      { id: "acompanhamento", label: "Acompanhamento Médico" },
      { id: "comorbidades", label: "Comorbidades" },
      { id: "estado_mental", label: "Estado Mental" },
      { id: "ectoscopia", label: "Ectoscopia / Geral" },
      { id: "exame_ortopedico", label: "Exame Ortopédico" },
      { id: "cid", label: "CID-10" },
      { id: "conclusao", label: "Conclusão" },
    ],
  },
];

/**
 * Tipos de prompt esperados por seção (para o checklist de cobertura).
 * Seções sem prompt previsto ainda ficam com array vazio = "preenchimento manual".
 */
export const PREV_EXPECTED_PROMPT_TYPES: Record<string, PromptType[]> = {
  "pre-processamento": ["import"],
  identificacao: [],
  queixa: ["import"],
  medicacao: [],
  acompanhamento: [],
  comorbidades: [],
  estado_mental: [],
  ectoscopia: [],
  exame_ortopedico: [],
  cid: [],
  conclusao: [],
};

/**
 * Detecta se um promptId pertence ao módulo previdenciário.
 * Padrão atual: todos os prompts gravados pelas edge functions do módulo
 * começam com `prompt_prev_`.
 */
export function isPrevPromptId(promptId: string): boolean {
  return promptId.startsWith("prompt_prev_");
}
