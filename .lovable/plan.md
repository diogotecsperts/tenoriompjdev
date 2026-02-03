

# Adicionar Prompt de Impugnação ao DevPanel

## Objetivo

Permitir que o prompt usado no botão "Gerar com IA" da página Responder Impugnação seja editável no DevPanel.

## Escopo Reduzido

| O que será feito | O que NÃO será alterado |
|------------------|-------------------------|
| Integrar `gerar-resposta-impugnacao` com `prompt-manager` | Nenhuma tabela do banco |
| Adicionar 1 prompt ao `seed-prompts` | Nenhuma lógica de negócio |
| Registrar prompt no banco | Nenhum componente de UI |

## Risco Real

**Zero impacto em laudos.** Se algo quebrar, apenas o botão "Gerar com IA" na página de impugnação para de funcionar. O fallback hardcoded garante que mesmo isso seja improvável.

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/gerar-resposta-impugnacao/index.ts` | Usar `getPrompt()` com fallback |
| `supabase/functions/seed-prompts/index.ts` | Adicionar `prompt_system_impugnacao` |

## Implementação

### 1. Modificar gerar-resposta-impugnacao/index.ts

```typescript
// Adicionar import
import { getPrompt } from "../_shared/prompt-manager.ts";

// Mover prompt atual para constante de fallback
const DEFAULT_SYSTEM_PROMPT = `Você é um perito médico especialista...`;

// Na função serve(), antes de chamar callAI():
const systemPromptFinal = await getPrompt(
  'prompt_system_impugnacao',
  DEFAULT_SYSTEM_PROMPT,
  {}
);

// Usar systemPromptFinal no callAI()
```

### 2. Adicionar ao seed-prompts/index.ts

```typescript
prompt_system_impugnacao: {
  cardId: 'impugnacao',
  sectionId: 'resposta',
  description: 'Instruções para Gerar Resposta a Impugnação',
  prompt: `Você é um perito médico especialista em medicina do trabalho...`
}
```

### 3. Inserir prompt no banco

```sql
INSERT INTO system_config (id, value, description)
VALUES (
  'prompt_system_impugnacao',
  '"Você é um perito médico especialista..."',
  'Instruções para Gerar Resposta a Impugnação'
);
```

## Resultado

- Prompt aparecerá no DevPanel > Prompts IA
- Editável sem deploy de código
- Se banco falhar → usa fallback hardcoded
- Laudos não são afetados em nenhum cenário

