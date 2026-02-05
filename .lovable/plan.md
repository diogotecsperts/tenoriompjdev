

# Metodologia Pericial no DevPrompts - Visibilidade e Documentação

## Contexto Atual

A **Metodologia Pericial** é um campo especial no sistema:

| Aspecto | Status Atual |
|---------|--------------|
| **Onde está armazenado** | Tabela `system_config`, ID: `config_metodologia_padrao` |
| **Editável no laudo?** | Sim, via formulário + botão "Restaurar padrão" |
| **Tem prompt de IA?** | Não - é texto padrão técnico-científico, não gerado |
| **Aparece no DevPrompts?** | Apenas como item cinza na navegação (sem clique) |
| **Aparece no PDF de backup?** | Não, pois não tem prompts associados |

## Objetivo

Dar visibilidade adequada à Metodologia Pericial no DevPrompts, reconhecendo que é um campo gerenciado via banco de dados e não via prompts.

---

## Mudanças Propostas

### 1. Navegação - Item Clicável com Modal

**Arquivo:** `src/components/dev-panel/DevPrompts.tsx`

Na navegação lateral, o item "Metodologia Pericial":
- Terá um ícone de banco de dados (Database) ao lado
- Tooltip ao passar o mouse: "Campo fixo - gerenciado via banco de dados"
- Ao clicar: abre um modal exibindo:
  - O texto atual da metodologia (buscado do `system_config`)
  - Informativo explicando que é um campo técnico-científico padronizado
  - Orientação de que alterações devem ser feitas via SQL

```text
+------------------------------------------+
|  Metodologia Pericial [Database icon]    |
|                                          |
|  Este campo contém o texto padrão da     |
|  metodologia pericial utilizada em       |
|  todos os laudos.                        |
|                                          |
|  Como é alterado:                        |
|  O texto é armazenado no banco de dados  |
|  (tabela system_config). Para editar,    |
|  acesse Cloud View > Run SQL.            |
|                                          |
|  +------------------------------------+  |
|  | A perícia médica judicial foi      |  |
|  | realizada segundo critérios...     |  |
|  +------------------------------------+  |
|                                          |
|              [Fechar]                    |
+------------------------------------------+
```

### 2. CoverageChecklist - Nova Categoria "Fixo"

**Arquivo:** `src/components/dev-panel/CoverageChecklist.tsx`

Adicionar indicador visual para campos fixos:
- Ao invés de "(manual)", exibir "(fixo - SQL)" com ícone de Database
- Tooltip explicando que é gerenciado via banco

### 3. PDF de Backup - Incluir Seção Especial

**Arquivo:** `src/components/dev-panel/DevPrompts.tsx` (função `exportToPDF`)

Adicionar nova seção no guia de referência:

```text
CAMPOS FIXOS (system_config)
Propósito: Textos padronizados que não variam entre laudos.
Gerenciamento: Banco de dados (Cloud View > Run SQL).
Campos: Metodologia Pericial
```

E ao iterar pelas seções, incluir a Metodologia Pericial mesmo sem prompts, marcando como "CAMPO FIXO" no PDF.

---

## Detalhes Técnicos

### Estado e Busca do Texto

```tsx
// Novo estado no DevPrompts.tsx
const [metodologiaConfig, setMetodologiaConfig] = useState<{
  texto: string;
  updatedAt: string;
} | null>(null);
const [showMetodologiaModal, setShowMetodologiaModal] = useState(false);

// Buscar na montagem (já existe lógica similar em MetodologiaPericial.tsx)
useEffect(() => {
  supabase
    .from("system_config")
    .select("value, updated_at")
    .eq("id", "config_metodologia_padrao")
    .single()
    .then(({ data }) => {
      if (data?.value) {
        const parsed = typeof data.value === 'string' 
          ? JSON.parse(data.value) 
          : data.value;
        setMetodologiaConfig({
          texto: parsed.texto || '',
          updatedAt: data.updated_at
        });
      }
    });
}, []);
```

### Identificação de Campos Fixos

Adicionar em `laudo-structure.ts`:

```ts
// Campos que são gerenciados via system_config (não via prompts)
export const FIXED_CONFIG_SECTIONS: Record<string, string> = {
  'metodologia': 'config_metodologia_padrao',
};
```

### Lógica de Navegação

```tsx
// No loop de seções na navegação
const isFixedConfig = FIXED_CONFIG_SECTIONS[section.id];

return (
  <button
    onClick={() => isFixedConfig 
      ? setShowMetodologiaModal(true) 
      : handleScrollToSection(section.id)
    }
    className={cn(
      "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between",
      isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      !isFixedConfig && sectionCount === 0 && "opacity-40"
    )}
  >
    <span className="truncate flex items-center gap-1">
      {section.label}
      {isFixedConfig && <Database className="h-3 w-3 text-amber-500" />}
    </span>
    {sectionCount > 0 && (
      <span className="text-[10px] bg-muted px-1 rounded">{sectionCount}</span>
    )}
  </button>
);
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/laudo-structure.ts` | Adicionar `FIXED_CONFIG_SECTIONS` |
| `src/components/dev-panel/DevPrompts.tsx` | Estado para metodologia, modal, navegação atualizada, PDF atualizado |
| `src/components/dev-panel/CoverageChecklist.tsx` | Indicador "(fixo - SQL)" para campos fixos |

---

## Resultado Esperado

1. **Navegação**: "Metodologia Pericial" terá ícone de banco de dados e será clicável
2. **Modal**: Ao clicar, exibe o texto atual com orientações
3. **CoverageChecklist**: Mostra "(fixo - SQL)" ao invés de "(manual)"
4. **PDF de Backup**: Inclui seção explicando campos fixos e lista a Metodologia
5. **Documentação**: Fica claro que alterações devem ser feitas via SQL

