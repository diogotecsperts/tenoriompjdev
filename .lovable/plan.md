## Objetivo

Permitir que você (dev MED002) entre na conta de qualquer cliente **sem saber a senha dele** e **sem alterar a senha dele**, deixando registrado em todo lugar que quem entrou foi o dev — nunca o cliente.

---

## Como vai funcionar na prática (linguagem simples)

Pense no fluxo atual: hoje, para logar, você digita **ID (ex.: MED001) + senha** na tela de login. A gente **não vai mexer nisso**. O que vamos adicionar é um segundo caminho paralelo, exclusivo para dev.

### O fluxo do dev, passo a passo

1. Você abre **DevPanel → Usuários**. Cada linha da tabela ganha um botão novo ao lado do nome: **"Entrar como este usuário"** (ícone de máscara/olho).
2. Você clica. Aparece uma confirmação simples: *"Você vai abrir uma sessão como MED001 (Bruno). Isso ficará registrado como acesso do dev. Continuar?"* → **Sim**.
3. O sistema, nos bastidores, pede ao backend um "**passe temporário**" (é um link único que autentica uma vez só, tecnicamente chamado *magic link*, mas você não precisa clicar em email nenhum — o link é consumido automaticamente pelo próprio DevPanel).
4. O DevPanel abre uma **nova aba** já logada como o cliente. **A senha do cliente não foi tocada, não foi lida, não foi alterada.** Ele continua logando normalmente com a senha dele quando quiser.
5. Na sua aba original, você continua logado como MED002 (dev). Quando terminar, é só fechar a aba do cliente. Um botão **"Encerrar sessão como <cliente>"** também aparece no topo da aba impersonada.

### O que muda para o cliente
**Nada.** A senha dele continua a mesma, funciona igual, ele não recebe nenhum email, não é deslogado, não vê nada de diferente. O "passe temporário" é gerado e consumido em segundos, sem envio de email — a gente pega a URL direto da resposta da API do backend.

### Escopo de quem pode ser impersonado
Conforme você definiu: **todos os usuários não-developers**, sempre. Nenhuma allowlist. A função verifica só duas coisas:
- Quem chama é developer (`is_developer()`).
- O alvo **não** é developer (para você nunca conseguir impersonar outro dev — proteção contra escalonamento).

---

## Registro nos logs (a parte crítica que você pediu)

A regra de ouro: **sempre que a sessão for iniciada via impersonation, todo registro deve dizer explicitamente que foi o dev, nunca o cliente.**

### 1. Histórico de Acesso (`access_logs` / página "Histórico de Acesso")

Hoje, ao logar, `AuthContext.tsx` insere em `access_logs`:
```
{ user_id: <do usuário logado>, event_type: 'login', metadata: { method: 'email' | 'user_id' } }
```

Isso é feito **no client**, com o JWT do usuário que acabou de logar — se não mexermos, ao abrir a sessão impersonada, o insert vai gravar `user_id = MED001` com `event_type: 'login'`. **Isso seria exatamente o bug que você quer evitar** (pareceria que o Bruno logou).

**Solução:** o passe temporário carrega um marcador (`app_metadata.impersonated_by = <dev_id>`) que é embutido no próprio token quando a edge function o gera. No `AuthContext`, ao detectar esse marcador na sessão nova, o insert em `access_logs` vira:
```
{
  user_id: <MED001 do cliente>,       // continua sendo o alvo, para a linha aparecer no histórico dele
  event_type: 'impersonation_login',   // tipo novo, distinto de 'login'
  metadata: {
    impersonated_by_user_id: <MED002 dev>,
    impersonated_by_name: "Diogo",
    method: "dev_impersonation"
  }
}
```

A página **Histórico de Acesso** (`DevAccessHistory.tsx`) passa a renderizar essas linhas com um badge visual bem claro: **"🎭 Dev Diogo entrou como Bruno"** em cor distinta (âmbar), separado dos logins normais. Filtro adicional: *"Mostrar apenas impersonations"*.

### 2. Rastreamento via Email (`send-tracking-email` type=`login`)

Hoje o `usePresenceHeartbeat` dispara `send-tracking-email` com `type: "login"` no primeiro heartbeat pós-login. Se não mexermos, você receberia um email dizendo *"Bruno acabou de entrar"* — falso.

**Solução:** o hook lê a mesma flag `impersonated_by` da sessão e:
- Se **for** impersonation: envia com `type: "impersonation_login"` e o corpo do email diz explicitamente **"Dev Diogo (MED002) iniciou uma sessão como Bruno (MED001)"**, com data/hora. O assunto vira `[DEV] Sessão impersonada iniciada`.
- Se **não for**: comportamento atual permanece 100% igual.

O mesmo tratamento vale para `email_login_events` (tabela que alimenta o gráfico): grava uma coluna extra `impersonated_by` (nullable) para não misturar métricas de login real com impersonation.

### 3. `user_presence` (indicador online)
Ao entrar impersonando, **não** marcamos o cliente como online no `user_presence` (senão o DevPanel diria falsamente "Bruno está online agora"). O heartbeat só atualiza presença quando a sessão **não** tem `impersonated_by`.

---

## Segurança — garantias

