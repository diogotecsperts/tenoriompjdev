## Diagnóstico

A validação em `ReferenciasBibliograficas.tsx` (linhas 66-72) só aceita como "preenchido":
- `currentLaudo.cidsSelecionados` (array populado apenas pela seção **"Descrição Técnica das Doenças"**), OU
- `currentLaudo.conclusaoAnalise` (textarea "Análise Conclusiva" da seção Conclusão).

Ela **ignora**:
- `conclusaoCID` — campo *"CID-10 / Diagnóstico"* da própria seção Conclusão (Input de texto livre).
- `conclusaoDestino`, `conclusaoJustificativa`, `conclusaoIncapacidade`, `conclusaoStatus`.

Se o usuário informou CID apenas em *"CID-10 / Diagnóstico"* (Conclusão) — sem passar pela *"Descrição Técnica das Doenças"* — e/ou a conclusão foi gerada mas ainda não salvou o laudo, `cidsSelecionados` fica `[]` e o toast dispara mesmo com o campo visível preenchido. O backend faz a mesma checagem estrita em `gerar-justificativa-medica/index.ts` (linhas 573-580), então mesmo bypassando o front o servidor rejeitaria.

## Correção (escopo mínimo, apenas Trabalhista, sem tocar Previdenciário)

Ampliar a checagem para "há contexto clínico suficiente" nos dois lados, mantendo o gate defensivo mas alinhado com o UX real.

### 1. Frontend — `src/components/laudo/sections/ReferenciasBibliograficas.tsx`
Trocar a validação por uma lista OR de sinais clínicos:
- `cidsSelecionados.length > 0`, OU
- `conclusaoCID.trim()` não-vazio, OU
- `conclusaoAnalise.trim()` não-vazio, OU
- `conclusaoJustificativa.trim()` não-vazio.

Se nenhum estiver preenchido, manter o toast atual, mas ajustar a frase para refletir a nova lista:
*"Preencha ao menos um CID (na Descrição Técnica ou na Conclusão) ou a Análise Conclusiva antes de gerar referências."*

### 2. Backend — `supabase/functions/gerar-justificativa-medica/index.ts` (linhas 573-580)
Espelhar a mesma lógica lendo do banco:
- `laudo.cids_selecionados` não-vazio, OU
- `laudo.conclusao_cid` não-vazio, OU
- `laudo.conclusao_analise` não-vazio, OU
- `laudo.conclusao_justificativa` não-vazio.

Mesma mensagem amigável. Nada mais é alterado no endpoint (o prompt de `referencias` continua recebendo o contexto que já monta hoje).

### Fora do escopo
- Não mexer no fluxo Previdenciário (validações `prev_*` intactas).
- Não alterar o prompt de referências nem a montagem de contexto.
- Não alterar `Conclusao.tsx`, `DescricaoTecnicaDoencas.tsx` nem `LaudoContext`.
- Nenhuma migração, RLS ou edge function nova.

## Verificação após implementar
1. Laudo com CID só em *"CID-10 / Diagnóstico"* (Conclusão) → botão Gerar Referências deve funcionar.
2. Laudo com `cidsSelecionados` populado → segue funcionando.
3. Laudo totalmente vazio → mantém o toast (agora com texto mais claro).
4. Bypass do front (chamar direto a Edge Function) sem nenhum sinal → 400 do backend com a mesma mensagem.
