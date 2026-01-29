

## Plano: Correção do tryFixTruncatedJson para Extrair Primeiro JSON Válido

---

## Diagnóstico Confirmado

O log mostra exatamente o problema:

```text
Last 300 chars: ...sendo demitido por desempenho."
}
."\n}\nsendo demitido por desempenho."
}
insuf por desempenho."\n}\n."
}
```

**A IA está retornando "lixo" após o JSON válido** - parece um eco/repetição de partes do texto. O JSON termina corretamente em `}` na posição 8496, mas há texto corrompido depois que causa o erro:

```
SyntaxError: Unexpected non-whitespace character after JSON at position 8496
```

---

## Problema no Código Atual

A função `tryFixTruncatedJson` atual (linha 123):
1. ✅ Remove Markdown
2. ✅ Escapa caracteres de controle  
3. ❌ **NÃO extrai o primeiro JSON válido** - tenta parsear tudo incluindo lixo

---

## Solução: Adicionar Extração de Primeiro Objeto JSON

Adicionar um novo passo **ANTES** do passo 3 que:
1. Encontra o primeiro `{` 
2. Conta braces para encontrar o `}` de fechamento correspondente
3. Extrai apenas essa substring

```typescript
// PASSO 2.5: Extrair primeiro objeto JSON válido (ignora lixo no final)
const firstBrace = cleaned.indexOf('{');
if (firstBrace !== -1) {
  let braceCount = 0;
  let inString = false;
  let escaped = false;
  let endPos = -1;
  
  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      continue;
    }
    
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endPos = i + 1;
          break;
        }
      }
    }
  }
  
  if (endPos > firstBrace) {
    const extracted = cleaned.substring(firstBrace, endPos);
    console.log(`[tryFixTruncatedJson] Extracted first JSON object: ${firstBrace} to ${endPos} (${endPos - firstBrace} chars)`);
    
    // Tentar parsear o objeto extraído
    try {
      return JSON.parse(extracted);
    } catch {
      // Continuar com o fluxo normal para limpeza adicional
      cleaned = extracted;
    }
  }
}
```

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/processar-autos/index.ts` | Adicionar PASSO 2.5 após extração de Markdown |

---

## Por Que Isso Vai Funcionar

1. **O JSON está válido** - o log mostra estrutura correta até a posição 8496
2. **O problema é o lixo depois** - texto corrompido/repetido após o `}` final
3. **A solução é cirúrgica** - extrair apenas o objeto JSON, ignorar o resto

---

## Fluxo Atualizado

```text
1. Limpar entrada (trim)
2. Extrair de Markdown (se houver)
2.5. NOVO: Extrair primeiro objeto JSON completo
3. Tentar parse direto
4. Escapar caracteres de controle
5. Remover trailing commas
6. Parse após limpeza
7. Fechar estruturas truncadas
8. Parse final
```

---

## Resultado Esperado

| Situação | Antes | Depois |
|----------|-------|--------|
| JSON com lixo no final | ❌ Falha | ✅ Extrai só o JSON |
| JSON truncado | ✅ Tenta fechar | ✅ Tenta fechar |
| JSON limpo | ✅ Funciona | ✅ Funciona |

