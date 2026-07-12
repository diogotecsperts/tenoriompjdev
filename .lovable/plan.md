## Diagnóstico preciso

- O backend está saudável e a função `dev-list-prev-usage` já responde **200** quando chamada com uma sessão dev válida; os dados do usuário selecionado continuam existindo e carregam normalmente.
- O erro atual não é perda dos dados do Controle de Uso. É uma cascata de autenticação/sessão:
  - havia chamadas usando token antigo/invalidado, retornando `401 {"error":"Invalid token"}`;
  - depois do logout/login, a tela caiu no estado `Perfil não carregou` porque o `AuthContext` trata falha transitória de perfil como bloqueio visual da sessão;
  - o `Controle de Uso` faz uma chamada manual via `fetch` com `getSession().access_token`, em vez de usar o cliente autenticado padrão. Isso é mais frágil quando a sessão acabou de trocar/recuperar.
- Confirmei no banco que seu usuário dev `diogomixcds@gmail.com` tem perfil e roles `{user, developer}`. O usuário de teste `diogotecinove@gmail.com` também está íntegro e a solicitação mais recente está `completed`.

## Plano de correção

1. **Blindar o carregamento de perfil no login**
   - No `AuthContext`, antes de travar em `profile = null`, tentar recuperar/validar sessão com `getUser()` e refazer a leitura do perfil uma vez.
   - Separar claramente:
     - sessão inválida de verdade → limpar sessão;
     - perfil inexistente de verdade → bloquear como conta inválida;
     - falha transitória de rede/backend/RLS → manter carregando/permitir retry sem deixar o usuário preso em “Perfil não carregou”.

2. **Remover fragilidade do Controle de Uso**
   - Trocar a chamada manual `fetch(.../functions/v1/dev-list-prev-usage)` por `supabase.functions.invoke("dev-list-prev-usage", { body/query })` ou por um helper autenticado que force `getUser()` antes de enviar.
   - Evitar enviar `Bearer undefined` ou token recém-invalidado.
   - Melhorar o erro exibido: se for 401, orientar recarregar sessão e não derrubar/blankar a página.

3. **Padronizar autenticação das funções `dev-*`**
   - Atualizar `dev-list-prev-usage` e funções irmãs (`dev-list-pdfs`, `dev-download-pdf`, `dev-save-pericia-pdf-meta`, `dev-get-pericia-data`, `dev-impersonate-user`) para validar token com o padrão atual (`getClaims`/validação robusta) e checar role developer via backend, preservando isolamento de dados.
   - Manter `verify_jwt = false` nessas funções, porque a validação fica dentro da função e evita o problema de gateway com signing keys.

4. **Preservar dados e acesso dev**
   - Não mexer nos dados de perícias, pautas, PDFs, usuários ou roles.
   - Apenas estabilizar a sessão e o caminho de autenticação para que o DevPanel volte a carregar as mesmas informações já existentes.

5. **Validação depois da correção**
   - Testar `dev-list-prev-usage` autenticado como dev: deve retornar 200 com pautas/perícias.
   - Testar sem autenticação: deve retornar 401 controlado pela função.
   - Verificar que seu perfil dev carrega e que o Controle de Uso abre sem runtime error/blank screen.