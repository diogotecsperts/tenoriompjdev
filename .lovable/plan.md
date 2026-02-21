

# Auditoria Confirmada — Plano de Correcao dos 4 Erros Criticos do DOCX

## Resumo da Situacao

Li o documento completo (13 paginas) e confirmei cada erro apontado pelo Gemini. A boa noticia: nenhum desses problemas e arquitetural — todos tem correção pontual e localizada. O sistema estrutural (formatacao, timbrado, supressao de placeholders) esta funcionando bem. Os problemas sao de **mapeamento de dados** e **instrucoes aos prompts**.

---

## ERRO 1: Vazamento Conversacional ("Como voce nao forneceu...")

**Causa raiz**: Os prompts de `resumo_peticao` e `resumo_contestacao` nao tem regra para quando o campo de entrada esta vazio. A IA recebe um campo vazio e inventa conteudo generico, "conversando" com o usuario.

**Evidencia no DOCX**: Pagina 1, Secao 2 — a IA criou um caso ficticio de LER/DORT que nao tem relacao com o caso real (sepse, AVC, pneumonia).

**Fix**: Adicionar logica de guarda no `processar-autos/index.ts` dentro da funcao `gerarResumosIA`. Os campos `resumo_peticao` e `resumo_contestacao` ja tem um check `shouldGenerate: !!contexto.peticaoInicial` (linha 1085), mas o campo `contexto.peticaoInicial` pode estar preenchido com conteudo vago/generico vindo da extracao. A solucao e dupla:

1. **Backend (processar-autos)**: Na funcao que monta o contexto dos resumos, adicionar validacao que considere textos menores que 50 caracteres ou contendo "nao informado" como vazios.
2. **DOCX/PDF Export**: Adicionar na `isFieldEmpty` deteccao de frases de vazamento conversacional como "Como voce nao forneceu", "elaborei um modelo padrao" — para que mesmo que o dado fique no banco, ele nao va para o documento final.

---

## ERRO 2: Contradicao Conclusao vs Analise (Secao 13 vs 14)

**Causa raiz**: O campo `conclusaoStatus` (que gera "Tipo de Incapacidade: Ausencia") e o campo `conclusaoIncapacidade` (que gera "Ha Incapacidade: Nao") sao campos fixos do formulario que o usuario preenche manualmente na UI. A IA gera o texto de `analiseIncapacidadeLaboral` (Secao 13) mas **nao atualiza os seletores da Secao 14**.

**Evidencia no DOCX**: Secao 13 diz "GRAU: TOTAL, DURACAO: TEMPORARIA, EXTENSAO: OMNIPROFISSIONAL". Secao 14 diz "Ha Incapacidade: Nao" e "Ausencia de Incapacidade Laboral".

**Fix (abordagem pragmatica)**: Remover o campo "Ha Incapacidade: Sim/Nao" (`conclusaoIncapacidade`) do DOCX e do PDF. Esse campo e redundante — o `conclusaoStatus` ja indica o tipo de incapacidade, e a analise detalhada esta na Secao 13. Manter apenas:
- CID-10 Sugerido
- Tipo(s) de Incapacidade (do `conclusaoStatus`)
- Destino Sugerido
- Justificativa

Isso elimina a contradicao sem precisar de sincronizacao automatica complexa.

---

## ERRO 3: Perda de Acentuacao (descricao, funcoes, etc.)

**Causa raiz investigada**: O codigo NAO tem nenhuma funcao de sanitizacao que remova acentos. O pipeline Mistral OCR e Gemini Vision trabalham com UTF-8 nativamente. O problema **nao esta no codigo do sistema**, mas sim na **IA (GLM-5 ou modelo usado) que esta gerando texto sem acentos** nos campos de descricao tecnica e analise.

**Evidencia**: Os campos extraidos diretamente do PDF (como nome do paciente "VANILDO CABOCLO") estao corretos. Os campos **gerados pela IA** (como `descricao_doencas`, `exame_fisico`, `tratamentos`) estao sem acentos. Isso e um comportamento do modelo — GLM-5 via OpenRouter frequentemente gera texto em portugues sem diacriticos.

