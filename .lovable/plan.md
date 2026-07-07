## Avaliação do novo prompt

Verifiquei o único ponto de integração técnica no código (`supabase/functions/prev-pre-processar/index.ts`, linhas ~402/458–474). O runtime exige apenas:

1. **Variável `${textoSelecionado}`** — o texto bruto (queixa + medicações + comorbidades já extraídos) é injetado nessa variável via `interpolatePrompt`. ✅ O novo prompt mantém `${textoSelecionado}` exatamente com esse nome, no lugar correto (após "TEXTOS / SEÇÕES SELECIONADAS:").
2. **Saída em texto plano, sem markdown/títulos/aspas** — o campo `queixa_principal` é gravado direto no editor e exportado para DOCX/PDF, sem parser. ✅ O novo prompt encerra com "Retorne apenas o texto final em parágrafo técnico, coeso, sem introdução, sem aspas, sem numeração e sem títulos" e ainda proíbe explicitamente markdown, bullets e travessão — perfeitamente alinhado com a regra global do projeto ("Exported DOCX/PDFs must NEVER contain markdown / IA jargon").
3. **Retorno string curta o suficiente para caber num parágrafo do laudo** — o prompt limita escopo a queixa/anamnese inicial e proíbe medicações, exames, conclusão. ✅ Não há risco de estourar o campo.
4. **Fallback quando `textoSelecionado` for muito curto** — o código já pula a chamada se o texto tiver <80 caracteres, independente do prompt. ✅ Nada a ajustar.

Nenhum outro placeholder, marcador JSON, cabeçalho ou convenção interna é consumido pelo backend para esse prompt. Portanto o texto do cliente é **100% aplicável** sem adaptações — basta substituir o corpo do prompt no banco (`system_config.value.prompt` do id `prompt_prev_queixa_unificada`), preservando os demais metadados (id, description, cardId, sectionId, isClassified, createdAt).

## Plano de execução (build mode)

1. Ler o registro atual `prompt_prev_queixa_unificada` em `system_config` para preservar metadados.
2. Rodar um `UPDATE` mínimo em `system_config` trocando somente `value.prompt` pelo texto novo enviado pelo cliente (mantendo `id`, `description`, `cardId`, `sectionId`, `variables=["textoSelecionado"]`, `isClassified`, `createdAt`; atualizando `updatedAt`).
3. Não alterar código — o pipeline em `prev-pre-processar/index.ts` continua idêntico.
4. Confirmar no log da próxima execução que `queixa_unificada_ok: true`.

## Detalhes técnicos

- Alvo: linha em `system_config` com `id = 'prompt_prev_queixa_unificada'`.
- Cache do `prompt-manager` (TTL 5 min) é invalidado automaticamente na próxima leitura fria da edge function — sem ação extra.
- Nenhum arquivo do repositório precisa ser editado.

Confirma que posso aplicar a substituição no banco?
