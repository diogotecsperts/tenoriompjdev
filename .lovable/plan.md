

## Plano: Adicionar Campos de Avaliação de Sequelas e Melhorar Extração de Quesitos

### Diagnóstico do Problema

| Campo | Schema JSON | Prompt de Regeneração | enableRegenerate | Status |
|-------|-------------|----------------------|------------------|--------|
| tabelaSUSEP | NÃO existe | NÃO existe | `false` | Totalmente ignorado |
| danoEstetico | NÃO existe | NÃO existe | `false` | Totalmente ignorado |
| auxilioTerceiros | NÃO existe | NÃO existe | `false` | Totalmente ignorado |
| quesitosJuizo | Existe | Genérico (3 linhas) | `true` | Prompt fraco |
| quesitosReclamante | Existe | Genérico (3 linhas) | `true` | Prompt fraco |
| quesitosReclamada | Existe | Genérico (3 linhas) | `true` | Prompt fraco |

---

## Mudanças Propostas

### 1. Backend: Expandir Schema JSON com Seção `avaliacao_sequelas`

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar nova seção ao schema JSON (após `informacoes_medicas`):

```json
"avaliacao_sequelas": {
  "tabela_susep": "",
  "dano_estetico": "",
  "auxilio_terceiros": ""
}
```

### 2. Backend: Adicionar Instruções Detalhadas para Avaliação de Sequelas

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar seção de instruções específicas (após seção 7 - Informações Médicas):

```text
7.5. AVALIAÇÃO DE SEQUELAS - PARA LAUDOS COM SEQUELAS PERMANENTES:

   7.5.1. tabela_susep (Tabela SUSEP/DPVAT):
          Busque nos autos informações sobre grau de invalidez ou sequelas permanentes:
          - Percentual de invalidez mencionado em laudos médicos
          - Referências à Tabela SUSEP/DPVAT ou outras tabelas de invalidez
          - Item específico da tabela aplicável à lesão
          - Grau de comprometimento funcional documentado
          - Laudo do INSS sobre invalidez (se B91 ou aposentadoria)
          - Perícias anteriores que quantificaram sequelas
          ESTRUTURE: "X% de invalidez conforme item Y da Tabela SUSEP - [descrição da sequela]"
          Se não houver menção a percentuais de invalidez, deixe vazio.

   7.5.2. dano_estetico:
          Extraia informações sobre danos estéticos documentados:
          - Cicatrizes visíveis (localização, tamanho, característica)
          - Deformidades permanentes (tipo, gravidade)
          - Amputações ou perdas anatômicas
          - Alterações de marcha ou postura visíveis
          - Grau do dano estético se mencionado (leve, moderado, grave, gravíssimo)
          - Impacto psicológico do dano estético
          Busque em: laudos médicos, perícias, fotos anexadas aos autos.
          Se não houver menção a dano estético, deixe vazio.

   7.5.3. auxilio_terceiros:
          Extraia informações sobre necessidade de auxílio de terceiros:
          - Se o periciando necessita de ajuda para atividades da vida diária (alimentar-se, vestir-se, higiene pessoal)
          - Se necessita de ajuda para locomoção
          - Se necessita de cuidador permanente
          - Tipo de auxílio necessário e frequência
          - Laudo ou perícia que ateste a necessidade
          Busque em: laudos médicos, laudos de assistente social, perícias anteriores.
          Se não houver menção a necessidade de auxílio, deixe vazio.
```

### 3. Backend: Melhorar Instruções para Quesitos

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Substituir a seção 8 (Quesitos) por instruções mais detalhadas:

