## Diagnóstico

Confirmei três problemas reais em "Módulos por Usuário":

1. **Admin/dev nunca vê bloqueio nem aviso.** Em `Hub.tsx`, quando `isAdmin || isDeveloper`, o loader sobrescreve todos os módulos com `{ enabled: true, block_mode: "none", block_message: "" }`. Como o teste é feito pela própria conta admin/dev, nada aparece — daí a impressão de que "não faz nada".
2. **Redundância entre toggle e popover.** Hoje `enabled` (toggle) e `block_mode` (popover) são independentes. Bloqueio pelo popover não desliga o toggle e vice-versa, causando estados contraditórios (ex.: `enabled=true` + `block_mode=blocked`).
3. **Mensagem não aparece.** Além do item 1, no DB há linhas com `block_message` preenchida e `block_mode = NULL` (o save do popover pode ter sido feito com "Nenhum" ao reabrir, porque o `useEffect` reseta o estado local ao abrir). Sem `block_mode` definido, o Hub nunca entra no ramo que renderiza a mensagem.

## O que fazer

### 1. Integrar toggle ↔ popover (uma única fonte de verdade)

Em `DevUserModules.tsx` e `BlockConfigPopover.tsx`:

- Ao **salvar o popover**:
  - `mode = "blocked"` → também gravar `enabled = false` no mesmo upsert.
  - `mode = "notice"` ou `"none"` → também gravar `enabled = true` (usuário mantém acesso; "notice" é só aviso).
- Ao **desligar o toggle** (`enabled=false`) e não haver `block_mode` explícito, gravar `block_mode = "blocked"` com uma mensagem padrão ("Acesso desabilitado pelo administrador.") apenas se `block_message` estiver vazia — assim o Hub mostra algo em vez de "Sem acesso" mudo.
- Ao **ligar o toggle** (`enabled=true`), limpar `block_mode` para `null` e `block_message` para `null` (destrava tudo).
- Atualizar o estado local (`setUsers`) após cada operação para refletir os dois campos simultaneamente.

Resultado: um único conceito visível ao dev — "Livre / Aviso / Bloqueado" — comandável tanto pelo toggle (atalho rápido) quanto pelo popover (refinado com mensagem).

### 2. Popover: parar de perder seleção

- Substituir o `useEffect` que reseta `mode/message` toda vez que `open` muda por inicialização apenas na abertura (guardar snapshot em ref) — evita que reabrir sobrescreva escolha do usuário.
- Desabilitar o botão "Salvar" quando `mode !== "none"` e `message.trim() === ""` (força mensagem quando há bloqueio/aviso, garantindo que sempre haja texto para exibir).

### 3. Corrigir bypass admin/dev no Hub

Em `Hub.tsx`, remover a sobrescrita que zera `block_mode`/`block_message` para admin/dev. Manter apenas: admin/dev **pode entrar** (canEnter=true) mesmo se bloqueado, mas **vê o badge e a mensagem** (com um selo "visível só para você" ou similar), para poder validar a configuração aplicada aos usuários finais.

Implementação: separar "estado real" (vindo do DB) de "pode navegar" (admin/dev sempre true). Renderizar sempre o badge/mensagem a partir do estado real. Para admin/dev com card bloqueado/notice, mostrar um selinho pequeno "Preview admin" e manter o botão de acesso habilitado.

### 4. Hub: sempre renderizar mensagem quando presente

Ajustar a condição para renderizar `block_message` sempre que `block_message` estiver preenchida (independente do `block_mode`), com estilização por severidade. Isso protege contra linhas antigas onde `block_mode` ficou nulo.

### 5. Backfill leve dos dados existentes

Uma pequena atualização para consertar as linhas onde `block_message IS NOT NULL AND block_mode IS NULL`: setar `block_mode = 'notice'` (mais conservador) para que a mensagem já salva volte a aparecer sem precisar reeditar.

## Fora do escopo

- Nenhuma mudança no MiniMax OCR, na página Controle de Uso, nem na estrutura da tabela `user_modules`. Só ajustes de UI/lógica e um UPDATE de conserto.

## Arquivos afetados

- `src/components/dev-panel/DevUserModules.tsx` — toggle grava `block_mode`/`block_message` coerentes; recarrega estado após popover.
- `src/components/dev-panel/usage/BlockConfigPopover.tsx` — save integrado com `enabled`; init sem reset em reabertura; validação de mensagem obrigatória.
- `src/pages/Hub.tsx` — remover bypass que apaga bloqueio para admin/dev; renderizar mensagem sempre que houver; selo "Preview admin" quando aplicável.
- 1 UPDATE (via ferramenta de dados) para backfill das linhas com mensagem órfã.
