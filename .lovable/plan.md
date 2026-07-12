Diagnóstico atual:

- O backend está saudável e a tabela de solicitações só tem a solicitação antiga, ainda em `Aguardando finalização`.
- A função pública de solicitação não está registrando erro, mas hoje ela tem um bloqueio silencioso: se o mesmo email já fez solicitação nas últimas 24h, ela responde como sucesso e não cria nada novo. Por isso o usuário vê “enviado”, mas nada aparece no DevPanel.
- A demora/tela branca no login está concentrada no `AuthContext`: o login autentica, depois fica preso em uma tela única de “Carregando...” enquanto busca perfil, papel e checa solicitação pendente. Esse fluxo ainda tem risco de corrida e bloqueio perceptível.

Plano de correção:

1. Corrigir o fluxo de solicitação invisível
   - Ajustar `signup-request-create` para não retornar sucesso silencioso quando houver solicitação recente.
   - Se já existir solicitação ativa para o mesmo email, retornar uma resposta controlada com mensagem clara para a tela pública, sem criar duplicidade.
   - Se a solicitação anterior estiver cancelada/rejeitada ou for um teste antigo, permitir uma nova solicitação conforme regra segura.
   - Registrar logs objetivos da decisão: criada, duplicada ativa, bloqueada por rate-limit, erro real.

2. Melhorar a tela pública de solicitação
   - Em `SolicitarCadastro.tsx`, mostrar mensagem diferente para:
     - solicitação criada;
     - solicitação já existente aguardando análise/finalização;
     - erro real.
   - Isso evita falso positivo de “enviado” quando nada novo entrou no DevPanel.

3. Corrigir a lentidão/tela branca no login
   - Refatorar o carregamento inicial do `AuthContext` para um fluxo determinístico:
     - restaurar sessão;
     - carregar perfil e permissões em paralelo;
     - finalizar loading sempre, inclusive em erro/timeout;
     - não fazer logout por falha transitória de leitura.
   - Remover esperas desnecessárias do caminho crítico do login, especialmente checagens que podem rodar depois ou em paralelo.
   - Manter uma tela de loading, mas com timeout curto e fallback visível, para nunca parecer tela branca travada.

4. Validar ponta a ponta
   - Criar uma nova solicitação com email de teste novo e confirmar que aparece em `Solicitações de cadastro`.
   - Testar tentativa repetida com o mesmo email e confirmar que a mensagem é clara.
   - Fazer login com usuário válido e medir se sai do loading para `/hub` ou `/dev-panel` sem travar.
   - Aprovar a solicitação e confirmar que o link gerado continua usando apenas `brunobetav2.tecsperts.com`, nunca domínio Lovable.

5. Deploy necessário
   - Depois das alterações, publicar/deployar as funções alteradas do backend para que o formulário público passe a usar a correção imediatamente.