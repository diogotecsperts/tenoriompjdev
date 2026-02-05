
# Renomear Labels do Menu DevPanel

## Alterações

Arquivo: `src/pages/DevPanel.tsx`

Modificar apenas as propriedades `label` no array `navItems` (linhas 48-50):

| Linha | ID (mantido) | Label Atual | Novo Label |
|-------|--------------|-------------|------------|
| 48 | `logs` | "Logs & Métricas" | "AI Analytics" |
| 49 | `backend-logs` | "Logs Backend" | "Servidor & Jobs" |
| 50 | `errors` | "Erros Frontend" | "UI Reports" |

## Código Resultante

```tsx
const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Usuários", icon: Users },
  { id: "logs", label: "AI Analytics", icon: FileText },           // ← alterado
  { id: "backend-logs", label: "Servidor & Jobs", icon: Server },  // ← alterado
  { id: "errors", label: "UI Reports", icon: AlertTriangle },      // ← alterado
  { id: "ai", label: "Inteligência Artificial", icon: Cpu },
  // ...resto igual
];
```

## Garantias Técnicas

- ✅ `id` permanece inalterado (`logs`, `backend-logs`, `errors`)
- ✅ `DevTab` type não precisa de alteração
- ✅ `switch (activeTab)` continua funcionando (usa `id`, não `label`)
- ✅ Componentes importados (`DevLogs`, `DevBackendLogs`, `DevErrorLogs`) não são afetados
- ✅ Ícones permanecem os mesmos
