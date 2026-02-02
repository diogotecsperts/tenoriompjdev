
# Plano: Adicionar Confirmação de Segurança ao Botão "Carregar Padrão"

## Problema Identificado

O botão "Carregar Padrão" executa `upsert` imediatamente, sobrescrevendo TODOS os prompts existentes com as versões hardcoded do código, sem pedir confirmação.

## Comportamento Atual

```
[Clique no botão] → [Sobrescreve tudo] → [Toast "X inseridos, Y atualizados"]
```

O campo "atualizados" indica quantos prompts personalizados foram substituídos pelos padrões.

## Comportamento Desejado

```
[Clique no botão] → [Dialog de confirmação] → [Escolha do usuário] → [Ação]
```

## Implementação

### Arquivo a modificar

`src/components/dev-panel/DevPrompts.tsx`

### Mudanças

1. **Adicionar state para controlar o dialog**
```typescript
const [showSeedConfirmDialog, setShowSeedConfirmDialog] = useState(false);
```

2. **Modificar o botão "Carregar Padrão"**
Ao invés de chamar `seedPrompts()` diretamente, abre o dialog:
```typescript
onClick={() => setShowSeedConfirmDialog(true)}
```

3. **Adicionar AlertDialog de confirmação**
```text
+----------------------------------------------------------+
|  ⚠️ Restaurar Prompts para Padrão de Fábrica?            |
|                                                           |
|  Esta ação irá SOBRESCREVER todos os prompts              |
|  existentes com as versões originais do sistema.          |
|                                                           |
|  ❌ Todas as suas edições personalizadas serão perdidas!  |
|                                                           |
|  💡 Recomendação: Faça um backup clicando em              |
|  "Exportar PDF" antes de continuar.                       |
|                                                           |
|        [Cancelar]            [Restaurar Padrão]           |
+----------------------------------------------------------+
```

4. **Opção secundária: Exportar primeiro**
Dentro do dialog, incluir um link ou botão para exportar PDF antes de confirmar.

## Detalhes Técnicos

### Imports necessários
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

### Fluxo do Dialog

| Ação do Usuário | Resultado |
|-----------------|-----------|
| Cancelar | Fecha dialog, nada acontece |
| Restaurar Padrão | Fecha dialog, executa `seedPrompts()` |

## Resumo Visual do Fluxo

```
Usuário clica "Carregar Padrão"
         │
         ▼
┌─────────────────────────┐
│  Dialog de Confirmação  │
│  "Tem certeza? Suas     │
│   edições serão         │
│   perdidas!"            │
└─────────────────────────┘
         │
    ┌────┴────┐
    │         │
 Cancelar   Confirmar
    │         │
    ▼         ▼
 Nada    seedPrompts()
         │
         ▼
   Prompts resetados
   para versão de fábrica
```

## Segurança Adicional

O texto do dialog deixará explícito que:
1. **Prompts existentes serão sobrescritos**
2. **Edições personalizadas serão perdidas**
3. **Recomendação de exportar PDF antes**

## Resultado Esperado

Após implementação, o usuário:
- Terá aviso claro antes de resetar prompts
- Poderá cancelar se clicar por engano
- Será lembrado de fazer backup via PDF

