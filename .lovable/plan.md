

# Navegação de Quesitos + Geração de PDF para Impugnação

## Resumo das Alterações

1. **Adicionar botão "Voltar"** na navegação entre quesitos
2. **Criar geração de PDF** no padrão profissional dos laudos

## Memorização das Abordagens

**Opção A (atual)**: Múltiplos quesitos com navegação entre eles - mais completo para impugnações extensas

**Opção B (simplificada)**: Quesito único sem lista lateral - mais direto para casos simples

*Guardado para decisão futura após avaliar o PDF.*

---

## Alteração 1: Botões de Navegação

**Arquivo**: `src/pages/Impugnacao.tsx`

**Local**: Rodapé da área de edição (linhas 743-757)

### Situação Atual
Apenas o botão "Próximo Quesito" existe.

### Alteração
Adicionar botão "Quesito Anterior" antes do "Próximo Quesito":

```text
[Quesito Anterior] [Próximo Quesito]
```

O botão "Quesito Anterior" ficará desabilitado quando o usuário estiver no primeiro quesito.

---

## Alteração 2: Botão Gerar PDF no Header

**Arquivo**: `src/pages/Impugnacao.tsx`

**Local**: Header da página (próximo ao botão Salvar)

Adicionar botão "Gerar PDF" que só fica habilitado quando existe pelo menos um quesito respondido.

---

## Alteração 3: Criar Função de Geração de PDF

**Novo arquivo**: `src/utils/generateImpugnacaoPDF.ts`

### Estrutura do PDF

```text
[CABEÇALHO TIMBRADO - timbrado-cabecalho.png]

EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA
[VARA DO PROCESSO]

Processo nº: [NÚMERO]
Reclamante: [NOME]
Reclamada: [EMPRESA]

═══════════════════════════════════════════════════════════

MANIFESTAÇÃO TÉCNICA PERICIAL
(Em Resposta à Impugnação)

═══════════════════════════════════════════════════════════

1. INTRODUÇÃO

O perito médico do trabalho, devidamente nomeado nos autos
do processo em epígrafe, vem respeitosamente à presença de
Vossa Excelência apresentar MANIFESTAÇÃO TÉCNICA em resposta
à impugnação apresentada nos autos.

───────────────────────────────────────────────────────────

2. DO LAUDO PERICIAL ORIGINAL

Data da Perícia: [data]
Periciando: [nome da vítima]
Conclusão: [resumo da conclusão original]

───────────────────────────────────────────────────────────

3. RESPOSTAS AOS QUESITOS DA IMPUGNAÇÃO

QUESITO 1:
"[texto completo do quesito]"

RESPOSTA:
[resposta técnica fundamentada]

---

QUESITO 2:
"[texto do quesito]"

RESPOSTA:
[resposta técnica]

[... demais quesitos ...]

───────────────────────────────────────────────────────────

4. CONCLUSÃO

Ante o exposto, o perito signatário ratifica integralmente
as conclusões do laudo pericial originalmente apresentado,
[ou apresenta ajustes se houver].

───────────────────────────────────────────────────────────

5. ENCERRAMENTO

[Cidade], [data por extenso].


                    ____________________________
                    DR. [NOME DO PERITO]
                    [Especialidade]
                    CRM: [número]

[RODAPÉ TIMBRADO - timbrado-rodape.png]
```

### Características do PDF

| Aspecto | Implementação |
|---------|---------------|
| Imagens de timbrado | Reutiliza `timbrado-cabecalho.png` e `timbrado-rodape.png` |
| Layout dinâmico | Calcula margens baseado no tamanho real das imagens |
| Texto justificado | Mesmo padrão de justificação dos laudos |
| Quebra de página | Verificação automática antes de cada bloco |
| Dados do perito | Puxados do perfil do usuário logado |
| Nome do arquivo | `manifestacao-impugnacao-[processo]-[periciando].pdf` |

