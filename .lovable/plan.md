
## Plano: Corrigir Legibilidade do Badge "Processamento Chunked"

### Problema Identificado

O badge de "Processamento Chunked" tem problemas de contraste:

| Elemento | Classes Atuais | Problema |
|----------|---------------|----------|
| Container | `bg-purple-500/10` | Fundo muito transparente |
| Título | `text-purple-700` | Contraste insuficiente sobre fundo claro |
| Badge interno | `bg-purple-500/20 text-purple-700` | Texto pouco legível |

### Solução Proposta

Aumentar o contraste do texto tornando-o mais escuro (quase preto), mantendo o fundo roxo claro:

| Elemento | Classes Novas | Resultado |
|----------|--------------|-----------|
| Container | `bg-purple-500/10` (manter) | Fundo roxo suave continua bonito |
| Ícone | `text-purple-900` | Ícone mais visível |
| Título | `text-purple-900` | Texto escuro, alta legibilidade |
| Badge interno | `bg-purple-500/20 text-purple-900` | Número de partes bem legível |

### Mudança Técnica

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx` (linhas 1409-1414)

Alterações pontuais de classes CSS:
- Linha 1410: `text-purple-600` → `text-purple-900`
- Linha 1411: `text-purple-700` → `text-purple-900`
- Linha 1414: `text-purple-700` → `text-purple-900`

### Código Antes vs Depois

**Antes:**
```tsx
<Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
<span className="font-medium text-purple-700 dark:text-purple-400">
  Processamento Chunked
</span>
<Badge variant="secondary" className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-0">
```

**Depois:**
```tsx
<Layers className="h-4 w-4 text-purple-900 dark:text-purple-300" />
<span className="font-medium text-purple-900 dark:text-purple-300">
  Processamento Chunked
</span>
<Badge variant="secondary" className="bg-purple-500/20 text-purple-900 dark:text-purple-200 border-0">
```

### Proteção

- Apenas 4 classes CSS são alteradas
- Nenhuma lógica de código é modificada
- Nenhuma estrutura HTML é alterada
- Dark mode também é ajustado para manter consistência
