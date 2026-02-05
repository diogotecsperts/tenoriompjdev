# Corrigir Texto Fixo da Metodologia Pericial - ✅ CONCLUÍDO

## ✅ Implementação Finalizada

Todas as etapas do plano foram implementadas com sucesso:

### Etapa 1: ImportarAutosDialog.tsx ✅
- Adicionada busca do texto padrão do `system_config` antes de criar o laudo
- Campo `metodologia_pericial: metodologiaPadrao` incluído no objeto `laudoData`

### Etapa 2: LaudoContext.tsx ✅
- Texto hardcoded removido da função `createEmptyLaudo()`
- Campo `metodologiaPericial` agora inicia vazio

### Etapa 3: Migração SQL ✅
- DEFAULT da coluna `metodologia_pericial` atualizado para string vazia
- Novos laudos não recebem mais texto hardcoded automaticamente

## Resultado

Agora ao importar um PDF:
- O texto da Metodologia Pericial é buscado do `config_metodologia_padrao` no banco
- O botão "Restaurar padrão" continua funcionando corretamente
- Alterações no texto padrão são refletidas em novos laudos automaticamente
