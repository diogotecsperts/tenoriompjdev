## Objetivo
Eliminar o crash da tela ao clicar em "Gerar Referências" sem CIDs/Conclusão, exibindo apenas uma notificação amigável com a mensagem de validação já retornada pelo backend.

## Plano
1. Revisar o fluxo do botão "Gerar Referências" e blindar o handler para que nenhum erro da chamada `gerar-justificativa-medica` escape como exceção não tratada.
2. Ajustar a extração da mensagem de erro no frontend para cobrir os formatos reais retornados pela chamada (`error`, `data.error`, string serializada e objetos do client).
3. Garantir que o clique não dispare nenhum caminho paralelo que promova o 400 a erro global (ex.: submit implícito do botão ou promise rejeitada fora do `catch`).
4. Validar o comportamento no preview: ao faltar CIDs/Conclusão, deve aparecer só o toast amigável; a tela não pode entrar em Runtime Error nem blank screen.

## Diagnóstico atual
- O backend está correto: a função retorna `400` com a mensagem esperada.
- A rede confirma isso, então o problema está no frontend.
- O componente `ReferenciasBibliograficas.tsx` já tenta tratar o erro, mas ainda existe um caminho em que o `400` está chegando ao capturador global como erro não tratado.
- O suspeito principal é um escape de promise/rejeição paralela no fluxo do clique, não a validação da Edge Function em si.

## Detalhes técnicos
- Arquivo principal: `src/components/laudo/sections/ReferenciasBibliograficas.tsx`
- Arquivos de apoio para validação do comportamento global: `src/components/GlobalErrorListener.tsx`, `src/components/ErrorBoundary.tsx`
- Escopo: frontend apenas, sem alterar backend/função
- Resultado esperado:
  - sem CIDs/Conclusão: toast com a mensagem de validação
  - sem crash
  - sem blank screen
  - sem Runtime Error visível ao usuário