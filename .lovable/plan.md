
# Plano: Adicionar Guia de Referencia no PDF de Exportacao de Prompts

## Objetivo
Inserir uma secao introdutoria no PDF exportado chamada **"Guia de Referencia"** que explica de forma clara e objetiva o proposito de cada tipo de prompt. Isso permitira que uma IA externa compreenda o contexto ao analisar e sugerir melhorias.

---

## Estrutura da Nova Secao

### Posicao no PDF
- Logo apos o header (titulo, data, total)
- Antes da primeira secao de prompts

### Conteudo do Guia

```text
GUIA DE REFERENCIA - TIPOS DE PROMPTS
======================================

Este documento contem prompts utilizados por um sistema de geracao de 
laudos medico-periciais. Cada prompt instrui uma IA a realizar uma 
tarefa especifica. Abaixo, a explicacao de cada tipo:


IMPORTAR (prompt_import_*)
---------------------------
Proposito: Extracao de informacoes de documentos PDF.
Quando usado: Durante o upload inicial de autos processuais (PDF).
O que faz: Analisa o conteudo do PDF e extrai dados estruturados 
para preencher campos especificos do laudo (nome, CPF, historico, etc).
Entrada: Texto extraido via OCR do PDF.
Saida: JSON estruturado com os campos preenchidos.


GERAR (prompt_gen_*)
--------------------
Proposito: Criacao de conteudo analitico original.
Quando usado: Apos os dados basicos estarem preenchidos no laudo.
O que faz: Sintetiza informacoes ja existentes no laudo para criar 
analises tecnicas como nexo causal, conclusao pericial, descricao 
de patologias baseada em literatura medica.
Entrada: Variaveis do laudo (ex: {{historiaAcidente}}, {{exames}}).
Saida: Texto dissertativo tecnico-cientifico.


REGERAR (prompt_regen_*)
------------------------
Proposito: Re-extracao de um campo especifico do PDF original.
Quando usado: Quando o usuario clica no botao de "refresh" em um campo.
O que faz: Retorna ao PDF original e tenta extrair novamente a 
informacao para aquele campo especifico, permitindo correcao ou 
enriquecimento do dado.
Entrada: Texto do PDF + nome do campo a ser regenerado.
Saida: Novo texto para o campo solicitado.


SISTEMA (sem prefixo padrao)
----------------------------
Proposito: Instrucoes globais ou de configuracao.
Quando usado: Internamente pelo sistema.
O que faz: Define comportamentos gerais da IA, como tom de escrita,
formatacao de saida, ou instrucoes transversais a multiplos prompts.


VARIAVEIS
---------
Prompts podem conter variaveis no formato {{nomeVariavel}}.
Estas sao substituidas em runtime pelos valores reais do laudo.
Exemplo: {{historiaAcidente}} sera substituido pelo texto do campo
"Historia do Acidente" antes de enviar para a IA.

======================================
```

---

## Implementacao Tecnica

### Arquivo a modificar
`src/components/dev-panel/DevPrompts.tsx`

### Local da mudanca
Funcao `exportToPDF`, logo apos o bloco de header (linha ~467)

### Codigo a adicionar

```typescript
// Guia de Referencia
checkNewPage(120);
doc.setFontSize(12);
doc.setFont("helvetica", "bold");
doc.setTextColor(0);
doc.text("GUIA DE REFERÊNCIA - TIPOS DE PROMPTS", margin, yPos);
yPos += 8;

doc.setFontSize(9);
doc.setFont("helvetica", "normal");

const guideText = [
  "Este documento contém prompts utilizados por um sistema de geração de laudos médico-periciais.",
  "Cada prompt instrui uma IA a realizar uma tarefa específica. Abaixo, a explicação de cada tipo:",
  "",
  "IMPORTAR (prompt_import_*)",
  "Propósito: Extração de informações de documentos PDF durante upload inicial.",
  "Entrada: Texto extraído via OCR do PDF. Saída: JSON estruturado com campos preenchidos.",
  "",
  "GERAR (prompt_gen_*)",
  "Propósito: Criação de conteúdo analítico original (nexo causal, conclusões, análises).",
  "Entrada: Variáveis do laudo. Saída: Texto dissertativo técnico-científico.",
  "",
  "REGERAR (prompt_regen_*)",
  "Propósito: Re-extração de campo específico quando usuário clica em refresh.",
  "Entrada: PDF original + campo alvo. Saída: Novo texto para o campo.",
  "",
  "SISTEMA",
  "Propósito: Instruções globais de configuração e comportamento da IA.",
  "",
  "VARIÁVEIS: Prompts usam {{nomeVariavel}} que são substituídas em runtime."
];

for (const line of guideText) {
  if (line === "") {
    yPos += 3;
  } else if (line.startsWith("IMPORTAR") || line.startsWith("GERAR") || 
             line.startsWith("REGERAR") || line.startsWith("SISTEMA") ||
             line.startsWith("VARIÁVEIS")) {
    doc.setFont("helvetica", "bold");
    doc.text(line, margin, yPos);
    doc.setFont("helvetica", "normal");
    yPos += 5;
  } else {
    doc.text(line, margin, yPos);
    yPos += 5;
  }
}

yPos += 5;
doc.setDrawColor(100);
doc.line(margin, yPos, pageWidth - margin, yPos);
yPos += 10;
```

---

## Resultado Final

### Estrutura do PDF apos mudanca

```text
Pagina 1:
---------
BACKUP DE PROMPTS DE IA
Data: DD/MM/AAAA às HH:MM:SS
Total: XX prompts
────────────────────────────

GUIA DE REFERÊNCIA - TIPOS DE PROMPTS
Este documento contém prompts utilizados...

IMPORTAR (prompt_import_*)
Propósito: Extração de informações...

GERAR (prompt_gen_*)
Propósito: Criação de conteúdo...

REGERAR (prompt_regen_*)
Propósito: Re-extração de campo...

SISTEMA
Propósito: Instruções globais...

VARIÁVEIS: Prompts usam {{nomeVariavel}}...
────────────────────────────

Pagina 2+:
----------
DADOS PRELIMINARES
────────────────────────────
Dados do Processo
ID: prompt_import_processo | Tipo: Importar
...
```

---

## Beneficios

1. **Contexto para IA externa**: Qualquer modelo de IA podera entender o papel de cada prompt
2. **Autodocumentacao**: O PDF exportado se torna autoexplicativo
3. **Facilita revisoes**: Ao enviar para analise, o revisor (humano ou IA) tem contexto imediato
4. **Padronizacao**: Terminologia consistente entre sistema e documentacao

---

## Validacao

Apos implementar:
1. Exportar um PDF em DevPanel > DevPrompts
2. Verificar que o Guia aparece na primeira pagina apos o header
3. Confirmar que o texto esta legivel e bem formatado
4. Testar com uma IA (Claude, GPT) se ela compreende os tipos ao ler o PDF