```text
8. QUESITOS - EXTRAÇÃO INTEGRAL OBRIGATÓRIA:

   Os quesitos são perguntas técnicas formuladas pelo Juízo e pelas partes para serem respondidas pelo perito.
   É ABSOLUTAMENTE ESSENCIAL extrair TODOS os quesitos INTEGRALMENTE, pois são a base do laudo.

   8.1. juizo (Quesitos do Juízo):
        Extraia TODOS os quesitos formulados pelo Juiz/Juízo, geralmente encontrados em despachos ou 
        decisões judiciais. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)
        - Texto integral de cada quesito sem alterações
        - Ordem original dos quesitos
        Busque por: "O(A) perito(a) deverá responder...", "Quesitos do MM. Juízo", "Deverá o expert informar..."
        NÃO RESUMA. Copie literalmente cada quesito.

   8.2. reclamante (Quesitos do Reclamante/Autor):
        Extraia TODOS os quesitos formulados pelo advogado do reclamante, geralmente na petição inicial 
        ou em petição específica de quesitos. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original
        - Texto integral sem alterações
        - Ordem original
        Busque por: "Quesitos do reclamante", "Quesitos do autor", assinatura do advogado do autor.
        NÃO RESUMA. Copie literalmente cada quesito, incluindo sub-quesitos (Ex: 3.1, 3.2).

   8.3. reclamada (Quesitos da Reclamada/Ré):
        Extraia TODOS os quesitos formulados pelo advogado da reclamada, geralmente na contestação 
        ou em petição específica. Copie EXATAMENTE como aparecem, mantendo:
        - Numeração original
        - Texto integral sem alterações
        - Ordem original
        Busque por: "Quesitos da reclamada", "Quesitos da ré", assinatura do advogado da empresa.
        NÃO RESUMA. Copie literalmente cada quesito, incluindo sub-quesitos.

   ATENÇÃO: Os quesitos podem estar em anexos separados ou no corpo das petições.
   Busque em TODO o documento. NÃO invente quesitos - extraia APENAS os que existem.
```

### 4. Backend: Atualizar `ensureValidStructure()`

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar valores default para `avaliacao_sequelas`:

```typescript
avaliacao_sequelas: {
  tabela_susep: "",
  dano_estetico: "",
  auxilio_terceiros: ""
}
```

### 5. Backend: Adicionar Prompts Detalhados de Regeneração para Sequelas

**Arquivo:** `supabase/functions/regerar-campo-pdf/index.ts`

Adicionar três novos prompts:

```typescript
tabelaSUSEP: `Extraia informações para avaliação pela "Tabela SUSEP/DPVAT" de invalidez permanente.

BUSQUE NOS AUTOS:
- Percentuais de invalidez mencionados em laudos médicos ou perícias anteriores
- Referências específicas à Tabela SUSEP, DPVAT ou outras tabelas de invalidez
- Item da tabela aplicável às lesões/sequelas identificadas
- Grau de comprometimento funcional ou anatômico documentado
- Decisões do INSS sobre grau de invalidez (B91, aposentadoria por invalidez)
- Laudos periciais anteriores que quantificaram sequelas

ESTRUTURE A RESPOSTA:
Se encontrar informações, formate assim:
"[X%] de invalidez permanente conforme item [Y] da Tabela SUSEP/DPVAT
Sequela: [descrição da lesão/sequela]
Fundamentação: [fonte da informação - laudo de Dr. X, perícia do INSS, etc.]"

Se não houver menção a percentuais de invalidez, retorne:
"Não foram identificados nos autos documentos que quantifiquem o grau de invalidez permanente segundo a Tabela SUSEP/DPVAT."`,

danoEstetico: `Extraia informações sobre "Dano Estético" do documento.

BUSQUE NOS AUTOS:
- Cicatrizes visíveis: localização anatômica, dimensões aproximadas, características (hipertrófica, queloidiana, hiperpigmentada)
- Deformidades permanentes: tipo (angular, rotacional), gravidade, visibilidade
- Amputações ou perdas anatômicas: nível, membro afetado
- Alterações de marcha ou postura permanentes e visíveis
- Assimetrias corporais resultantes de lesões
- Fotos anexadas aos autos que documentem o dano

