## Problema

A edge function `test-ai-connection` (usada pelo botão "Testar conexão" no Provider Inventory do DevPanel) não conhece o provider `minimax` e retorna `Unknown provider: minimax`. A chave já está salva corretamente.

## Correção

Editar `supabase/functions/test-ai-connection/index.ts`:

1. Adicionar `case 'minimax'` no switch, chamando `testOpenAICompatible('https://api.minimax.io/v1/chat/completions', apiKey, model || 'MiniMax-M3')`.

2. Ajustar `testOpenAICompatible` para injetar `thinking: { type: 'disabled' }` e `temperature: 0` quando o endpoint contém `minimax.io`, mantendo o padrão global do MiniMax M3 (sem thinking, determinístico).

Nenhuma outra função é tocada. Após salvar, o botão "Testar conexão" para MiniMax passará a validar a chave `MINIMAX_API_KEY` diretamente contra `api.minimax.io`.
