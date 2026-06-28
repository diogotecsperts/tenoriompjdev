/**
 * Estrutura de cards/seções do DevPrompts para o módulo Previdenciário.
 * Espelha o formato de LAUDO_CARDS_STRUCTURE (Trabalhista), mas é totalmente
 * independente — permite que o DevPrompts filtre apenas prompts do prefixo
 * `prompt_prev_*` quando o usuário escolhe "Previdenciário" no seletor.
 */

import type { PromptType } from "@/lib/laudo-structure";

export const PREV_CARDS_STRUCTURE = [
  {
    id: "previdenciario",
    label: "Pré-laudo Previdenciário",
    description:
      "Prompts usados nas três passadas de IA do pré-processamento do PDF do processo",
    sections: [
      { id: "pre-processamento", label: "Extração estruturada do PDF" },
      { id: "queixa", label: "Unificação da Queixa Principal" },
      { id: "resumo", label: "Extração dos laudos de exames" },
    ],
  },
];

export const PREV_EXPECTED_PROMPT_TYPES: Record<string, PromptType[]> = {
  "pre-processamento": ["import"],
  queixa: ["import"],
  resumo: ["import"],
};

export function isPrevPromptId(promptId: string): boolean {
  return promptId.startsWith("prompt_prev_");
}
