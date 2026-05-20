## Avaliação do plano do Gemini

**Verdadeiro:** O `FunctionsHttpError` do Supabase quando há `status !== 2xx` é o que dispara o overlay de Runtime Error do preview do Lovable — o overlay observa respostas 4xx/5xx de `fetch` antes mesmo do nosso `try/catch` rodar, independente de termos `throw` ou não.

**Falso/insuficiente:** O plano do Gemini só repete o que já está implementado no nosso `ReferenciasBibliograficas.tsx` — `try/catch`, `extractErrorMessage`, `return` sem `throw`. **Isso não resolve**, porque o overlay do preview intercepta a resposta HTTP 4xx antes do JavaScript do componente conseguir tratar. Já confirmamos isso na prática: o erro continua aparecendo mesmo com toda a blindagem.

**Seguro?** Aplicar o plano do Gemini é seguro (não quebra nada), mas é **inócuo** — não vai resolver o crash visual.

## Causa raiz real (descoberta agora)

A correção que apliquei antes (validar no cliente antes de chamar a função) é a abordagem certa, mas eu validei os campos **errados**:

- Apliquei: `currentLaudo.conclusaoCID` + `currentLaudo.conclusaoAnalise`
- Backend valida: `cids_selecionados` (array) + `conclusao_analise`

Mapeando para o frontend, o backend equivale a `currentLaudo.cidsSelecionados` (array) e `currentLaudo.conclusaoAnalise`. O campo `conclusaoCID` é um input de texto livre separado e **não conta** para a validação do backend.

Resultado: meu guard atual nunca dispara porque ou o `conclusaoCID` tinha algum texto, ou o `conclusaoAnalise` tinha algo, mas o `cidsSelecionados` continuava vazio → a chamada vai pro backend → 400 → overlay.

## Plano de correção (perfeitamente seguro)

1. **Único arquivo alterado:** `src/components/laudo/sections/ReferenciasBibliograficas.tsx`
2. **Trocar a validação client-side** para espelhar exatamente a regra do backend:
   - `hasCids = Array.isArray(currentLaudo.cidsSelecionados) && currentLaudo.cidsSelecionados.length > 0`
   - `hasConclusao = !!(currentLaudo.conclusaoAnalise && currentLaudo.conclusaoAnalise.trim().length > 0)`
   - Se `!hasCids && !hasConclusao` → `toast.error(...)` + `return` (sem chamar `supabase.functions.invoke`)
3. **Manter** todo o `try/catch` + `extractErrorMessage` já existentes como rede de segurança para outros 4xx que o backend ainda possa retornar (ex.: 401, 403, 404 "Laudo não encontrado").
4. **Não mexer** no backend, na Edge Function, nem em qualquer outro componente.

## Detalhes técnicos

- Escopo: 1 arquivo, frontend puro, ~6 linhas alteradas no `handleGerarReferencias`.
- Risco: zero — só estamos antecipando uma validação que já existe no backend e bloqueando a chamada HTTP quando ela seria garantidamente rejeitada.
- Verificação: depois da edit, basta apertar "Gerar Referências" sem CIDs nem Conclusão. Esperado: só o toast vermelho, sem overlay de Runtime Error, sem blank screen.