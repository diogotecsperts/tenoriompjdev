

# Correção Crítica de Compliance: Remoção do Termo "IA" dos Documentos Exportados

## Problema

O DOCX e PDF exportados contêm "RESPOSTA SUGERIDA DA IA:" — termo que invalida juridicamente o laudo pericial. Além disso, quando o texto é uma frase de inexistência ("Quesitos do Juízo não identificados nos autos."), o sistema injeta erroneamente um placeholder de resposta abaixo.

## Correções (2 arquivos)

### 1. `src/utils/generateLaudoDOCX.ts` (função `createQuesitoParagraphs`)

**Linha 262** — Substituir o placeholder:
- De: `'RESPOSTA SUGERIDA DA IA: '`
- Para: `'Resposta: '`

**Adicionar filtro de inexistência antes do loop de parágrafos (antes da linha 244)**:
- Detectar se o texto original contém "não identificados nos autos" (regex)
- Se sim, retornar apenas 1 parágrafo com essa frase, sem injetar resposta

**Sanitizar respostas vindas do backend (linha 262)**:
- Aplicar `.replace(/RESPOSTA SUGERIDA DA IA:/g, 'Resposta:')` no texto da resposta, caso o backend tenha gerado com esse prefixo

### 2. `src/utils/generateLaudoPDF.ts` (função `formatQuesitos`)

**Linha 214** — Substituir o placeholder:
- De: `'RESPOSTA SUGERIDA DA IA: '`
- Para: `'Resposta: '`

**Adicionar filtro de inexistência no início da função (antes da linha 170)**:
- Mesma lógica: se o texto contém "não identificados nos autos", retornar apenas essa frase sem pós-processamento

**Sanitizar globalmente**: Antes do return final (linha 219), aplicar `.replace(/RESPOSTA SUGERIDA DA IA:/g, 'Resposta:')` para limpar qualquer menção que tenha vindo do backend

## Detalhes Técnicos

- A regex de detecção de inexistência: `/não identificados nos autos/i`
- A sanitização `RESPOSTA SUGERIDA DA IA:` -> `Resposta:` é uma camada de segurança dupla: mesmo que o backend ou a UI tenham persistido o texto com "IA", o documento exportado sairá limpo
- Nenhuma alteração no backend ou nos prompts — o termo "IA" pode continuar nos prompts internos e na UI; apenas os documentos exportados são sanitizados
