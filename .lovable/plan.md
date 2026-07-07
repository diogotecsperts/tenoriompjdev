## Diagnóstico confirmado

O problema não foi só visual. O painel ainda pode usar `gemini-3-pro-preview` porque:

- A lista dinâmica/cacheada de modelos do Gemini vem do backend com modelos Pro no topo, e o painel substitui a lista fixa por essa lista cacheada.
- Ao clicar na linha do Gemini, `selectProvider()` usa `provider.models[0]`; se o cache começa com `gemini-3-pro-preview`, ele vira o modelo padrão.
- O botão `Test` também usa `provider.models[0]`, não o modelo selecionado no card “Modelo Padrão”. Então mesmo após escolher Flash, o teste pode continuar testando Pro.
- A função de teste ainda mapeia `gemini-3-pro-preview` para `gemini-2.5-pro`, que continua exigindo billing/free tier zero, mantendo o erro de limite.

OpenRouter não precisa ser alterado e será preservado.

## Plano de correção

1. **Criar uma regra única de modelos seguros do Gemini**
   - Definir `gemini-2.5-flash` como modelo padrão seguro do provider Gemini.
   - Tratar como preferenciais/seguros os modelos Flash, incluindo `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`.
   - Ordenar qualquer lista dinâmica/cacheada para que Flash venha antes de Pro.
   - Empurrar modelos Pro/Pro Preview para o fim e marcar como “requer billing”.

2. **Corrigir seleção do provider no Provider Inventory**
   - Ao clicar em Google Gemini, definir sempre `default_ai_model = gemini-2.5-flash`, salvo se já houver um modelo Gemini Flash válido selecionado.
   - Nunca escolher `provider.models[0]` cru para Gemini.
   - Não tocar no comportamento de OpenRouter, DeepSeek, Lovable ou outros providers.

3. **Corrigir o botão Test**
   - Para Gemini, testar o modelo efetivamente selecionado no card “Modelo Padrão” quando Gemini for o provider ativo.
   - Se o Gemini não estiver ativo, testar `gemini-2.5-flash` como smoke test seguro, em vez do primeiro modelo da lista cacheada.
   - Assim, salvar/reaplicar a chave Gemini também usará Flash no auto-teste.

4. **Corrigir cache/modelos dinâmicos do Gemini**
   - Ao carregar `gemini_models_cache` e ao clicar “Atualizar Modelos”, ordenar e sanear a lista antes de atualizar o provider.
   - Garantir que modelos TTS/imagem não virem modelo padrão textual por acidente.
   - Preservar a função “Atualizar Modelos” e os modelos novos, apenas com ordenação segura.

5. **Corrigir a função de teste Gemini**
   - Remover o mapeamento perigoso de `gemini-3-pro-preview -> gemini-2.5-pro` para o teste padrão.
   - Para aliases preview Flash, manter rota para Flash seguro quando necessário.
   - Aumentar `maxOutputTokens` do teste Gemini para evitar falso erro por truncamento.
   - Quando houver erro `free_tier_requests` com `limit: 0`, retornar mensagem clara: modelo Pro/Preview sem cota gratuita; use Flash ou habilite billing.

6. **Correção pontual dos dados atuais, sem mexer no OpenRouter**
   - Se a configuração global estiver com provider Gemini e modelo Pro/Preview, trocar para `gemini-2.5-flash`.
   - Se o provider global estiver OpenRouter, não alterar o provider nem seus modelos.
   - Opcionalmente limpar/reescrever apenas a ordem do cache Gemini para Flash aparecer primeiro.

7. **Validação**
   - Conferir no banco que o OpenRouter continua igual.
   - Testar a função `test-ai-connection` com Gemini usando `gemini-2.5-flash`.
   - Verificar logs para confirmar que o teste não chama mais `gemini-3-pro-preview` nem `gemini-2.5-pro` ao testar Gemini por padrão.
   - Conferir no DevPanel que, ao mudar para Google Gemini, o card “Modelo Padrão” mostra Flash primeiro e o botão Test usa o mesmo modelo seguro.

## Arquivos envolvidos

- `src/components/dev-panel/DevSettings.tsx`
- `src/components/dev-panel/DevUserSettings.tsx`
- `supabase/functions/test-ai-connection/index.ts`
- Possível ajuste pontual em dados de `system_config` apenas para cache/config Gemini, sem alterar OpenRouter.

## Garantia de escopo

- Não alterar a função operacional do OpenRouter.
- Não alterar modelos OpenRouter.
- Não trocar provider global atual se ele estiver OpenRouter.
- Não alterar DeepSeek nesta correção, exceto se algum teste confirmar interferência direta, o que até agora não apareceu.