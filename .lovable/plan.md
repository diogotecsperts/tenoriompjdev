## Causa real

`window.open(url, "_blank", "noopener")` retorna `null` no Chrome/Edge quando `noopener` é passado — por design da spec. Ou seja: a aba **abre** (about:blank), mas nosso `newTab` é `null`, então:

- Na primeira vez o toast "Popup bloqueado" nem chega a aparecer porque na verdade caímos no ramo `if (!newTab)` **antes** de qualquer render — mas a aba já foi criada pelo browser e fica pendurada em about:blank (o "página branca sem tentar carregar nada" que você viu).
- Na segunda tentativa o browser conta como pop-up programático repetido e mostra o aviso de bloqueio — falso positivo, como você descreveu.

Ou seja, o `noopener` é incompatível com o padrão "abrir cedo, navegar depois". Precisamos de referência à janela.

## Fix

Único arquivo: `src/components/dev-panel/DevUsersList.tsx`, `handleImpersonate`.

1. Abrir **sem** `noopener`: `const newTab = window.open("about:blank", "_blank");` — agora retorna a referência real.
2. Se `newTab` for `null` de verdade (popup realmente bloqueado por política), mostrar toast e abortar.
3. Após o fetch bem-sucedido:
   - `newTab.opener = null;` — sever o link reverso (sem opener, a aba nova não pode chamar `window.opener.*`), o que preserva o isolamento essencial (o que o `noopener` fornecia).
   - `newTab.location.replace(url);` — navega a aba já aberta.
4. Em erro do fetch, `newTab.close()`.

Isolamento de sessão continua garantido porque:
- `AuthContext` detecta impersonation pelo hash `#token=` da URL — cada aba tem sua própria URL e seu próprio `sessionStorage` para chaves específicas de impersonation, e nada da aba dev é lido pela aba impersonada além do storage padrão do Supabase (que já é per-tab quando o AuthContext gera storage key própria — isso já estava assim antes).
- `opener = null` impede que a aba nova acesse a aba dev.

## Fora do escopo

Edge function, AuthContext, Impersonate.tsx, dados do Bruno — nada muda.

## Validação

Playwright: logar como dev, `/dev-panel` → Usuários → impersonar MED001 → conferir que a nova aba navega direto para `/impersonate#token=...` sem passar por about:blank em branco, e que a aba dev permanece intacta.
