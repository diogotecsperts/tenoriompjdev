
# Sistema de Resposta a Impugnações Vinculado aos Laudos

## Resumo do Pedido

O cliente quer que, quando receber uma reclamação/impugnação de um laudo que ele já fez:
1. Ele possa **selecionar o laudo original** que está sendo questionado
2. **Cole os quesitos da impugnação** no sistema
3. A **IA gere respostas fundamentadas** no conteúdo do laudo original
4. Tudo fique **salvo na nuvem** para consultas futuras

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Fluxo de Impugnação                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuário acessa /impugnacao                                  │
│              ↓                                                  │
│  2. Seleciona laudo que está sendo impugnado                    │
│     (lista de laudos finalizados)                               │
│              ↓                                                  │
│  3. Sistema carrega dados do laudo original                     │
│     (conclusões, nexo, exames, etc.)                            │
│              ↓                                                  │
│  4. Usuário cola os quesitos da impugnação                      │
│              ↓                                                  │
│  5. Clica em "Gerar com IA" para cada quesito                   │
│              ↓                                                  │
│  6. Edge function recebe:                                       │
│     - Texto do quesito                                          │
│     - Conteúdo completo do laudo                                │
│              ↓                                                  │
│  7. IA gera resposta técnica fundamentada                       │
│     "Conforme laudo pericial, o nexo causal foi..."             │
│              ↓                                                  │
│  8. Tudo é salvo na tabela 'impugnacoes'                        │
│              ↓                                                  │
│  9. Pode ser consultado/editado posteriormente                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Alterações Necessárias

### 1. Frontend - Página de Impugnação Reformulada

**Arquivo**: `src/pages/Impugnacao.tsx`

**Mudanças**:
- Adicionar seletor de laudo (dropdown com laudos do usuário)
- Ao selecionar um laudo, carregar seus dados para contexto da IA
- Conectar o botão "Gerar com IA" à edge function real
- Implementar salvamento real no banco de dados
- Adicionar histórico de impugnações já criadas
- Permitir criar nova impugnação ou continuar uma existente

**Interface atualizada**:
```text
┌────────────────────────────────────────────────────────────────┐
│  Responder Impugnação                    [Histórico] [Salvar]  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Laudo Vinculado: [Selecionar laudo ▼]                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Laudo - VANILDO CABOCLO                                  │  │
│  │ Processo: 0001114-35.2025.5.19.0004                      │  │
│  │ Status: Finalizado | Data: 29/01/2026                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐  ┌────────────────────────────────────────┐   │
│ │ Quesitos     │  │ Quesito 1                              │   │
│ │              │  │                                        │   │
│ │ [1] ✓        │  │ "O reclamante apresenta sequelas..."   │   │
│ │ [2] ○        │  │                                        │   │
│ │ [3] ○        │  │ Resposta Técnica    [Gerar com IA ✨]  │   │
│ │              │  │ ┌────────────────────────────────────┐ │   │
│ │ [+ Adicionar]│  │ │ Conforme análise técnica realizada │ │   │
│ │              │  │ │ e documentada no laudo pericial,   │ │   │
│ │              │  │ │ o periciando apresenta...          │ │   │
│ │              │  │ └────────────────────────────────────┘ │   │
│ └──────────────┘  └────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### 2. Nova Edge Function - Gerar Resposta de Impugnação

**Arquivo**: `supabase/functions/gerar-resposta-impugnacao/index.ts`

**Funcionamento**:
- Recebe: `laudo_id` + `quesito_texto`
- Busca o laudo completo no banco de dados
- Monta prompt com contexto do laudo
- Chama o modelo de IA configurado no DevPanel
- Retorna resposta técnica fundamentada

**Prompt para a IA**:
```text
Você é um perito médico respondendo a uma impugnação de laudo pericial.

LAUDO ORIGINAL:
- Vítima: {vitima_nome}
- Processo: {processo_numero}
- Conclusão: {conclusao_analise}
- Nexo Causal: {nexo_causal_tipo} - {nexo_causal_justificativa}
- Exame Físico: {exame_fisico}
- Diagnósticos CIDs: {diagnostico_cids}
- Incapacidade: {conclusao_incapacidade}

QUESITO DA IMPUGNAÇÃO:
"{quesito_texto}"

Elabore uma resposta técnica fundamentada no laudo original, 
mantendo as conclusões periciais e citando os elementos técnicos 
que sustentam o posicionamento.
```

### 3. Banco de Dados - Já Existe!

A tabela `impugnacoes` já tem a estrutura correta:
- `id`, `user_id` - identificadores
- `laudo_id` - vínculo com o laudo original
- `processo_numero` - referência do processo
- `quesitos` (JSONB) - lista de quesitos com textos e respostas
- `status` - pendente/respondido

**Nenhuma migração necessária!**

### 4. Histórico de Impugnações

**Novo componente**: Lista de impugnações anteriores

- Mostra todas as impugnações do usuário
- Filtro por status (pendente/respondido)
- Busca por número de processo ou nome da vítima
- Permite continuar editando ou visualizar respostas anteriores

## Benefícios para o Cliente

| Antes | Depois |
|-------|--------|
| Escreve respostas manualmente | IA gera respostas baseadas no laudo |
| Precisa abrir o laudo para consultar | Sistema já tem todo o contexto |
| Não salva as impugnações | Tudo fica salvo para consultas futuras |
| Interface desconectada | Fluxo integrado laudo → impugnação |

## Cronograma de Implementação

1. **Reformular página de Impugnação** (interface completa)
2. **Criar edge function** para geração de respostas
3. **Integrar salvamento** no banco de dados
4. **Adicionar histórico** de impugnações
5. **Testes** com laudos reais

## Seção Técnica

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/pages/Impugnacao.tsx` | Modificar | Reformular completamente com seletor de laudo e integração real |
| `supabase/functions/gerar-resposta-impugnacao/index.ts` | Criar | Edge function para gerar respostas com IA |
| `src/components/impugnacao/ImpugnacaoHistorico.tsx` | Criar | Componente de listagem de impugnações anteriores |
| `src/components/impugnacao/LaudoSelector.tsx` | Criar | Seletor de laudo com busca e preview |

### Estrutura do JSONB de Quesitos

```json
{
  "quesitos": [
    {
      "id": "1",
      "numero": 1,
      "texto": "O reclamante apresenta sequelas...",
      "resposta": "Conforme laudo pericial...",
      "status": "respondido",
      "gerado_por_ia": true,
      "editado_manualmente": false
    }
  ]
}
```

### Segurança

- A edge function verifica se o `laudo_id` pertence ao usuário autenticado
- RLS na tabela `impugnacoes` já está configurado corretamente
- Usuário só vê suas próprias impugnações
