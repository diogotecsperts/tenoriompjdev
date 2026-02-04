
# Corrigir Sincronização Completa: Prompts IA ↔ Laudo Editor

## Diagnóstico Detalhado

Após análise completa, identifiquei que o problema tem **3 fontes diferentes** que precisam ser corrigidas simultaneamente:

### Problema 1: Dados Incorretos no Banco de Dados
Os dados salvos em `system_config` ainda têm valores antigos. A resposta de rede mostra:
```json
"prompt_regen_historicoOcupacional": {
  "sectionId": "anamnese"  // ERRADO - deveria ser "acidente"
}
```

### Problema 2: Mapeamento Incorreto em `regerar-campo-pdf/index.ts`
Linha 16 do arquivo:
```typescript
historicoOcupacional: { sectionId: 'anamnese', ... }  // ERRADO
```

### Problema 3: Sincronização Nunca Executada
O botão "Verificar Atualizações" diz "Tudo sincronizado" porque compara o código (seed-prompts) com o banco, mas o banco tem dados ANTIGOS que foram inseridos antes da correção.

---

## Mapeamento Correto (Fonte de Verdade: Componentes do Laudo)

### Card: periciando

| Seção | Componente | Campos (fieldKey) | sectionId Correto |
|-------|------------|-------------------|-------------------|
| Dados do Acidente | DadosAcidente.tsx | `historicoOcupacional`, `historiaAcidente` | `acidente` |
| Anamnese | Anamnese.tsx | `historiaAtual` | `anamnese` |
| Antecedentes Patológicos | AntecedentesPatologicos.tsx | `antecedentes`, `tratamentos`, `afastamentos` | `antecedentes` |

---

## Discrepâncias Encontradas

| Prompt ID | sectionId ATUAL (banco) | sectionId CORRETO | Status |
|-----------|-------------------------|-------------------|--------|
| `prompt_regen_historicoOcupacional` | `anamnese` | `acidente` | **ERRADO** |
| `prompt_regen_antecedentes` | `antecedentes` | `antecedentes` | OK |
| Todos os outros | - | - | Precisam verificar `order` |

**Total de correções necessárias:** 1 sectionId errado + atribuição de `order` a todos os prompts

---

## Plano de Implementação

### Passo 1: Corrigir o arquivo `regerar-campo-pdf/index.ts`

Atualizar linha 16:
```typescript
// DE:
historicoOcupacional: { promptId: '...', cardId: 'periciando', sectionId: 'anamnese', ... }

// PARA:
historicoOcupacional: { promptId: '...', cardId: 'periciando', sectionId: 'acidente', ... }
```

### Passo 2: Forçar atualização do banco de dados via SQL

Executar UPDATE direto para corrigir o `prompt_regen_historicoOcupacional`:
```sql
UPDATE system_config
SET value = jsonb_set(value, '{sectionId}', '"acidente"')
WHERE id = 'prompt_regen_historicoOcupacional';
```

E garantir que TODOS os prompts tenham o campo `order` correto:
```sql
-- Exemplo para cada prompt
UPDATE system_config
SET value = jsonb_set(value, '{order}', '1')
WHERE id = 'prompt_regen_historicoOcupacional';

UPDATE system_config
SET value = jsonb_set(value, '{order}', '2')
WHERE id = 'prompt_regen_historiaAcidente';
```

### Passo 3: Deploy da Edge Function

Redeploiar `regerar-campo-pdf` para aplicar a correção do mapeamento.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/regerar-campo-pdf/index.ts` | Corrigir `historicoOcupacional` sectionId para `acidente` |
| Tabela `system_config` | UPDATE para corrigir sectionId e order |

---

## Verificação Final

Após as correções, na tela **Prompts IA**:

**Card: Dados do Periciando**
- Seção **Dados do Acidente**: 
  - ✅ Histórico Ocupacional - Regerar via PDF
  - ✅ História do Acidente - Regerar via PDF
- Seção **Anamnese**:
  - ✅ Anamnese - Regerar via PDF (historiaAtual)
- Seção **Antecedentes Patológicos**:
  - ✅ Antecedentes Patológicos - Regerar via PDF
  - ✅ Tratamentos Realizados - Regerar via PDF
  - ✅ Afastamentos do Trabalho - Regerar via PDF

---

## Resultado Esperado

Após a implementação:
1. O prompt `historicoOcupacional` aparecerá na seção **Dados do Acidente** (não mais em Anamnese)
2. A ordenação seguirá exatamente a ordem dos campos no laudo
3. O mapeamento interno das Edge Functions estará correto
4. Futuros "Restaurar Padrão" manterão a estrutura correta
