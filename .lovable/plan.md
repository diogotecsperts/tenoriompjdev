

## Plano: Ajustar Tolerância do Alerta de "Processamento Lento"

### Problema Identificado

O alerta de "Processamento lento" está configurado para aparecer após apenas **60 segundos** sem atualização do job. Isso é muito agressivo considerando que:

- Geração de resumos de IA pode levar 2-3 minutos por resumo
- Modelos mais lentos (como Pro) demoram mais
- O processo completo pode levar até 10+ minutos legitimamente

### Solução Proposta

Aumentar o threshold de **60 segundos** para **3 minutos** (180 segundos), que é um tempo mais realista para processos de IA.

### Arquivo a Modificar

**`src/components/tools/ImportarAutosDialog.tsx`** - Linha 242

### Mudança Específica

```typescript
// ANTES (linha 242)
const STALE_THRESHOLD_POLLS = 20; // 20 polls * 3s = 60 segundos sem update = stale

// DEPOIS
const STALE_THRESHOLD_POLLS = 60; // 60 polls * 3s = 180 segundos (3 min) sem update = stale
```

### Impacto

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Tempo até alerta | 60 segundos | 3 minutos |
| Falsos positivos | Frequentes | Raros |
| Detecção de problemas reais | Muito rápido | Ainda razoável |

### Riscos

- **Nenhum** - Apenas muda o tempo de tolerância
- O timeout global de 25 minutos continua funcionando
- A funcionalidade de cancelar/continuar permanece intacta

### Alternativa Considerada

Poderíamos tornar esse valor configurável no DevPanel, mas para esta correção pontual, um valor fixo de 3 minutos é adequado e mais simples.

