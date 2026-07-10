## Respostas

### 1. Mensagem do card para outros usuários — CONFIRMADO 100%

Verifiquei `src/pages/Hub.tsx`:

- O selo **"Preview admin"** só é renderizado quando `isAdminBypass = isAdmin || isDeveloper` for verdadeiro. `isAdmin` vem do `AuthContext` (role `admin` no banco) e `isDeveloper` vem de `supabase.rpc("is_developer")` — uma função `SECURITY DEFINER` que confere `user_roles` no servidor. Usuário comum tem as duas flags como `false`, então o selo não é montado no DOM.
- A **mensagem do card** (`st.block_message`) é renderizada por um bloco independente, condicionado apenas a `hasMessage`, junto com o badge de "Bloqueado" ou "Aviso". Ela aparece para **qualquer usuário** cujo módulo esteja com `block_mode = 'notice'` ou `'blocked'` e `block_message` preenchida.
- O comportamento de acesso também está correto: usuário comum com `block_mode='blocked'` vê o card desabilitado + a mensagem em vermelho; com `notice` vê o card habilitado + mensagem âmbar; admin vê tudo isso mais o selo "Preview admin".

Confirmado: a mensagem aparece normalmente para os usuários finais.

### 2. Dados do Bruno (MED001) — CONFIRMADO + faltando tempo real

Consultei o banco. Bruno (`e48a06e4-…`) tem exatamente:

- **2 pautas**: `076a2108…` (07/07) e `0c5a52a7…` (06/07)
- **Pauta 06/07**: 53 perícias, 53 com PDF, 53 processadas
- **Pauta 07/07**: 17 perícias, 17 com PDF, 17 processadas

Os números do painel Controle de Uso batem: o loader (`dev-list-prev-usage`) faz `SELECT` filtrado por `user_id` em `prev_pautas` e `prev_pericias`, e os KPIs contam a partir dos mesmos campos (`pdf_path` para "upados" e `pdf_processado` para "processados").

**Porém: tempo real está ausente.** Hoje o painel só recarrega quando o dev troca de usuário. Se o cliente subir/processar um PDF enquanto você está olhando, os cards e a tabela não se atualizam sozinhos. Preciso adicionar:

## Plano de mudanças (item 2)

### A. Habilitar Realtime nas tabelas

Migração adicionando `prev_pautas` e `prev_pericias` à publicação `supabase_realtime` e definindo `REPLICA IDENTITY FULL` (para receber payload completo em updates).

### B. Assinar no `PrevUsagePanel`

Novo `useEffect` (após o usuário estar selecionado) que abre um canal Realtime com dois listeners:

- `postgres_changes` em `prev_pautas` filtrado por `user_id=eq.<selectedUserId>`
- `postgres_changes` em `prev_pericias` filtrado por `user_id=eq.<selectedUserId>`

Cada evento (`INSERT`/`UPDATE`/`DELETE`) atualiza o estado local (`setPautas` / `setPericias`) diretamente — sem refazer o fetch inteiro na maioria dos casos. Fallback: se o payload for grande (UPDATE de `prev_extracao`), simplesmente chamar `loadUsage(selectedUserId)` com debounce curto (500 ms) para reidratar tudo em vez de manter payloads inconsistentes.

Cleanup obrigatório com `supabase.removeChannel(channel)` no unmount / troca de usuário para evitar leak (regra da nossa doc de Realtime).

### C. Indicador visual "ao vivo"

Um pequeno badge verde piscante ao lado do nome do usuário selecionado, tipo "● ao vivo", que confirma que a assinatura está ativa. Simples e discreto.

### D. Segurança

O canal Realtime respeita RLS. As policies atuais de `prev_pautas`/`prev_pericias` restringem SELECT ao próprio `user_id`. Como o painel roda com a sessão do dev, ele **não** receberia eventos de outros usuários por realtime direto. Solução: como dev/admin já é whitelisted em `is_developer()`, adicionar uma policy adicional de SELECT em ambas as tabelas permitindo `public.is_developer()` — sem isso o Realtime não entrega os eventos do Bruno para você. (Alternativa mais restritiva: encaminhar via broadcast do backend, mas é overkill aqui.)

### E. Escopo do plano

- Nenhuma mudança de layout ou lógica de filtros/KPIs.
- Apenas: (1) migração de publicação + REPLICA IDENTITY, (2) policy SELECT para developer nas duas tabelas, (3) `useEffect` de assinatura em `PrevUsagePanel.tsx`, (4) badge "ao vivo".
- Módulo Trabalhista fica como está (placeholder "em breve") — realtime dele vem quando o painel for construído.
