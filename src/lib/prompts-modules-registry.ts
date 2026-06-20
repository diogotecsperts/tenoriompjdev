/**
 * Registry de módulos para o DevPrompts.
 *
 * Cada módulo expõe sua própria estrutura de cards/seções, mapa de tipos
 * esperados, configs fixas e função de match de promptId. O componente
 * DevPrompts lê tudo a partir daqui para se reconfigurar quando o usuário
 * troca de módulo no seletor.
 *
 * A separação é puramente client-side sobre os prompts já carregados de
 * `system_config` — nada é alterado no schema, nas edge functions ou no
 * runtime de cada módulo.
 */

import {
  LAUDO_CARDS_STRUCTURE,
  PROMPT_ONLY_CARDS,
  EXPECTED_PROMPT_TYPES,
  FIXED_CONFIG_SECTIONS,
  type PromptType,
} from "@/lib/laudo-structure";
import {
  PREV_CARDS_STRUCTURE,
  PREV_EXPECTED_PROMPT_TYPES,
  isPrevPromptId,
} from "@/modules/previdenciario/lib/prev-prompts-structure";
import {
  User,
  FileText,
  MessageSquare,
  Briefcase,
  Stethoscope,
  ClipboardCheck,
  CheckCircle2,
  BookOpen,
  RefreshCw,
  Sparkles,
  Scale,
  type LucideIcon,
} from "lucide-react";

export type PromptModule = "trabalhista" | "previdenciario";

export interface PromptModuleConfig {
  id: PromptModule;
  label: string;
  cards: Array<{
    id: string;
    label: string;
    description?: string;
    sections: { id: string; label: string }[];
  }>;
  promptCards: Array<{
    id: string;
    label: string;
    description?: string;
    sections: { id: string; label: string }[];
  }>;
  expectedTypes: Record<string, PromptType[]>;
  fixedConfig: Record<string, string>;
  cardIcons: Record<string, LucideIcon>;
  /** Retorna true se o promptId pertence a este módulo. */
  matchPromptId: (id: string) => boolean;
  /** Mostrar ações de seed/check-updates (defaults hardcoded no `seed-prompts`). */
  hasFactoryDefaults: boolean;
}

const trabalhistaIcons: Record<string, LucideIcon> = {
  preliminares: User,
  "resumo-autos": FileText,
  periciando: MessageSquare,
  "posto-trabalho": Briefcase,
  exame: Stethoscope,
  "analise-tecnica": ClipboardCheck,
  conclusao: CheckCircle2,
  referencias: BookOpen,
  _system: RefreshCw,
  _global: Sparkles,
  impugnacao: Scale,
};

const previdenciarioIcons: Record<string, LucideIcon> = {
  previdenciario: Stethoscope,
};

export const PROMPT_MODULES: Record<PromptModule, PromptModuleConfig> = {
  trabalhista: {
    id: "trabalhista",
    label: "Trabalhista",
    cards: LAUDO_CARDS_STRUCTURE,
    promptCards: PROMPT_ONLY_CARDS,
    expectedTypes: EXPECTED_PROMPT_TYPES,
    fixedConfig: FIXED_CONFIG_SECTIONS,
    cardIcons: trabalhistaIcons,
    // Trabalhista = qualquer prompt que NÃO seja do previdenciário.
    matchPromptId: (id) => !isPrevPromptId(id),
    hasFactoryDefaults: true,
  },
  previdenciario: {
    id: "previdenciario",
    label: "Previdenciário",
    cards: PREV_CARDS_STRUCTURE,
    promptCards: [],
    expectedTypes: PREV_EXPECTED_PROMPT_TYPES,
    fixedConfig: {},
    cardIcons: previdenciarioIcons,
    matchPromptId: isPrevPromptId,
    hasFactoryDefaults: false,
  },
};

export const PROMPT_MODULE_LIST: PromptModuleConfig[] = [
  PROMPT_MODULES.trabalhista,
  PROMPT_MODULES.previdenciario,
];

const STORAGE_KEY = "devPromptsModule";

export function readActiveModule(): PromptModule {
  if (typeof window === "undefined") return "trabalhista";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "previdenciario" ? "previdenciario" : "trabalhista";
}

export function persistActiveModule(m: PromptModule): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, m);
}
