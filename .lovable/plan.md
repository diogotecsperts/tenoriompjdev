## Diagnóstico

A imagem mostra exatamente o padrão correto a ser seguido: `Processo nº`, `Reclamante`, `Reclamada` são linhas geradas por `createLabeledField` (label em negrito + valor em peso normal, mesma fonte Arial 10pt, cor `text`, espaçamento `after: 80`). A linha `Perito Judicial:` na imagem segue esse mesmo padrão — está perfeitamente alinhada à esquerda, mesma fonte, mesmo tamanho, mesma cor, mesmo espaçamento.

O código atual (`generateLaudoDOCX.ts`, linhas 515-551) renderiza o perito como um bloco separado no canto superior direito, com rótulo "PERITO JUDICIAL" em caps, borda inferior e indent — fora do fluxo visual do endereçamento. Precisamos eliminar esse bloco e inserir a linha como mais uma `createLabeledField`, logo após `Reclamada`.

## Plano de correção (1 arquivo, escopo cirúrgico)

**Arquivo:** `src/utils/generateLaudoDOCX.ts`

### Mudanças

1. **Remover o bloco de identificação do perito no topo** (linhas 515-551). Sai inteiro — nada de bordas, indent, caps, cor primary, parágrafo separado.

2. **Simplificar `buildPeritoIdLine`** (linhas 50-70) para retornar uma `string | null` única no formato `"<Nome> — CRM/<UF> <Número>"`, preservando:
   - Prefixo `Dr./Dra.` só se já não estiver no nome (regex existente).
   - Travessão em dash `—` entre nome e CRM.
   - Fallback `CRM <valor>` se não casar com o padrão UF/número.
   - Retorna `null` se ambos vazios.

3. **Inserir nova linha após `Reclamada`** (logo após linha 591), usando o helper existente:
   ```ts
   const peritoLine = buildPeritoIdLine(laudo);
   if (peritoLine) judicialParagraphs.push(createLabeledField("Perito Judicial", peritoLine));
   ```

### Resultado visual

```text
EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA
2ª VARA DO TRABALHO DE ARAPIRACA - AL

Processo nº: 0000244-58.2026.5.19.0261
Reclamante: AILTON FRANCISCO DOS SANTOS
Reclamada: INDUSTRIAL PORTO RICO S/A
Perito Judicial: Dr. Bruno Victor Tenório Cavalcanti Padilha — CRM/AL 11313
```

Mesma fonte, mesmo tamanho (10pt), mesma cor, mesmo `spacing.after: 80`, mesmo alinhamento à esquerda, label em negrito — herdado automaticamente por usar `createLabeledField`, sem duplicar estilo.

### Fonte de dados (inalterada)

`peritoNome` / `peritoCRM` continuam vindo do `profiles` do usuário logado, frozen-at-creation no `LaudoContext`. Multi-tenant intacto. Apenas a apresentação muda.

### Fora de escopo

- PDF (`generateLaudoPDF.ts`) não é tocado.
- `LaudoContext`, banco, prompts e qualquer outro arquivo não são alterados.
- Bloco do timbrado (header flutuante) permanece como está.

### Verificação pós-edit

Exportar o laudo atual e conferir no Word:
1. Topo da página fica limpo (sem bloco no canto direito).
2. Linha "Perito Judicial: Dr. ... — CRM/AL 11313" aparece como quarta linha do endereçamento, idêntica em estilo às três acima.
3. Laudos sem nome/CRM → linha simplesmente não aparece (comportamento já existente em `createLabeledField`/`buildPeritoIdLine`).

Risco: zero — alteração isolada a ~25 linhas em um único arquivo, reusando helper já validado.
