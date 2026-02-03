# Plano de Correção: Limpeza de Prompts Obsoletos e Melhoria da UI

## ✅ IMPLEMENTADO

### Problema Resolvido

1. **Prompt Fantasma**: `prompt_regen_descricaoPostoTrabalho` será deletado automaticamente ao executar "Restaurar Padrão de Fábrica"
2. **Detecção de Órfãos**: O sistema agora detecta e exibe prompts no banco que foram removidos do código
3. **UI Documentada**: Tooltip explicando "Gerar vs Regerar" adicionado

### Arquivos Modificados

- `supabase/functions/seed-prompts/index.ts` - Adicionado cleanup de prompts obsoletos e detecção de órfãos
- `src/components/dev-panel/DevPrompts.tsx` - Seção de órfãos no dialog + tooltip explicativo

### Como Usar

1. **Verificar Atualizações**: Clique no botão para ver prompts órfãos (em vermelho)
2. **Restaurar Tudo**: Executar restaura prompts E deleta os órfãos
3. **Tooltip**: Passe o mouse sobre "Nenhum prompt de geração" para ver explicação
