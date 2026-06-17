# Correção — `prev-pre-processar` 502 (JSON truncado)

## Causa raiz (confirmada pelos logs)
- OCR Mistral: 68 páginas, 122.720 chars — ok.
- Chamada à IA feita com `maxOutputTokens: 8000`.
- A resposta foi cortada no meio de uma string (`"São José da L`…), ou seja, o modelo **bateu o limite de tokens de saída** antes de fechar o JSON.
- `tryParseJson` local é simples (só faz strip de fences e fatia entre `{` e `}`) → falhou → 502 `"A IA retornou conteúdo fora do formato esperado."`

Não é problema da Mistral, nem do provider de IA, nem do PDF. É o teto de saída pequeno demais para um processo previdenciário real + parser sem reparo.

Já existe na memória do projeto o padrão **`reparo-json-robusto` (8 etapas)** usado no `processar-autos` do trabalhista. Vamos reutilizar a mesma filosofia, sem importar nada do trabalhista (isolamento do módulo preservado).

## O que será alterado
Apenas `supabase/functions/prev-pre-processar/index.ts`. Nada no front, nada no trabalhista, nada no schema.

### 1. Subir o teto de saída
- `maxOutputTokens: 8000` → `maxOutputTokens: 32000`.
- 32k cabe folgado em Gemini 3 Flash (provider atual) e nos fallbacks usuais; suficiente para JSON completo de processo grande.

### 2. Reduzir input de OCR de forma inteligente
Hoje corta cego em 180.000 chars (`ocr.text.slice(0, 180_000)`). Para 68 páginas / 122k chars cabe inteiro, mas para processos maiores corta justamente o fim (quesitos costumam ficar no fim). Vou:
- Manter o limite ~180k, mas **preservar cabeça + cauda** (ex.: 120k iniciais + 60k finais com marcador `\n\n[...trecho omitido...]\n\n`) para não perder quesitos.

### 3. Parser robusto de JSON (substitui `tryParseJson`)
Novo helper local `parseAIJson(raw)` que aplica, em cascata:
1. Strip de fences ```` ``` ```` / ```` ```json ````.
2. Localiza primeiro `{` e tenta `JSON.parse` direto.
3. Se falhar: balanceia chaves/colchetes (`{` vs `}`, `[` vs `]`) fechando o que faltar.
4. Remove vírgulas penduradas (`,}` / `,]`).
5. Remove caracteres de controle (`\x00-\x1F\x7F` exceto `\n\r\t`).
6. Se string final ainda estiver aberta, fecha aspas + fecha estruturas pendentes.
7. Retenta `JSON.parse`.
8. Se ainda falhar, devolve `null` → erro 502 explícito como hoje.

### 4. Detecção e log de truncamento
Antes de tentar parsear, detectar truncamento (chaves/colchetes desbalanceados ou ausência de `}` final) e logar `[prev-pre-processar] AI output looks truncated (len=...)` para diagnóstico futuro no DevPanel.

### 5. Mensagem de erro mais útil
Quando o reparo falhar de verdade, devolver 502 com mensagem do tipo: `"A IA devolveu JSON incompleto (provavelmente saída truncada). Tente novamente; se persistir, reduza o PDF ou avise o suporte."` — mantém o status 502 mas dá contexto.

## Fora de escopo (intencional)
- **Não** vou re-chunkar o PDF em múltiplas chamadas agora (overkill para o caso atual de 68p / 122k chars; 32k de saída resolve).
- **Não** vou tocar em `mistral-ocr.ts`, `ai-config.ts`, prompts globais, schema ou UI.
- **Não** vou registrar prompt customizado — o fallback default permanece.

## Verificação após a correção
1. Confirmar build da função (auto-deploy).
2. Pedir para o usuário reenviar o mesmo PDF de teste e validar:
   - `pdf_processado = true` em `prev_pericias`
   - `prev_extracao` populado com `identificacao`, `processo`, `quesitos_*`
   - `prev_documentos` com linhas inseridas
3. Se ainda falhar: ler os novos logs (`AI output looks truncated` ou parser final) e decidir se precisamos partir para chunking — só então.

## Integridade do módulo Trabalhista
Nenhum arquivo do trabalhista é tocado. A mudança é estritamente dentro de `supabase/functions/prev-pre-processar/index.ts`. Helper de parse é local na própria função.

Confirma para eu aplicar a correção?