| Risco | Mitigação |
|---|---|
| Alguém não-dev tentar chamar a função | Edge function valida `is_developer()` via JWT do chamador antes de qualquer coisa. Sem isso, retorna 403. |
| Dev impersonar outro dev (escalonamento) | Função rejeita se o alvo tiver role `developer` ou `admin`. |
| Senha do cliente ser afetada | **Nunca é tocada.** `generateLink` do Supabase Admin API não altera senha, só emite um token de uso único. |
| Cliente ser deslogado | Não é. Sessões são independentes por navegador/aba; a dele continua ativa onde quer que esteja. |
| Log parecer que foi o cliente | Marcador `impersonated_by` viaja dentro do próprio JWT (`app_metadata`), o client não consegue forjar/remover. Todos os pontos de escrita (access_logs, email tracking, presence) leem essa flag. |
| Token do passe ser interceptado | Uso único, expira em ~60s, consumido automaticamente pelo DevPanel via `verifyOtp`. Nunca aparece na URL do navegador de forma persistente. |
| Auditoria | Toda impersonation grava linha em `access_logs` com `event_type='impersonation_login'` + quem foi o dev. Irremovível pelo cliente (RLS já bloqueia). |

---

## Detalhes técnicos (para referência)

**Nova edge function `dev-impersonate-user`** (`verify_jwt = true`):
- Recebe `{ target_user_id }`.
- Valida JWT do chamador → confere `is_developer()` via query com service-role.
- Confere que o alvo **não** é developer/admin.
- Usa `supabase.auth.admin.generateLink({ type: 'magiclink', email: <target_email> })` com `data: { impersonated_by: <dev_id>, impersonated_by_name: <dev_name>, impersonated_at: <iso> }` (esses campos vão para `user_metadata` da sessão gerada).
- Retorna `{ action_link, hashed_token, email }` para o client.
- Registra imediatamente em `access_logs` uma linha `event_type='impersonation_started'` com `user_id=<dev_id>` e `metadata.target_user_id=<alvo>` (audit trail server-side, garantido mesmo se o client falhar).

**Client (`DevUsersList.tsx`):**
- Botão "Entrar como" → chama a função → recebe `hashed_token` + `email` → abre `/impersonate?token=...&email=...` em **nova aba** (`window.open`).

**Nova rota `/impersonate`:**
- Página mínima que roda `supabase.auth.verifyOtp({ type: 'magiclink', token_hash, email })` → sessão da aba fica autenticada como o cliente → redireciona para `/hub`.
- Como é uma nova aba com localStorage separado? Não é — o Supabase JS usa o mesmo `localStorage` do domínio. Para isolar, essa rota usa um **client Supabase alternativo** (`createClient` com `storageKey` custom, ex.: `sb-impersonation-token`) → a aba original do dev não é afetada. Isso é padrão-suportado do supabase-js v2.

**Mudanças em `AuthContext.tsx`:**
- Detecta `session.user.user_metadata.impersonated_by`. Se presente:
  - Grava `access_logs` com `event_type='impersonation_login'` + `impersonated_by_user_id/name` no metadata.
  - Expõe `isImpersonating: boolean` e `impersonatedBy: { id, name }` no contexto → banner no topo do app: **"🎭 Você está logado como Bruno (sessão de dev). Encerrar sessão."**

**Mudanças em `usePresenceHeartbeat.ts`:**
- Se `isImpersonating` → pula update de `user_presence`; envia `send-tracking-email` com `type='impersonation_login'` em vez de `login`; grava em `email_login_events` com `impersonated_by` preenchido.

**Mudanças em `send-tracking-email/index.ts`:**
- Novo `EmailType = "impersonation_login"`. Template dedicado que deixa claro no assunto e no corpo que foi o dev — **jamais** cai no template de login normal.

**Mudanças em `DevAccessHistory.tsx`:**
- Filtro "Tipo de evento" ganha opção `impersonation_login` e `impersonation_started`. Linhas com esse tipo são renderizadas com badge âmbar "Impersonation" + nome do dev responsável.

**Migração de banco** (aprovação separada):
- `access_logs`: sem mudança de schema, só novos valores de `event_type`.
- `email_login_events`: adicionar coluna `impersonated_by uuid nullable` + índice.
- Nenhuma nova policy permissiva; a função usa service-role internamente (mesma arquitetura já definida no seu memo `dev-access-isolation`).

---

## O que NÃO vai mudar
- Login normal (ID/email + senha) do cliente e do dev: **idêntico**.
- Fluxo de reset de senha, MFA (se houver no futuro), auto-refresh de token: **intocados**.
- Rotina de `presence`, `email_login_events` para logins reais: **idêntica** — só o caso de impersonation entra por caminho separado.
- Nenhuma senha adicional armazenada em lugar nenhum.

---

## Ordem de execução (quando aprovar)
1. Migração: nova coluna em `email_login_events` + índice.
2. Edge function `dev-impersonate-user` + entrada em `supabase/config.toml`.
3. Rota `/impersonate` + client Supabase alternativo.
4. Botão "Entrar como" em `DevUsersList.tsx`.
5. `AuthContext` detecta impersonation + banner global.
6. `usePresenceHeartbeat` desvia para caminho de impersonation.
7. `send-tracking-email` template `impersonation_login` + deploy.
8. `DevAccessHistory` renderiza linhas de impersonation com destaque.

Depois disso, teste ponta-a-ponta: você entra como MED001, confere que (a) sua sessão dev continua na outra aba, (b) `access_logs` mostra `impersonation_login` com seu nome como impersonador, (c) o email de rastreamento chega dizendo "Dev Diogo entrou como Bruno", (d) `user_presence` do Bruno **não** fica marcado online por causa da sua entrada, (e) o Bruno ainda loga normal com a senha dele.