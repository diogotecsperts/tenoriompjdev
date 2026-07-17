## Diagnóstico fechado

O problema não é “a GLM não processa arquivo grande” de forma genérica. O problema está na forma como o Trabalhista está orquestrando a GLM hoje.

### Onde exatamente parou

Pelo diagnóstico enviado e pelos registros persistidos no backend:

- Job: `0803f949-3d2c-4064-a0b8-1a85c375bf90`
- Status atual no banco: `processing`
- Última etapa: `GLM-OCR: enviando páginas 1-30 · parte 2/4 (págs 31-60)`
- Última atualização: `2026-07-17 01:06:17`
- Logs gravados:
  - `01:04:46` iniciou chunked: 4 partes / 114 páginas
  - `01:04:50` iniciou OCR parte 1/4
  - `01:06:10` concluiu parte 1/4 com 56.941 caracteres
  - `01:06:14` iniciou OCR parte 2/4
  - depois disso: nenhum log, nenhuma falha persistida, attempt ainda `processing`

Isso indica que o worker morreu ou foi interrompido no meio da chamada da parte 2, antes de conseguir executar o `catch`/timeout que marcaria o job como falho.

## Causas prováveis

### 1. O split físico ainda não está realmente físico

O seu relatório mostra uma evidência crítica:

```text
PDF rasterizado: 114 págs · 20.2MB
Parte 1: págs 1-30, 20.2MB
Parte 2: págs 31-60, 20.2MB
Parte 3: págs 61-90, 20.2MB
Parte 4: págs 91-114, 20.2MB
```

Isso não está correto para um split físico real. Se o PDF limpo inteiro tem 20.2MB, cada parte deveria ficar proporcionalmente menor. O fato de todas as partes ficarem com o tamanho do PDF inteiro indica que o método atual de “remover páginas fora do range” ainda está salvando recursos/imagens do PDF inteiro dentro de cada parte.

Resultado prático: o app mostra 4 partes, mas cada parte carrega praticamente o PDF rasterizado completo. Isso aumenta tempo, payload, memória e chance de a GLM ou a edge function travarem.

### 2. O Trabalhista processa todas as partes dentro de um único background worker

Hoje o Trabalhista faz:

```text
frontend rasteriza/splita/upload
→ processar-autos cria um job
→ EdgeRuntime.waitUntil processa parte 1, parte 2, parte 3, parte 4
→ depois estrutura os dados
```

Esse modelo é frágil para GLM porque uma única edge function fica viva por tempo demais. A parte 1 levou cerca de 80s. Ao iniciar a parte 2, o worker já estava próximo do limite operacional e morreu sem gravar erro.

Isso explica por que o timeout de 5 minutos por parte não apareceu no banco: o processo provavelmente não ficou vivo até o timer disparar.

### 3. O Previdenciário é mais resiliente por arquitetura

O Previdenciário não depende da mesma forma de um único worker longo para todo o fluxo. Ele tem um padrão mais seguro:

```text
browser orquestra
→ chama OCR de uma parte por vez
→ cada parte roda em uma função menor
→ junta o texto no client
→ chama a extração final com texto pré-extraído
→ status endpoint tem watchdog que marca zombie como failed
```

A lógica correta para a GLM no Trabalhista deve seguir esse padrão: OCR por partes controlado pelo navegador, não um background worker tentando processar tudo sozinho.

## Plano de correção

### 1. Corrigir o split GLM no Trabalhista

Substituir o fluxo atual:

```text
rasteriza PDF inteiro → salva PDF limpo inteiro → remove páginas para gerar partes
```

por:

```text
rasteriza páginas → monta PDFs de partes diretamente → cada parte contém somente suas páginas
```

Critério esperado:

- PDF rasterizado inteiro 20MB não deve gerar 4 partes de 20MB.
- As partes devem ficar fisicamente menores e proporcionais.
- Cada parte GLM deve respeitar:
  - no máximo 30 páginas, preferencialmente 20 páginas por segurança operacional;
  - tamanho bem abaixo de 50MB;
  - sem recursos órfãos do PDF inteiro.

### 2. Replicar o padrão seguro do Previdenciário sem tocar nele

Criar um fluxo GLM específico para o Trabalhista:

```text
frontend Trabalhista
→ gera partes reais
→ sobe partes
→ chama uma função OCR por parte
→ recebe texto da parte
→ concatena texto
→ chama processar-autos somente para estruturação final/resumos
```

Isso evita que um único `EdgeRuntime.waitUntil` fique tentando processar todas as partes da GLM.

### 3. Criar função isolada para OCR de uma parte trabalhista

Adicionar uma função equivalente ao padrão do Prev, mas isolada para o bucket/paths do Trabalhista:

```text
trabalhista-ocr-part
```

Responsabilidades:

- validar autenticação;
- validar que o path da parte pertence ao usuário;
- baixar somente aquela parte;
- chamar `runOcrWithConfiguredProvider` respeitando o DevPanel;
- retornar `{ text, pageCount, provider, model, durationMs }`;
- sem alterar Previdenciário;
- sem alterar Mistral.

### 4. Endurecer o watchdog do Trabalhista

Hoje o `check-import-status` apenas informa que o GLM está stale. Vou alinhar ao padrão do Prev:

- se um job GLM ficar sem update real por tempo definido, marcar como `failed` no banco;
- atualizar `import_attempts`;
- registrar `backend_logs` com parte, páginas e último passo;
- manter o diagnóstico disponível no modal.

Isso elimina jobs zumbis eternos em `processing`.

### 5. Preservar Mistral e Previdenciário

Escopo estrito:

- alterações de OCR por partes somente quando `provider === 'glm'` no módulo Trabalhista;
- Mistral Trabalhista segue no fluxo atual;
- Previdenciário não será alterado;
- helpers compartilhados só serão tocados se a mudança for compatível e sem regressão.

### 6. Ajustar a UI de diagnóstico

No relatório e na tela, exibir claramente:

- tamanho original;
- tamanho rasterizado;
- tamanho real de cada parte;
- parte atual;
- tempo da parte atual;
- última resposta do backend;
- se a falha foi timeout, worker zombie ou erro do provider.

## Resultado esperado

Depois da correção, esse caso de 114 páginas não deve ficar preso em “parte 2/4” sem conclusão. O sistema deve:

1. gerar partes fisicamente menores;
2. processar cada parte em uma chamada curta e rastreável;
3. se uma parte falhar, mostrar exatamente qual parte/páginas falharam;
4. nunca deixar o job indefinidamente em `processing`;
5. preservar Mistral e Previdenciário intactos.