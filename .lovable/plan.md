# Indicador de progresso no botão "Processar" (Previdenciário)

## Contexto
O `prev-pre-processar` retorna apenas no fim (uma única `supabase.functions.invoke`, sem stream). Não dá pra mostrar % real fiel sem reescrever a edge function com SSE — desproporcional ao pedido "limpo e prático". A solução enxuta é um **progresso simulado calibrado pelas 3 fases reais** (OCR Mistral, extração IA, queixa unificada), que trava em 95% até a resposta chegar e só então pula pra 100% e some.

## UX
- O botão "Processar" continua igual (spinner + texto "Processar/Reprocessar").
- Logo abaixo do botão, dentro do card, aparece uma linha discreta:
  `Processando… 42%` em `text-[10px] text-muted-foreground tabular-nums`.
- Ao terminar (sucesso ou erro): some imediatamente.
- No botão "Processar pendentes" (lote): mostra `(2/5 · 47%)` ao lado do texto.

## Curva simulada (calibrada por observação)
- 0% → 35% nos primeiros ~8s (fase OCR Mistral, geralmente a mais longa)
- 35% → 75% nos próximos ~10s (fase extração IA estruturada)
- 75% → 95% nos próximos ~5s (fase queixa unificada)
- **Trava em 95%** até `preProcessarPericia` resolver
- No resolve: vai pra 100% por 400ms e desaparece

Implementação: `setInterval` 200ms com easing leve (`current += (target - current) * 0.08`), limpo no `finally`.

## Mudanças (somente frontend)

### 1. Novo: `src/modules/previdenciario/hooks/useFakeProgress.ts`
Hook minimalista:
```ts
useFakeProgress(active: boolean) => { progress: number; finish: () => void }
```
- `active=true` → inicia interval, segue a curva, trava em 95%.
- `finish()` → força 100% e zera após 400ms.
- Cleanup em unmount.

### 2. Editar: `src/modules/previdenciario/pages/PautaDetalhe.tsx`
- Adicionar `const { progress, finish } = useFakeProgress(processandoIds.size > 0 || processandoLote)` no topo do componente.
- Renderizar `{progress}%` abaixo do botão "Processar" apenas na linha em processamento (`processandoIds.has(p.id)`).
- No botão "Processar pendentes": acrescentar contador `(done/total · progress%)`.
- Chamar `finish()` no `finally` dos handlers `handleProcessar` e `handleProcessarLote`.

## Fora de escopo
- Streaming real de etapas (exigiria reescrever edge function).
- Modal de etapas como o do módulo trabalhista.
- Qualquer alteração no backend, RLS, buckets ou módulo trabalhista.

## Arquivos
- **Novo:** `src/modules/previdenciario/hooks/useFakeProgress.ts`
- **Editar:** `src/modules/previdenciario/pages/PautaDetalhe.tsx`
