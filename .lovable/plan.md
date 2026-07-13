## Diagnóstico objetivo

Você tem razão em cobrar: **o caminho atual ainda está insistindo no lugar errado para PDF grande**.

Evidência dos logs internos:

- Job atual: `84f85725-3d8d-4fe5-ab94-891afddf55f3`.
- PDF: **66.025.728 bytes / 62,97 MB**.
- Configuração global atual: OCR `gemini` com modelo `gemini-2.5-flash`.
- O arquivo **subiu com sucesso** para o Gemini Files API e ficou `ACTIVE`.
- A falha ocorreu depois, na leitura do PDF pelo `generateContent`:
  - `400 INVALID_ARGUMENT: Request contains an invalid argument`
  - falhou nas 4 variações de payload tentadas.
- O teste simples do modelo `gemini-2.5-flash` respondeu `OK`, então **a chave/modelo não estão quebrados de forma geral**; o problema é o uso desse endpoint com esse PDF grande.
- Logs do AI Gateway do projeto mostram **apenas 1 chamada recente bem-sucedida** (`log_id 019f515a-3481-7351-a2ae-3ae181b38dcf`, 2026-07-11 13:24:54Z). Não há erros recentes ali; esta falha de OCR está ocorrendo pelo caminho direto do provider configurado, não por uma chamada registrada como falha no Gateway.

## O que isso significa

O erro atual não é mais “travamento silencioso”. Agora ele falha rápido, mas a mensagem ficou ruim.

O problema real: **PDF grande não deve depender de uma única chamada Gemini whole-document com Files API para OCR integral**. Mesmo com upload aceito, a chamada de leitura pode ser recusada por limite/compatibilidade do provider. Insistir em trocar modelo ou variar `fileData/file_data` está virando tentativa circular.

## Arquivos pequenos foram afetados?

Parcialmente:

- PDFs pequenos abaixo de ~4 MB continuam no caminho inline e provavelmente não foram afetados.
- PDFs médios acima de ~4 MB passaram a usar Files API automaticamente; isso pode afetar alguns casos.
- PDFs grandes acima de 30 MB entram no caminho streaming/Files API, que foi justamente onde este PDF de 62,97 MB falhou.

## Melhor metodologia daqui pra frente

Trocar a estratégia para PDF grande:

```text
PDF pequeno/médio seguro
  -> fluxo atual simplificado

PDF grande (>50 MB ou quando Gemini Files API retornar 400)
  -> NÃO insistir no whole-document
  -> rasterizar no navegador por páginas/chunks
  -> enviar chunks controlados para OCR
  -> juntar texto
  -> só então rodar extração estruturada
```

Isso reduz o risco de:

- queimar crédito em tentativas repetidas sem chance real;
- ficar travado sem erro;
- depender de um limite opaco do Gemini para PDF grande;
- perder tudo se uma única chamada gigante falhar.

## Plano de correção

1. **Parar o loop ruim em PDF grande**
   - Em `pdf-visual-extractor.ts`, remover a lógica de “4 payloads + fallback para outro Gemini” para documentos grandes.
   - Para erro `400 INVALID_ARGUMENT` em PDF via Files API, classificar como “PDF grande incompatível com OCR whole-document”, não como “modelo recusou” genérico.

2. **Criar modo seguro chunkado para Gemini**
   - Adicionar endpoint `gemini-ocr-chunk`.
   - O frontend rasteriza o PDF por páginas/chunks, igual ao fluxo já existente do MiniMax.
   - Cada chunk envia poucas páginas como imagens para o Gemini, evitando o envio do PDF inteiro de 63 MB numa única chamada.

3. **Roteamento por tamanho**
   - PDFs pequenos: manter caminho atual.
   - PDFs grandes, especialmente **>50 MB**: não usar `generateContent` com PDF inteiro.
   - Se o provider escolhido for Gemini, o backend retornará sinal para OCR chunkado no navegador.
   - Se o provider for MiniMax, mantém o fluxo client-side já existente.

4. **Proteger créditos**
   - Limitar tentativas por chunk.
   - Não fazer fallback automático entre providers pagos sem sinal claro.
   - Se um chunk falhar, registrar exatamente páginas/chunk afetados.
   - Evitar repetir upload/processamento inteiro após um `400` definitivo.

5. **Melhorar mensagens de erro**
   - Substituir o cartão vermelho gigante por:
     - causa curta;
     - etapa;
     - provider/modelo;
     - ID do job;
     - botão de tentar novamente;
     - detalhe técnico recolhido/expandível.
   - Mensagem para este caso: “O Gemini aceitou o upload, mas recusou ler este PDF grande em modo documento único. Use o modo seguro por páginas/chunks.”

6. **Watchdog e limpeza de estados antigos**
   - Manter o watchdog do `prev_processing_jobs`.
   - Revisar também jobs antigos em `import_jobs` que aparecem parados em `processing` desde ontem, pois são outro ponto de “espera eterna”.

7. **Validação sem desperdiçar crédito**
   - Primeiro validar só o roteamento: PDF de 62,97 MB deve cair no modo chunkado, não no Files API whole-document.
   - Depois testar um chunk pequeno.
   - Não disparar OCR completo pago automaticamente sem você clicar em “Tentar novamente”.