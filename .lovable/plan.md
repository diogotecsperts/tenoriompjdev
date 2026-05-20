## Diagnóstico

A linha de identificação do perito no topo do DOCX (`generateLaudoDOCX.ts`, linhas 514-530) é renderizada como parágrafo solto em 8pt cinza claro, alinhada à direita, sem separador. No print, parece um comentário órfão flutuando entre o timbrado e o "EXCELENTÍSSIMO(A) SENHOR(A)...", quebrando a hierarquia institucional.

Problemas:
1. 8pt cinza claro → parece rascunho, não identificação oficial.
2. Sem separador → cola visualmente no endereçamento judicial.
3. Texto corrido numa única linha → rótulo e conteúdo competem.
4. Espaçamento mínimo (before: 0, after: 120) → sem respiro.

## Fonte de dados (já confirmada)

`peritoNome` / `peritoCRM` são puxados automaticamente do `profiles` do usuário logado no momento da criação do laudo (`LaudoContext.createLaudo`, linhas 362-380) e ficam frozen-at-creation. Multi-tenant correto, sem hardcode. O plano abaixo só muda apresentação visual — zero alteração na fonte de dados.

## Plano de correção (1 arquivo, escopo cirúrgico)

**Arquivo:** `src/utils/generateLaudoDOCX.ts`, bloco linhas 514-530 + ajuste pequeno em `buildPeritoIdLine` (linhas 50-66).

### Novo padrão visual

Bloco institucional discreto no canto superior direito, com duas linhas e separador:

- **Rótulo "PERITO JUDICIAL"** em ALL CAPS, 8pt, bold, cor `primary` (#1B3665).
- **Quebra de linha** dentro do mesmo parágrafo (`break: 1` no segundo `TextRun`).
- **Nome + CRM** em 9pt, peso normal, cor `text` (#1F2937).
- **Borda inferior** fina (½ pt) cor `primary` no parágrafo → separador sutil que ancora o bloco.
- **Espaçamento** `before: 200, after: 240` → respira em relação ao timbrado e ao endereçamento judicial.
- **Indent esquerdo** ~9000 twips → bloco ocupa só o terço direito da página, reforçando que é metadado.
- **Travessão "—"** (em dash) entre nome e CRM em vez de hífen.
- **Prefixo "Dr./Dra."** só se já não vier no `peritoNome` (regex `/^dr[a]?\.?\s/i`).

### Layout resultante

```text
                                              PERITO JUDICIAL
                                       Dr. Diogo Silva — CRM/AL 123456
                                       ─────────────────────────────
EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA
2A VARA DO TRABALHO DE ARAPIRACA - AL
```

### Detalhes técnicos

- Refatorar `buildPeritoIdLine` para retornar `{ label: "PERITO JUDICIAL", value: "Dr. Nome — CRM/UF 12345" } | null`. Manter fallback de CRM já existente.
- Substituir o `Paragraph` único por um `Paragraph` com dois `TextRun` (rótulo + `break: 1` + valor) + `border.bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.primary, space: 4 }`.
- `BorderStyle` já está importado.
- Quando ambos vazios → retorna `null` → bloco simplesmente desaparece (comportamento atual preservado).

### Fora de escopo

- Não mexer no header flutuante (timbrado), no endereçamento judicial, no PDF, nem em outros componentes.
- Não alterar dados no banco nem em `LaudoContext`.
- Não tocar em `generateLaudoPDF.ts` (espelhar no PDF depois é decisão separada).

### Verificação pós-edit

Exportar o laudo atual e conferir no Word:
1. Bloco no canto superior direito, abaixo do timbrado, com respiro.
2. "PERITO JUDICIAL" em caixa-alta azul; nome + CRM logo abaixo em preto.
3. Linha fina azul separa do "EXCELENTÍSSIMO".
4. Laudos sem nome/CRM no banco → bloco não aparece, documento começa direto no endereçamento.

Risco: zero — alteração puramente visual isolada a ~15 linhas.