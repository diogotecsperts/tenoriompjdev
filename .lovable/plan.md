## Diagnóstico direto

### 1. Provider Inventory não foi removido do código
A tela `Provider Inventory v2.0` continua no `DevSettings`, com escolha de provider e modelo padrão. O problema é acesso, não ausência:
- O DevPanel abre por padrão no `Dashboard`. Configurações fica no fim da lista.
- No smartphone, o layout é sidebar fixa + conteúdo largo. A tabela do inventário e as configurações de IA saem da área visível ou pedem scroll horizontal ruim.
- No modo desktop do celular ainda cai em breakpoint mobile do Tailwind e vira o mesmo problema.

### 2. Configurações fantasmas no banco
Hoje `system_config` tem valores gravados que você não escolheu deliberadamente:
- `text_fill_provider = openrouter`
- `text_fill_model = google/gemini-3-flash-preview`
- `fallback_ai_provider = openrouter`
- `fallback_ai_model = google/gemini-3-flash-preview`
- `default_ai_provider = minimax`
- `phase1_ocr_provider = gemini`
- `import_strategy = single_pass`

Se você não configurou OpenRouter no DevPanel e não tem chave OpenRouter salva, qualquer chamada por esse caminho ou falha, ou é ignorada, ou o código cai em outro provider. É config poluída, herdada de iterações anteriores.

Nenhuma cobrança silenciosa está em curso por causa disso hoje, porque:
- OpenRouter exige chave sua para funcionar, então sem chave nada é cobrado.
- O fallback automático de OCR entre providers pagos (que causou o caso Mistral) já foi removido em `ocr-router.ts`, que agora roda só o provider explícito.

Mesmo assim, esses valores fantasma têm que sair. É exatamente o tipo de default escondido que te queimou antes.

### 3. Fluxo grande atual é ruim
Para PDF grande, o sistema hoje rasteriza no navegador, gera JPEG de cada página e envia em lotes de 10. Para 114 páginas em celular, isso é lento por natureza e explica os mais de 30 minutos. Não é o Gemini que é lento nessa proporção — é a rasterização em canvas no aparelho e o ping-pong com o backend.

### 4. Arquivos pequenos quebraram por efeito colateral
O roteamento foi mexido para desviar PDFs grandes; a matriz de tamanho + provider quebrou o caminho que já funcionava para pequenos. Não foi o Gemini/MiniMax que pioraram, foi o roteador.

### 5. Extração incompleta mesmo sem erro
Uma única chamada tenta preencher todos os campos a partir do OCR truncado. Se algum trecho relevante ficar fora ou desordenado, campos essenciais somem sem alerta.

## Plano de correção

### Regra inegociável: nada de provider externo sem sua escolha
- Só é executado o provider que você marcar no DevPanel.
- Sem fallback automático para outro provider pago.
- Sem defaults escondidos apontando para OpenRouter/Mistral/etc. no banco.
- Toda chamada de IA logada com provider/modelo efetivo por job, para você conferir depois.

### A. Restaurar acesso ao Provider Inventory
1. DevPanel responsivo:
   - sidebar vira menu compacto/drawer no smartphone;
   - conteúdo em coluna única no mobile;
   - Provider Inventory em cards no mobile, tabela no desktop.
2. Atalho visível para `Configurações / IA` no topo do DevPanel.
3. Garantir que `Modelo Padrão`, `Provider Inventory`, `OCR Previdenciário`, `Fallback` e `Salvar Alterações` sejam plenamente utilizáveis no celular.

### B. Limpar configurações fantasmas
1. Zerar/normalizar em `system_config`:
   - remover `text_fill_provider = openrouter` e `text_fill_model` correspondente até você configurar;
   - remover `fallback_ai_provider = openrouter` e modelo correspondente;
   - `import_strategy` volta ao valor documentado como estável;
   - `default_ai_provider` só fica setado se você tiver escolhido no DevPanel;
   - `phase1_ocr_provider` só usa o valor selecionado por você.
2. Depois da limpeza, apresentar no DevPanel a configuração real, sem "herança oculta".
3. Nenhuma configuração de IA será gravada por edge functions "automaticamente"; só pelo DevPanel.

### C. Reverter a rasterização client-side como padrão para PDF grande
1. Deixar de usar `gemini-ocr-chunk` por imagens como caminho automático.
2. Manter rasterização client-side apenas como opção manual sob seu comando, nunca como fluxo padrão.
3. PDFs grandes passam por split real de páginas (`pdf-lib`), enviando cada parte como PDF ao OCR configurado no DevPanel.

### D. OCR por tamanho, respeitando DevPanel
1. Pequenos/médios: caminho anterior estável, provider = o que você marcou.
2. Grandes: split por páginas + OCR configurado; sem trocar de provider por conta própria.
3. Se o provider configurado falhar (400/timeout), erro claro para você decidir, sem novo cliente pago automático.

### E. Extração dirigida por grupos
1. Após OCR, separar a extração em grupos essenciais:
   - identificação;
   - processo/benefício;
   - histórico clínico/laboral;
   - documentos/exames;
   - quesitos.
2. Enviar apenas trechos relevantes de cada grupo, preservando início/fim.
3. Segunda passagem curta só para campos críticos vazios, sem reprocessar o PDF.
4. Se campos críticos ficarem vazios apesar de OCR suficiente, marcar como falha de qualidade (não como sucesso).

### F. Proteção efetiva de créditos
1. Sem retries automáticos entre providers/modelos.
2. Log por job: tamanho, páginas, provider/modelo, chars extraídos, tempo por etapa, campos vazios.
3. Um caminho que falhar por limite conhecido não repete sozinho.
4. Mensagens de erro: causa curta, etapa, provider/modelo efetivo, jobId, e ação objetiva. Sem cartão vermelho gigante.

### G. Auditoria visível no DevPanel
1. Painel exibe: provider/modelo configurados, últimas chamadas, custo e falha. Assim você vê imediatamente se algo "estranho" tentou rodar.

## Resultado esperado

- Configurações da IA acessíveis e ajustáveis no smartphone.
- Zero provider rodando sem sua escolha explícita.
- PDFs pequenos voltam ao caminho estável anterior.
- PDFs grandes deixam de depender de rasterização de 114 páginas no celular.
- Campos essenciais vazios viram alerta claro, não sucesso mudo.
- Nenhuma cobrança "invisível" possível: sem fallback automático, sem default fantasma.