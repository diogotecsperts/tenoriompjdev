## Contexto

O build falhou com 2 erros TypeScript em `supabase/functions/processar-autos/index.ts` — **arquivo que não foi modificado nas últimas implementações**. Os erros são pré-existentes e só apareceram agora porque o Deno faz type-check global em todas as edge functions a cada deploy, e a adição das novas funções (`dev-list-pdfs`, `dev-download-pdf`) forçou uma re-checagem completa que expôs os erros latentes.

**Consequência atual:**
- Nova aba "Arquivos Originais" no DevPanel não funciona (funções não foram deployadas).
- App continua funcionando normalmente (versões anteriores das edge functions seguem ativas).
- Correção dos quesitos DOCX/PDF funciona normalmente (é frontend).

---

## Erros a corrigir

### Erro 1 — `processar-autos/index.ts:1543`
```
Type 'Record<string, string>' is missing the following properties from type 
'{ resumo_peticao: string; resumo_contestacao: string; ... }'
```

**Causa:** A variável `results` é populada dinamicamente em loop e tipada como `Record<string, string>`, mas a função declara retorno estrito com 9 campos nomeados.

**Correção:** Fazer cast explícito no retorno, garantindo defaults para cada campo:
```typescript
return {
  resumos: {
    resumo_peticao: results.resumo_peticao ?? '',
    resumo_contestacao: results.resumo_contestacao ?? '',
    descricao_doencas: results.descricao_doencas ?? '',
    nexo_causal: results.nexo_causal ?? '',
    incapacidade: results.incapacidade ?? '',
    referencias_bibliograficas: results.referencias_bibliograficas ?? '',
    quesitos_juizo: results.quesitos_juizo ?? '',
    quesitos_reclamante: results.quesitos_reclamante ?? '',
    quesitos_reclamada: results.quesitos_reclamada ?? '',
  },
  aiInfo: { /* mantém como está */ }
};
```

### Erro 2 — `processar-autos/index.ts:2574`
```
Property 'text' does not exist on type 'object'.
```

**Causa:** `tryFixTruncatedJson()` retorna `object | null`. Acessar `.text` requer narrowing.

**Correção:** Adicionar type guard inline:
```typescript
const parsedAny = parsed as any;
const textoOCR = mistralRawText || parsedAny?.text || extractedData?.textos_brutos?.peticao_inicial || '';
```

---

## Garantias de segurança

1. **Zero alteração de comportamento runtime.** Ambas correções são puramente de tipagem (defaults `?? ''` que já era o comportamento esperado, e cast `as any` em uma única linha).
2. **Não toca em prompts, lógica de IA, OCR, fluxo de extração ou banco.**
3. **Não afeta dados existentes** — o `?? ''` apenas garante que se um resumo falhou, o campo vira string vazia (que já era o comportamento implícito do código atual).
4. **Destrava deploy das funções `dev-list-pdfs` e `dev-download-pdf`**, ativando a aba "Arquivos Originais" do DevPanel.

## Arquivos modificados

- `supabase/functions/processar-autos/index.ts` (2 edits cirúrgicos: linhas ~1542-1551 e linha 2574)

## Resultado esperado após aprovação

- Build volta a passar.
- Aba "Arquivos Originais" no DevPanel passa a funcionar (lista usuários, mostra PDFs com Reclamante/Processo, gera links de download).
- Correção dos quesitos DOCX/PDF segue funcionando (já está em produção via frontend).
- Pipeline `processar-autos` segue 100% inalterada em comportamento.