---

## Seção Técnica

### Interface de Dados para o PDF

```typescript
interface ImpugnacaoPDFData {
  // Dados do processo (do laudo vinculado)
  processoNumero: string;
  processoVara: string;
  reclamante: string;
  reclamada: string;
  
  // Dados do laudo original
  laudoData: string;
  laudoVitima: string;
  laudoConclusao: string;
  
  // Quesitos respondidos
  quesitos: Array<{
    numero: number;
    texto: string;
    resposta: string;
  }>;
  
  // Dados do perito (do perfil)
  peritoNome: string;
  peritoCRM: string;
  peritoEspecialidade: string;
  peritoEndereco: string;
}
```

### Funções Reutilizadas do generateLaudoPDF.ts

O novo arquivo vai importar/replicar a mesma lógica de:

- `loadImageAsBase64()` - carrega PNGs
- `getImageDimensions()` - mede tamanho real
- `calculateDynamicLayout()` - calcula área de conteúdo
- `checkNewPage()` / `ensureSpace()` - controle de paginação
- `addSectionTitle()` / `addSubtitle()` - títulos formatados
- `addParagraph()` - texto justificado
- `addLabeledField()` - campos com label em negrito
- `addHeaderToPages()` / `addFooterToPages()` - aplica timbrado

### Fluxo da Função handleGeneratePDF

```typescript
const handleGeneratePDF = async () => {
  // 1. Validar que há laudo selecionado
  if (!selectedLaudo) {
    toast({ title: "Selecione um laudo", variant: "destructive" });
    return;
  }
  
  // 2. Filtrar quesitos respondidos
  const respondidos = quesitos.filter(q => 
    q.status === "respondido" && q.resposta.trim()
  );
  
  if (respondidos.length === 0) {
    toast({ 
      title: "Nenhum quesito respondido", 
      description: "Responda pelo menos um quesito antes de gerar o PDF.",
      variant: "destructive" 
    });
    return;
  }
  
  // 3. Buscar dados completos do laudo
  const { data: laudoCompleto } = await supabase
    .from('laudos')
    .select('*')
    .eq('id', selectedLaudo.id)
    .single();
  
  // 4. Buscar dados do perfil do perito
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, crm, especialidade, endereco')
    .eq('id', user.id)
    .single();
  
  // 5. Chamar função de geração
  await generateImpugnacaoPDF({
    processoNumero: laudoCompleto.processo_numero,
    processoVara: laudoCompleto.processo_vara,
    reclamante: laudoCompleto.vitima_nome,
    reclamada: laudoCompleto.reclamada,
    laudoData: laudoCompleto.created_at,
    laudoVitima: laudoCompleto.vitima_nome,
    laudoConclusao: laudoCompleto.conclusao_analise,
    quesitos: respondidos.map((q, i) => ({
      numero: i + 1,
      texto: q.texto,
      resposta: q.resposta
    })),
    peritoNome: profile.nome,
    peritoCRM: profile.crm,
    peritoEspecialidade: profile.especialidade,
    peritoEndereco: profile.endereco
  });
  
  toast({ title: "PDF gerado com sucesso!" });
};
```

### Imports Necessários

No `Impugnacao.tsx`:
```typescript
import { FileText, ChevronLeft } from "lucide-react"; // adicionar
import { generateImpugnacaoPDF } from "@/utils/generateImpugnacaoPDF";
```

### Botão Anterior - Lógica

```typescript
<Button 
  variant="outline" 
  onClick={() => {
    const currentIndex = quesitos.findIndex(q => q.id === selectedQuesito);
    if (currentIndex > 0) {
      setSelectedQuesito(quesitos[currentIndex - 1].id);
    }
  }}
  disabled={quesitos.findIndex(q => q.id === selectedQuesito) === 0}
>
  <ChevronLeft className="mr-2 h-4 w-4" />
  Quesito Anterior
</Button>
```

