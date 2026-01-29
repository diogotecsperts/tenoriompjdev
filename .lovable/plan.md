

## Plano: Correção de Performance e Timeout da Importação de PDF

### Problemas Identificados nos Logs

1. **`maxOutputTokens` NÃO está sendo passado na Fase 2**
   - O plano anterior especificava adicionar `maxOutputTokens: 65536` mas a implementação atual não tem esse parâmetro
   - Linha 703-704 atual: `{ promptType: 'two_phase_fill', userId }`
   - **Falta:** `maxOutputTokens: 65536`

2. **Fase 1 (OCR) levou 234 segundos para apenas 6 páginas**
   - Isso é anormal - deveria levar ~30-60 segundos
   - Pode ser sobrecarga temporária do Gemini

3. **Timeout de 300s é insuficiente**
   - Com Fase 1 lenta + Fase 2 + resumos, ultrapassa facilmente 300s

---

### Correção 1: Adicionar maxOutputTokens na Fase 2

**Arquivo:** `supabase/functions/processar-autos/index.ts`
**Linha:** 703-704

```typescript
// ANTES (atual)
const fillResult = await callAI(
  { ...aiConfig, provider: fillProvider, model: fillModel },
  systemPrompt,
  `Analise o seguinte texto extraído de um documento de processo trabalhista e retorne o JSON estruturado:\n\n${textForFilling}`,
  { promptType: 'two_phase_fill', userId }
);

// DEPOIS (corrigido)
const fillResult = await callAI(
  { ...aiConfig, provider: fillProvider, model: fillModel },
  systemPrompt,
  `Analise o seguinte texto extraído de um documento de processo trabalhista e retorne o JSON estruturado:\n\n${textForFilling}`,
  { promptType: 'two_phase_fill', userId, maxOutputTokens: 65536 }
);
```

---

### Correção 2: Aumentar Timeout da Edge Function

**Arquivo:** `supabase/config.toml`

```toml
[functions.processar-autos]
verify_jwt = true
wall_clock_limit = 600  # 10 minutos ao invés de 5
```

**Nota:** O Supabase Edge Functions tem limite máximo de 150 segundos em planos gratuitos e 400 segundos em planos Pro. Se o projeto estiver no plano gratuito, o timeout máximo é 150s. Vou verificar se existe configuração de timeout no projeto.

---

### Correção 3: Verificar se callAI respeita maxOutputTokens

Preciso verificar se a função `callAI` em `ai-config.ts` está recebendo e usando o parâmetro `maxOutputTokens`.

---

### Resumo de Mudanças

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| `supabase/functions/processar-autos/index.ts` | Adicionar `maxOutputTokens: 65536` na chamada da Fase 2 (linha 703) | Previne truncamento de JSON |
| `supabase/config.toml` | Adicionar `wall_clock_limit = 600` (se suportado) | Permite processamento mais longo |

### Próximos Passos

1. Verificar o arquivo `ai-config.ts` para confirmar que `maxOutputTokens` é passado para a API
2. Implementar as correções
3. Redespachar a Edge Function
4. Testar novamente com o mesmo PDF

