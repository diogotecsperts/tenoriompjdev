## Objetivo

Adicionar títulos discretos (apenas **negrito**, mesmo tamanho do corpo) em pontos específicos do documento exportado (DOCX e PDF), transformar o prefixo das medicações em texto realmente fixo, e remover os parênteses `(X) / (  )` apenas da seção de comorbidades — mantendo o grifo em vermelho/negrito das opções marcadas.

## Pontos exatos dos títulos (confirmação de entendimento)

Localização atual no arquivo `src/modules/previdenciario/lib/export/prelaudo-docx.ts` (e espelho em `prelaudo-pdf.ts`):

1. **"Queixa principal"** — título em negrito imediatamente antes do parágrafo unificado da queixa (`q.queixa_principal`). Depois do título, um parágrafo em branco antes do texto.
2. **"Para os sintomas referidos, informa uso contínuo de medicações:"** — hoje só aparece se `q.medicacoes_uso` estiver preenchido. Passa a ser **linha fixa**, sempre renderizada, seguida do conteúdo dinâmico das medicações (quando houver). Um parágrafo em branco após o bloco.
3. **"Exame físico"** — título em negrito antes do primeiro parágrafo fixo (`EXAME_FISICO_TEXTOS.estado_mental`) da etapa 3.
4. **"Conclusão"** — título em negrito antes das duas frases de incapacidade (função habitual e vida independente) — última subseção da etapa Exame físico.

Todos os títulos:
- Mesma fonte e tamanho do corpo (`FONT.sizeDefault` = 10pt no DOCX; equivalente no PDF).
- Apenas `bold: true`, cor padrão do texto (sem cor primária, sem uppercase, sem tamanho maior).
- Sem numeração ("1.", "2." etc.).
- Espaçamento leve antes/depois para respirar, sem destacar demais.

## Regra especial das comorbidades

Seção **"Informa demais comorbidades"** passa a renderizar **sem** o prefixo `(X)` / `(  )`:

- Todas as opções continuam listadas (fixas + extras).
- A opção marcada pela IA continua em **vermelho + negrito** (`COLORS_HEX.red`).
- As não marcadas continuam em texto normal.
- É a **única** seção sem parênteses — Estado civil e Escolaridade seguem com `(X) / (  )` como hoje.

Implementação: adicionar um parâmetro opcional `{ showMarkers?: boolean }` (default `true`) em `optionsBlock` (DOCX) e no helper equivalente do PDF, passando `false` só na chamada de comorbidades.

## Arquivos a alterar

- `src/modules/previdenciario/lib/export/prelaudo-docx.ts` — adicionar títulos, tornar o prefixo de medicações fixo, opção `showMarkers` em `optionsBlock`.
- `src/modules/previdenciario/lib/export/prelaudo-pdf.ts` — mesmos ajustes espelhados.

Nenhuma mudança em telas, prompts, banco ou edge functions. Escopo restrito ao módulo Previdenciário.

## Ponto de atenção para confirmação

Sobre a linha "Para os sintomas referidos, informa uso contínuo de medicações:" — vou torná-la **sempre visível** (fixa), com o texto das medicações concatenado depois quando houver. Se você prefere que ela apareça **só quando houver medicações**, mas garantindo que o prefixo seja idêntico/imutável, me avise antes que eu implemente.
