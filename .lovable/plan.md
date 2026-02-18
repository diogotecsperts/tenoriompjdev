
# Ajuste de Cor: Remover Âmbar, Adotar Paleta Teal/Muted

## Problema

O `div` de aviso na linha 386 usa `amber` em todo lugar — borda, fundo, ícone, texto e botão — criando um bloco amarelado que:
- Não pertence à paleta do projeto (Teal/Emerald + Slate/Muted)
- Reduz o contraste do texto, dificultando a leitura
- Destoa visualmente do restante da interface

## Solução

Substituir toda a paleta `amber` por cores neutras da paleta padrão do projeto (`muted`, `border`, `foreground`, `primary`), mantendo o mesmo layout e funcionalidade.

## Mudança exata — linha 386 a 402

**Antes:**
```tsx
<div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3 mb-2">
  <div className="flex items-start gap-2">
    <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
    <p className="text-xs text-amber-700 dark:text-amber-300">
      Configurações individuais <strong>substituem</strong> as configurações globais do DevPanel para este usuário.
    </p>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={handleSyncWithGlobal}
    disabled={syncing}
    className="shrink-0 text-xs h-7 border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
  >
```

**Depois:**
```tsx
<div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3 mb-2">
  <div className="flex items-start gap-2">
    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    <p className="text-xs text-muted-foreground">
      Configurações individuais <strong className="text-foreground">substituem</strong> as configurações globais do DevPanel para este usuário.
    </p>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={handleSyncWithGlobal}
    disabled={syncing}
    className="shrink-0 text-xs h-7"
  >
```

## Resultado

| Elemento | Antes | Depois |
|----------|-------|--------|
| Fundo do box | `bg-amber-50` (amarelo claro) | `bg-muted/40` (cinza suave) |
| Borda | `border-amber-200` (amarelo) | `border-border` (padrão do tema) |
| Ícone Info | `text-amber-600` | `text-muted-foreground` |
| Texto | `text-amber-700` | `text-muted-foreground` |
| Palavra "substituem" | herda âmbar | `text-foreground` (destaque legível) |
| Botão | borda âmbar + hover âmbar | `variant="outline"` padrão sem customização |

Arquivo alterado: `src/components/dev-panel/DevUserSettings.tsx` (linhas 386-402 apenas).
