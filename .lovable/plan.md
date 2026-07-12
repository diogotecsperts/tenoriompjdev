Diagnóstico confirmado

- A tela branca no domínio raiz e em `/dev-panel` não é lentidão de rede nem limitação do computador.
- O HTML publicado carrega rápido e baixa o JS/CSS normalmente.
- O React não monta nada: `#root` fica com `0` filhos.
- O erro real no navegador é:

```text
Cannot read properties of undefined (reading 'forwardRef')
```

- O bundle publicado atual criou estes chunks manuais:

```text
index.js
vendor-react.js
vendor-radix.js
vendor-query.js
vendor-supabase.js
```

- Há um ciclo perigoso entre chunks:

```text
index.js -> vendor-react.js -> vendor-radix.js -> vendor-react.js
```

Isso faz o chunk de UI/Radix tentar usar React antes de a exportação React estar inicializada. Como vários componentes chamam `React.forwardRef` no bootstrap, o app quebra antes de mostrar Login, DevPanel, fallback, ErrorBoundary ou qualquer tela.

Plano de correção segura

1. Corrigir apenas o empacotamento inicial
   - Remover o `manualChunks` recém-adicionado em `vite.config.ts`.
   - Manter o restante da configuração Vite intacta.
   - Motivo: o code splitting manual separou React/Radix de forma circular; deixar o Rollup/Vite decidir os chunks evita esse tipo de ciclo.

2. Preservar as otimizações que não causaram a quebra
   - Manter `React.lazy()` nas rotas em `src/App.tsx`.
   - Manter o carregamento dinâmico de `pdf-lib` em `src/lib/pdf-splitter.ts`.
   - Manter a correção de `src/pages/Impersonate.tsx`.
   - Essas mudanças reduzem o bundle inicial sem criar ciclo entre React e Radix.

3. Não mexer em nada fora do carregamento global
   - Não alterar downloads, ZIP, PDFs, DOCX, OCR, prompts, IA, edge functions, banco, RLS, DevPanel funcional, laudos ou módulos.
   - A mudança será restrita ao bootstrap/build do frontend.

4. Verificação após implementar
   - Conferir o preview local com Playwright em `/` e `/dev-panel`.
   - Confirmar que:

```text
- não há erro forwardRef no console
- #root recebe conteúdo React
- Login aparece no caminho raiz
- /dev-panel deixa de ficar branco e chega ao fluxo esperado de autenticação/proteção
```

5. Publicação
   - Como é correção frontend, o domínio customizado só será atualizado depois de publicar/atualizar a versão.
   - Após a correção estar validada no preview, você deve usar o fluxo de publicação para substituir o bundle quebrado atualmente no domínio.

Resultado esperado

- Eliminar a tela branca global.
- Manter o ganho principal de carregamento por rotas lazy.
- Trocar uma otimização agressiva e instável de cache por uma organização de chunks mais segura.