**Fix**: Adicionar instrucao explicita nos prompts de geracao (system prompt da funcao `gerarResumosIA`) exigindo acentuacao correta em portugues. Adicionar no system prompt:

```
REGRA DE IDIOMA: Todo o texto DEVE ser redigido em Português Brasileiro correto e formal, 
com TODOS os acentos, cedilhas e diacríticos adequados (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). 
Texto sem acentuação será REJEITADO.
```

---

## ERRO 4: Chaves do Banco nos Documentos ("prontuario", "laudos_anteriores")

**Causa raiz**: O `buildDocumentosArray()` em `ImportarAutosDialog.tsx` (linha 959-967) salva as keys cruas (`prontuario`, `laudos_anteriores`, `atestados`) no banco. O gerador DOCX (linha 500) imprime `createNumberedList(laudo.documentos)` sem traduzir essas keys para labels humanos.

**Fix**: Adicionar mapa de traducao no DOCX e no PDF:

```typescript
const DOCUMENTOS_LABEL_MAP: Record<string, string> = {
  "cat": "CAT - Comunicação de Acidente de Trabalho",
  "prontuario": "Prontuário Médico",
  "receitas": "Receitas Médicas",
  "exames": "Exames Complementares",
  "laudos_anteriores": "Laudos Médicos Anteriores",
  "atestados": "Atestados Médicos",
};
```

E substituir a chamada:
```typescript
// Antes:
paragraphs.push(...createNumberedList(laudo.documentos));

// Depois:
const docsLabels = laudo.documentos.map(d => DOCUMENTOS_LABEL_MAP[d] || d);
paragraphs.push(...createNumberedList(docsLabels));
```

Aplicar a mesma logica no `generateLaudoPDF.ts`.

---

## ERRO BONUS: Secao 13 com "Nota Tecnica do Perito" + atividades "Nao informado"

**Causa raiz**: A IA recebeu o campo de atividades laborais vazio no contexto do prompt de incapacidade, apesar de o campo `descricaoAtividadesLaborais` (Secao 5) estar preenchido. Isso indica que a interpolacao de variaveis `${variable}` no prompt de incapacidade nao esta enviando o campo correto.

**Fix**: Verificar no prompt de incapacidade se a variavel `${atividades_laborais}` esta sendo populada corretamente com `extractedData.posto_trabalho.descricao_atividades`. Adicionar tambem no system prompt do resumo a proibicao de metatextos ("Nota Tecnica do Perito").

---

## Operacoes Tecnicas (5 arquivos)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `src/utils/generateLaudoDOCX.ts` | (a) Adicionar `DOCUMENTOS_LABEL_MAP` e traduzir keys na Secao 10. (b) Remover campo "Ha Incapacidade: Sim/Nao" da Secao 19. (c) Adicionar patterns de vazamento conversacional no `PLACEHOLDER_PATTERNS`. |
| 2 | `src/utils/generateLaudoPDF.ts` | Mesmas 3 correcoes (a), (b) e (c) do DOCX para manter paridade. |
| 3 | `supabase/functions/processar-autos/index.ts` | (a) Adicionar regra de acentuacao no system prompt de resumos. (b) Adicionar validacao de conteudo minimo para `resumo_peticao` e `resumo_contestacao`. (c) Adicionar proibicao de metatextos no system prompt. |
| 4 | `src/components/laudo/sections/DocumentosAvaliacao.tsx` | Adicionar opcoes faltantes: `laudos_anteriores` e `atestados` (a IA extrai esses campos mas a UI nao os oferece como checkbox). |
| 5 | `src/components/laudo/sections/Conclusao.tsx` | Remover campo `conclusaoIncapacidade` da UI (redundante com `conclusaoStatus` na Secao de Incapacidade). |

### Resultado esperado

Apos estas correcoes:
- Campos vazios produzem secoes ausentes (sem invencao)
- Documentos aparecem com nomes legíveis
- Conclusao nunca contradiz a Analise de Incapacidade
- Texto gerado exige acentuacao correta
- Metatextos como "Nota Tecnica do Perito" sao proibidos nos prompts