CLASSIFICAÇÃO DO DANO ESTÉTICO (se mencionada ou possível inferir):
- Leve: cicatrizes discretas, pouco visíveis, em áreas normalmente cobertas
- Moderado: cicatrizes visíveis em áreas expostas, pequenas deformidades
- Grave: deformidades significativas, cicatrizes extensas, alterações funcionais visíveis
- Gravíssimo: grandes deformidades, amputações, desfiguramento

ESTRUTURE A RESPOSTA:
Descreva objetivamente os achados estéticos documentados, a localização, e se possível classifique a gravidade.

Se não houver menção a dano estético, retorne:
"Não foram identificados nos autos documentos que descrevam dano estético decorrente das lesões."`,

auxilioTerceiros: `Extraia informações sobre "Necessidade de Auxílio de Terceiros" do documento.

BUSQUE NOS AUTOS:
- Se o periciando necessita de ajuda para Atividades da Vida Diária (AVDs):
  * Alimentar-se (cortar alimentos, levar à boca)
  * Vestir-se e despir-se
  * Higiene pessoal (banho, uso do banheiro)
  * Locomoção dentro e fora de casa
- Se necessita de cuidador permanente ou intermitente
- Tipo de auxílio necessário e frequência (24 horas, apenas para certas atividades)
- Laudos médicos, de assistente social ou perícias que atestem a necessidade
- Prescrição médica de acompanhante ou cuidador

ESTRUTURE A RESPOSTA:
Descreva as limitações funcionais que demandam auxílio, as atividades para as quais necessita de ajuda, 
o tipo de cuidador necessário (familiar, profissional), e a fonte documental da informação.

Se não houver menção a necessidade de auxílio, retorne:
"Não foram identificados nos autos documentos que indiquem necessidade de auxílio permanente de terceiros para atividades da vida diária."`
```

### 6. Backend: Melhorar Prompts de Regeneração para Quesitos

**Arquivo:** `supabase/functions/regerar-campo-pdf/index.ts`

Substituir os prompts genéricos por prompts robustos:

```typescript
quesitosJuizo: `Extraia INTEGRALMENTE os "Quesitos do Juízo" do documento.

Os quesitos do Juízo são perguntas técnicas formuladas pelo Juiz para o perito responder.

ONDE BUSCAR:
- Despachos judiciais (busque por "O perito deverá responder...", "Quesitos do MM. Juízo")
- Decisões que nomeiam o perito
- Atas de audiência com determinação de quesitos
- Intimações do perito

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)
- NÃO altere o texto - transcreva literalmente
- Inclua todos os sub-quesitos se houver (Ex: 1.1, 1.2, 2.a, 2.b)
- Preserve a ordem original dos quesitos

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Juízo, retorne: "Quesitos do Juízo não identificados nos autos."`,

quesitosReclamante: `Extraia INTEGRALMENTE os "Quesitos do Reclamante" (ou do Autor) do documento.

Os quesitos do Reclamante são perguntas formuladas pelo advogado da parte autora.

ONDE BUSCAR:
- Petição inicial (geralmente ao final)
- Petição específica de quesitos do reclamante
- Rol de quesitos anexado aos autos
- Emendas à inicial com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos (Ex: 3.1, 3.2, 3.a, 3.b)
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos do Reclamante, retorne: "Quesitos do Reclamante não identificados nos autos."`,

quesitosReclamada: `Extraia INTEGRALMENTE os "Quesitos da Reclamada" (ou da Ré) do documento.

Os quesitos da Reclamada são perguntas formuladas pelo advogado da parte ré/empresa.

ONDE BUSCAR:
- Contestação (geralmente ao final)
- Petição específica de quesitos da reclamada
- Rol de quesitos anexado aos autos
- Réplica ou outras manifestações com quesitos

COMO EXTRAIR:
- Copie CADA quesito EXATAMENTE como aparece no documento
- Mantenha a numeração original
- NÃO altere, resuma ou parafraseie o texto
- Inclua todos os sub-quesitos
- Preserve a ordem original

