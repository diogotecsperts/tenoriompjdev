# Correção de Bug: Tratamento de Erro na Geração de Referências

## Problema
Ao clicar em "Gerar Referências" sem CIDs ou Conclusão preenchidos, a Edge Function `gerar-justificativa-medica` retorna corretamente 400 com mensagem de validação. No entanto, o frontend não captura esse erro elegantemente, causando um **Runtime Error** (crash na tela).

## Diagnóstico
O arquivo `src/components/laudo/sections/ReferenciasBibliograficas.tsx` possui um bloco `try...catch`, mas o erro da Edge Function está escapando como erro global — provavelmente porque `supabase.functions.invoke` está **lançando** (throw) o erro em vez de retorná-lo no objeto `error` em alguns cenários, ou a extração da mensagem falha e o `throw new Error` interno não é capturado corretamente.

## Solução
Alterar apenas o arquivo `src/components/laudo/sections/ReferenciasBibliograficas.tsx`:

1. **Adicionar try...catch interno** ao redor do `supabase.functions.invoke` para capturar erros lançados diretamente pelo Supabase client.
2. **Substituir `throw` por `return` + `toast.error`** dentro do bloco principal — evita propagar qualquer erro para o `catch` externo.
3. **Extrair mensagem de erro com parse JSON** — a mensagem da Edge Function pode vir embutida em JSON dentro da string de erro (ex: `Edge function returned 400: Error, {"error":"..."}`). Usar regex + `JSON.parse` para extrair o campo `error` do payload.
4. **Manter o catch externo** como última linha de defesa, com tratamento seguro para `Error`, `string` e outros tipos.

## Escopo
- **Apenas frontend:** arquivo `ReferenciasBibliograficas.tsx`
- **Zero alterações no backend ou Edge Functions** — a validação da Edge Function está correta
- **Zero alterações em outros componentes ou fluxos de dados**

## Risco
Mínimo — apenas aprimora o tratamento de erro local no botão de geração de referências, sem afetar lógica de negócio ou persistência.