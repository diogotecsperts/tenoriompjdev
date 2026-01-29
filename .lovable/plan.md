
## Plano: Corrigir Alerta de Lentidão + Investigar Progresso 28%

---

## Problema 1: Alerta "Processamento lento" disparando cedo demais

### Diagnóstico
Encontrei a configuração e está correto:
- **Threshold atual:** `STALE_THRESHOLD_POLLS = 60` (linha 242)
- **Intervalo de polling:** 3 segundos
- **Resultado:** 60 × 3s = **180 segundos (3 minutos)**

Você solicitou **5 minutos**. Vou ajustar o threshold.

### Correção
**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

| Parâmetro | Atual | Novo |
|-----------|-------|------|
| `STALE_THRESHOLD_POLLS` | 60 | **100** |
| Tempo real de inatividade | 3 minutos | **5 minutos** |

Também vou atualizar o texto do alerta que ainda diz "60 segundos" para mostrar "5 minutos" corretamente.

---

## Problema 2: Progresso 28% (extremamente baixo)

### Diagnóstico dos Logs

Analisei o job `8c598922-7832-4a5e-bf1b-0f039eed2d12`:

```
✅ Fase 1 (OCR): Completada com sucesso - rawText extraído
✅ Armazenado: b193f4fb.../8c598922.../extracted.json
❌ Fase 2: FALHOU na estruturação (JSON truncado/inválido)
⚠️ Fallback: Passagem única (single_pass) com Gemini Vision
```

**O problema:** A Fase 2 (preenchimento de campos) falhou, e o sistema caiu para `single_pass` que é menos preciso. Mesmo com `maxOutputTokens: 65536` agora adicionado, o JSON retornado ainda não foi parseado corretamente.

### Evidências no banco de dados:

```json
// ai_metadata do laudo criado
{
  "pdfExtraction": {
    "strategy": "two_phase",  // Deveria ser two_phase
    "durationMs": 126056      // Mas durou 126s = fallback para single_pass
  },
  "summaries": {
    "generated": ["descricao_doencas", "referencias_bibliograficas"]  // Apenas 2 de 6!
  }
}

// Campos vazios no laudo:
- historia_atual: ""
- historico_ocupacional: ""
- resumo_peticao_inicial: ""
- resumo_contestacao: ""
- nexo_causal_justificativa: ""
- analise_incapacidade_laboral: ""
- quesitos_juizo: ""
```

### Causa Raiz

1. **Fase 2 está falhando** porque o JSON retornado está truncado ou malformado
2. **Fallback para single_pass** não extrai campos estruturados corretamente
3. **Resumos não gerados** porque o contexto estava incompleto (petição/contestação vazias)

### Correção Proposta

1. **Adicionar logs detalhados** na Fase 2 para capturar o erro exato de parsing
2. **Salvar o JSON bruto retornado** quando falhar, para diagnóstico
3. **Melhorar tryFixTruncatedJson** para lidar com truncamentos mais agressivos

**Arquivo:** `supabase/functions/processar-autos/index.ts`

```typescript
// Antes do throw na linha 712-713
const fillResult = await callAI(...);

// NOVO: Log do resultado bruto para diagnóstico
let parsedResult = tryFixTruncatedJson(fillResult.text);
if (!parsedResult) {
  // LOG DETALHADO para diagnóstico
  console.error('[processar-autos] Phase 2 JSON parsing failed');
  console.error('[processar-autos] Raw text length:', fillResult.text?.length);
  console.error('[processar-autos] Raw text preview:', fillResult.text?.substring(0, 500));
  console.error('[processar-autos] Raw text ending:', fillResult.text?.substring(-500));
  
  // Salvar texto bruto para análise posterior
  await logError('processar-autos', 'Phase 2 JSON parse failed', jobId, {
    textLength: fillResult.text?.length,
    textPreview: fillResult.text?.substring(0, 1000),
    textEnding: fillResult.text?.substring(-500)
  });
  
  throw new Error('Fase 2 falhou na estruturação');
}
```

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `src/components/tools/ImportarAutosDialog.tsx` | Alterar `STALE_THRESHOLD_POLLS` de 60 para **100** (5 min) |
| `src/components/tools/ImportarAutosDialog.tsx` | Atualizar texto do alerta para "5 minutos" |
| `supabase/functions/processar-autos/index.ts` | Adicionar logs detalhados quando Fase 2 falha |

---

## Próximos Passos Pós-Implementação

1. **Redespachar** as Edge Functions
2. **Testar novamente** com o mesmo PDF
3. **Verificar logs** para entender por que a Fase 2 está falhando
4. Com base nos logs, implementar correção definitiva na estruturação de JSON