FORMATO ESPERADO:
1. [Texto completo do primeiro quesito]
2. [Texto completo do segundo quesito]
...

Se não encontrar quesitos da Reclamada, retorne: "Quesitos da Reclamada não identificados nos autos."`
```

### 7. Frontend: Expandir Interface `ExtractedData`

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Adicionar nova seção à interface:

```typescript
interface ExtractedData {
  // ... campos existentes ...
  avaliacao_sequelas: {
    tabela_susep: string;
    dano_estetico: string;
    auxilio_terceiros: string;
  };
  // ... resto ...
}
```

### 8. Frontend: Adicionar Mapeamento no `laudoData`

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Adicionar mapeamento:

```typescript
// Avaliação de Sequelas (NOVOS)
tabela_susep: extractedData.avaliacao_sequelas?.tabela_susep || '',
dano_estetico: extractedData.avaliacao_sequelas?.dano_estetico || '',
auxilio_terceiros: extractedData.avaliacao_sequelas?.auxilio_terceiros || '',
```

### 9. Frontend: Habilitar Regeneração nos Campos de Sequelas

**Arquivo:** `src/components/laudo/sections/AvaliacaoSequelas.tsx`

Mudar `enableRegenerate={false}` para `enableRegenerate={true}` e adicionar props:

```tsx
<LaudoTextareaAIField
  id="tabelaSUSEP"
  label="Tabela SUSEP/DPVAT"
  value={currentLaudo.tabelaSUSEP || ""}
  onChange={(value) => updateLaudo({ tabelaSUSEP: value })}
  placeholder="..."
  rows={5}
  enableEnhance={true}
  enableRegenerate={true}           // MUDAR
  fieldKey="tabelaSUSEP"            // ADICIONAR
  laudoId={currentLaudo.id}         // ADICIONAR
  hasPdfSource={hasPdfSource}       // ADICIONAR
/>
```

---

## Resumo das Mudanças

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `processar-autos/index.ts` | Modificar | Adicionar `avaliacao_sequelas` ao schema + instruções detalhadas + melhorar quesitos |
| `processar-autos/index.ts` | Modificar | Atualizar `ensureValidStructure()` com novos campos |
| `regerar-campo-pdf/index.ts` | Modificar | Adicionar 3 prompts (tabelaSUSEP, danoEstetico, auxilioTerceiros) + melhorar 3 prompts (quesitos) |
| `ImportarAutosDialog.tsx` | Modificar | Expandir interface + adicionar mapeamentos |
| `AvaliacaoSequelas.tsx` | Modificar | Habilitar regeneração com `fieldKey`, `laudoId`, `hasPdfSource` |

---

## Proteção da Infraestrutura

1. **Schema é expandido, não substituído** - retrocompatibilidade garantida
2. **`ensureValidStructure()` garante defaults** - dados antigos não quebram
3. **Mapeamentos usam operador `||`** - campos undefined não causam erro
4. **Nenhuma alteração em lógica de processamento** - apenas instruções de prompts
5. **Colunas já existem no banco** - `tabela_susep`, `dano_estetico`, `auxilio_terceiros`

---

## Resultado Esperado

| Campo | Antes | Depois |
|-------|-------|--------|
| Tabela SUSEP/DPVAT | Vazio, sem regenerar | Preenchido se houver + regeneração disponível |
| Dano Estético | Vazio, sem regenerar | Preenchido se houver + regeneração disponível |
| Auxílio de Terceiros | Vazio, sem regenerar | Preenchido se houver + regeneração disponível |
| Quesitos do Juízo | Resumido/incompleto | Cópia integral, numerada, estruturada |
| Quesitos do Reclamante | Resumido/incompleto | Cópia integral, numerada, estruturada |
| Quesitos da Reclamada | Resumido/incompleto | Cópia integral, numerada, estruturada |

