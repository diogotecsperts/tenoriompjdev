## Correção: Acesso ao módulo Previdenciário respeitando "Módulos por Usuário"

### Problema
Na última iteração, adicionei uma trava `isPrev` hardcoded no `Hub.tsx` que bloqueia o clique no card Previdenciário para qualquer usuário — inclusive devs/admins que já têm o módulo liberado via DevPanel → "Módulos por Usuário". Isso conflita com o sistema de permissões existente (`user_modules` + RPC `has_module`).

### Princípio
A permissão de acesso é controlada **exclusivamente** por `allowed.has("previdenciario")` (que já considera `user_modules` + bypass de admin/dev). O selo "Em construção" e a estética cinza são **apenas visuais** — não devem bloquear nada por si só.

### Mudanças (somente `src/pages/Hub.tsx`)

1. **Card Previdenciário**
   - `cursor-pointer` e `hover:border-primary hover:shadow-lg` voltam quando `enabled === true`, mesmo sendo `isPrev`.
   - `opacity-70 border-dashed cursor-not-allowed` só quando `isPrev && !enabled`.
   - `onClick` passa a ser `enabled && navigate(mod.route)` (remove a checagem `!isPrev`).

2. **Ícone do Previdenciário**
   - Mantém cinza (`bg-muted text-muted-foreground`) sempre — é a sinalização visual de "beta" que você pediu, independentemente da permissão.
   - (Alternativa: usar cinza só quando `!enabled` e cor primary quando liberado. Posso fazer assim se preferir — me avise.)

3. **Badge "Em construção"**
   - Continua aparecendo sempre que `isPrev` (sinaliza o estado do módulo para todos, inclusive devs).

4. **Botão do card Previdenciário**
   - Se `enabled`: botão ativo "Acessar módulo (beta)" com seta — clicável.
   - Se `!enabled`: botão desabilitado "Módulo em construção".

5. **Lógica final do card (resumo)**
   ```text
   isPrev && enabled  → card clicável, ícone cinza, badge "Em construção", botão "Acessar módulo (beta)"
   isPrev && !enabled → card travado cinza/dashed, botão "Módulo em construção"
   !isPrev && enabled → comportamento normal atual
   !isPrev && !enabled→ card travado com badge "Bloqueado"
   ```

### Fora de escopo
Nada de banco, RLS, rotas ou `ModuleProtectedRoute` muda — aquele guard já valida `has_module` corretamente. Após aprovação, retomamos exatamente de onde paramos na Fase 5.8.
