
# Ajuste Visual: Renomear e Reposicionar "DevPrompts" no Menu

## O que será feito
Duas mudanças visuais simples no array `navItems` do arquivo `src/pages/DevPanel.tsx`:

## Mudança 1: Renomear o label
```
Antes: { id: "prompts", label: "Prompts IA", icon: MessageSquare }
Depois: { id: "prompts", label: "DevPrompts", icon: MessageSquare }
```

## Mudança 2: Reposicionar no menu
Mover o item `prompts` de sua posição atual (8º lugar) para a penúltima posição (10º lugar), ficando:
- ...
- Retries & Rate Limits
- Custos PDF
- **DevPrompts** (nova posição - penúltimo)
- Configurações (último)

## Nova ordem final do array navItems
```typescript
const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Usuários", icon: Users },
  { id: "logs", label: "Logs & Métricas", icon: FileText },
  { id: "backend-logs", label: "Logs Backend", icon: Server },
  { id: "errors", label: "Erros Frontend", icon: AlertTriangle },
  { id: "ai", label: "Inteligência Artificial", icon: Cpu },
  { id: "ai-efficiency", label: "Eficiência de IAs", icon: Gauge },
  { id: "retries", label: "Retries & Rate Limits", icon: RefreshCw },
  { id: "pdf-costs", label: "Custos PDF", icon: DollarSign },
  { id: "prompts", label: "DevPrompts", icon: MessageSquare },  // Renomeado e movido
  { id: "settings", label: "Configurações", icon: Settings },
];
```

## Arquivo modificado
- `src/pages/DevPanel.tsx` (apenas linhas 45-57)

## Impacto
- Zero impacto funcional
- Apenas reorganização visual do menu lateral do DevPanel
