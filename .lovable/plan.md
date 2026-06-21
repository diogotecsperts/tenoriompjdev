## Contexto

Hoje em `src/modules/previdenciario/pages/PautaList.tsx` as pautas são **agrupadas por data** (mais recente no topo) e dentro de cada grupo aparecem em ordem de inserção. Não há como o usuário escolher outra ordem — daí a percepção de "está só por data".

## Objetivo

Adicionar um controle de **Ordenar por** no topo da lista de pautas, sem mexer em nada fora dessa tela.

## Opções de ordenação propostas

1. **Data (mais recente primeiro)** — comportamento atual, padrão.
2. **Data (mais antiga primeiro)**.
3. **Local (A-Z)** — ordem alfabética pelo campo `local` (nome da pasta).
4. **Local (Z-A)**.
5. **Cidade / UF (A-Z)** — útil para quem faz pautas em várias cidades.
6. **Criação (mais recente)** — pelo `created_at`, para achar a que acabou de criar.

Sugiro entregar as 6. São triviais e cobrem todos os casos reais.

## Comportamento

- Quando a ordenação for **por data**, mantemos o agrupamento atual por dia (cabeçalho com data + contagem de pastas).
- Quando for **alfabética / cidade / criação**, removemos o agrupamento e exibimos uma **grade única** com todas as pastas ordenadas, para a ordem fazer sentido visualmente. O card continua mostrando a data implicitamente (já mostra local + cidade; podemos adicionar uma linha discreta com a data nesse modo).
- A escolha do usuário é persistida em `localStorage` (`prev:pautas:sort`) para não precisar reescolher a cada visita. Sem mudanças de schema, sem RLS, sem backend.

## UI

No header da página, ao lado do botão "Nova pauta":

```text
[ Pautas ]                    [Ordenar por ▾]  [+ Nova pauta]
 Organize...
```

Componente: `Select` do shadcn já usado no projeto, label curta ("Data ↓", "A–Z", etc.) para caber bem.

## Arquivos afetados

- `src/modules/previdenciario/pages/PautaList.tsx` — único arquivo editado. Adiciona estado `sortBy`, persistência em localStorage, lógica de ordenação e renderização condicional (agrupado por data vs. grade única).

## Fora de escopo

- Outras telas (PautaDetalhe, perícias internas, trabalhista, dev panel).
- Banco de dados, RLS, edge functions, prompts de IA.
- Mudanças de estilo global ou no card em si (apenas, no modo não-agrupado, mostrar a data como linha discreta).

## Riscos

Praticamente nulos: alteração isolada de UI/estado local em uma única página, sem efeitos sobre dados, perícias já criadas, ou o restante do módulo.