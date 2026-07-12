## Diagnóstico

Confirmado: **não é bug do provedor de email, é configuração**.

No `DevSignupRequests.tsx` o frontend envia `redirect_origin: window.location.origin` para a edge function `signup-request-approve`. Como você clicou em "Aprovar" com o DevPanel aberto **dentro do preview do Lovable**, o `window.location.origin` era `https://ba54c079-...lovableproject.com`, e a função montou o link com essa base:

```
https://ba54c079-...lovableproject.com/finalizar-cadastro?token_hash=...&type=invite
```

A edge function já tem um fallback correto (`https://brunobetav2.tecsperts.com`), mas ele só é usado se o frontend não mandar `redirect_origin`. Como o frontend sempre manda, o fallback nunca entra em cena. Isso viola a regra máxima: **o nome "lovable" não pode aparecer para o cliente**.

## Correção

Ignorar `redirect_origin` vindo do cliente e sempre usar o domínio de produção do projeto no link do email. Assim, independente de onde o dev clique em "Aprovar" (preview do Lovable, published URL, custom domain), o email sai sempre com `https://brunobetav2.tecsperts.com/finalizar-cadastro?...`.

### Passos

1. **`supabase/functions/signup-request-approve/index.ts`**
   - Remover a leitura de `body.redirect_origin`.
   - Definir `const PROD_ORIGIN = "https://brunobetav2.tecsperts.com"` no topo do arquivo (constante ao lado de `APPROVAL_FROM`, para ficar fácil de atualizar caso o domínio mude).
   - Usar `PROD_ORIGIN` para montar `redirectTo` e `actionLink`.

2. **`supabase/functions/signup-request-resend/index.ts`**
   - Aplicar o mesmo tratamento (mesma regra: o link enviado ao cliente sempre precisa apontar para o domínio de produção, nunca para o preview).

3. **`src/components/dev-panel/DevSignupRequests.tsx`**
   - Remover o `body.redirect_origin = window.location.origin` que hoje é enviado no `runAction` para `approve` (e para `resend`, se houver). O cliente não decide mais o domínio do link — quem decide é o backend.

4. **Deploy** das duas edge functions alteradas.

5. **Validação**
   - Cancelar/limpar a solicitação de teste `diogotecinove@gmail.com` que ficou com link do preview.
   - Criar nova solicitação, aprovar novamente pelo DevPanel (mesmo estando dentro do preview do Lovable).
   - Confirmar via logs da função que o link gerado começa com `https://brunobetav2.tecsperts.com/finalizar-cadastro?...`.
   - Confirmar que o email recebido pelo destinatário não contém nenhuma referência a `lovableproject.com` nem a `lovable.app`.

## Observações

- Nada muda no fluxo de aprovação em si — apenas o domínio do link fica fixo em produção.
- Se um dia o projeto passar a ter mais de um domínio custom, basta trocar a constante `PROD_ORIGIN` (ou movê-la para uma env var). Fora do escopo agora.
- Não mexo em templates de email de auth, RLS ou lógica de bootstrap do usuário.
