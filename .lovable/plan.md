**Diagnóstico confirmado**

- O split desta vez ficou correto: o PDF de 16,4 MB / 375 páginas virou **5 partes** de 90 páginas, com maior parte de **24,7 MB**.
- O erro não foi no upload nem no tamanho da parte. A função `trabalhista-ocr-part` começou a processar a parte 1 com **90 páginas / 22,54 MB**.
- O log mostra que dentro dessa parte o helper GLM ainda subdividiu internamente em blocos de **30 páginas**.
- A chamada morreu em **504 após ~150s** (`execution_time_ms: 150113`) antes de terminar a parte 1.

**Causa provável, com base nos arquivos lidos**

A maior diferença prática entre o fluxo atual do Trabalhista e o Previdenciário não é só o split do PDF; é o **tempo de execução e orquestração**:

- No Trabalhista, a parte de 90 páginas é enviada para uma função curta (`trabalhista-ocr-part`) que precisa completar todas as 3 chamadas GLM internas de 30 páginas dentro do limite real da função. Ela estourou em ~150s.
- No Previdenciário, o fluxo funcional é mais maduro: tem wrapper com retry, classificação de erro, polling/job assíncrono e caminhos separados para raster/split/finalização. Mesmo quando usa partes, o controle de progresso e erro é mais robusto.

**Resposta direta à sua pergunta**

A maior dificuldade aqui foi tentar “copiar a ideia” do Previdenciário, mas encaixar dentro de uma arquitetura Trabalhista diferente. O Previdenciário tem um fluxo orientado a perícia/job e com tratamento de falha mais completo; o Trabalhista foi adaptado para OCR por partes via função curta. O split agora ficou perto do que queríamos, mas o **OCR de 90 páginas por parte ficou grande demais para o tempo limite da função curta**.

**Plano de correção segura**

1. **Não alterar nada no Previdenciário**
   - Nenhum arquivo de `src/modules/previdenciario/*` será modificado.
   - Nenhuma função `prev-*` será alterada.

2. **Reduzir o tamanho operacional das partes GLM no Trabalhista**
   - Manter o gate condicional: PDFs pequenos continuam sem raster/split.
   - Para PDFs grandes, criar partes Trabalhistas menores para GLM, alinhadas ao limite real de execução.
   - Em vez de 90 páginas por parte, usar **30 páginas por parte** no Trabalhista GLM pesado, porque o próprio helper GLM trabalha em blocos de 30 e a função curta não aguenta 90 páginas dentro do timeout.
   - Resultado esperado para este PDF: 375 páginas → cerca de 13 partes, mas cada parte faz só 1 chamada GLM, reduzindo risco de 504.

3. **Corrigir a mensagem de erro do OCR por parte**
   - Hoje a UI mostra “Edge Function returned a non-2xx status code”, que não explica nada.
   - Ler o corpo do erro da função e mostrar algo como: “Tempo excedido na função OCR da parte 1/5 após 150s”.
   - Preservar o botão de diagnóstico.

4. **Adicionar proteção contra partes grandes demais para função curta**
   - Se uma parte GLM tiver mais de 30 páginas, avisar/impedir no próprio pipeline Trabalhista antes de chamar `trabalhista-ocr-part`.
   - Isso evita repetir o mesmo erro silencioso.

5. **Manter Mistral intacta**
   - Toda a mudança fica dentro do bloco `isGlm` do Trabalhista.
   - Mistral e demais providers continuam pelo fluxo atual.

**Resultado esperado**

- PDF pequeno: passa direto, sem rasterização.
- PDF grande GLM: rasteriza e divide em partes menores de até 30 páginas para não estourar a função curta.
- Erro futuro, se houver, vem com causa legível no modal e no diagnóstico.
- Previdenciário permanece sem alterações.