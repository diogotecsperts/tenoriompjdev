
# Plano de Refatoracao da Pagina DevPrompts

## Visao Geral

Este plano foca em melhorias de organizacao e layout da pagina de Prompts IA, sem alterar a logica funcional. O objetivo e criar uma experiencia mais intuitiva que espelhe a ordem exata do laudo e separe claramente os tipos de prompts.

---

## PROBLEMAS IDENTIFICADOS

| Problema | Impacto | Solucao |
|----------|---------|---------|
| Prompt obsoleto `descricaoPostoTrabalho` no seed-prompts | Confusao - mostra campo que nao existe mais | Remover do arquivo de seed |
| Nomes inconsistentes entre UI do laudo e DevPrompts | Usuario nao entende qual campo esta editando | Padronizar nomenclatura |
| Gerar/Regerar misturados sem distincao | Dificil encontrar o prompt certo | Agrupar por tipo dentro de cada secao |
| Muito scroll para navegar | Experiencia ruim | Adicionar navegacao lateral fixa |

---

## MUDANCAS PROPOSTAS

### 1. Remover Prompt Obsoleto do Seed-Prompts

**Arquivo:** `supabase/functions/seed-prompts/index.ts`

**Acao:** Remover a entrada `prompt_regen_descricaoPostoTrabalho` (linhas 199-222) que referencia o campo legado que foi unificado.

**Justificativa:** Este prompt nao deveria mais existir apos a consolidacao de campos para "Ambiente e Atividades Laborais".

---

### 2. Padronizar Nomenclatura

**Problema:** O campo no laudo chama "Ambiente e Atividades Laborais" mas o prompt chama "Descricao das atividades laborais".

**Solucao:** Atualizar a descricao do prompt para refletir o nome correto:

```typescript
// Antes
description: 'Descricao das atividades laborais - Regenerar via PDF'

// Depois  
description: 'Ambiente e Atividades Laborais - Regenerar via PDF'
```

---

### 3. Novo Layout da Pagina DevPrompts

**Conceito:** Layout em 2 colunas com navegacao lateral fixa

```text
+-------------------+----------------------------------------+
|  NAVEGACAO LATERAL |         AREA DE CONTEUDO              |
|  (fixa, 240px)     |         (scroll independente)         |
+-------------------+----------------------------------------+
| ▼ Dados Preliminares |  Dados Preliminares                 |
|   - Perito           |  +--------------------------------+  |
|   - Processo         |  | Dados do Perito                |  |
|   - Objetivo         |  | Gerar | Regerar                |  |
|   - Documentos       |  | [prompt cards lado a lado]     |  |
| ▼ Resumo dos Autos   |  +--------------------------------+  |
|   - Resumo           |  +--------------------------------+  |
|   - Metodologia      |  | Dados do Processo              |  |
| ▼ Dados do Periciando|  | Gerar | Regerar                |  |
|   ...                |  | [prompt cards lado a lado]     |  |
|                      |  +--------------------------------+  |
| [Nao Classificados]  |                                      |
+-------------------+----------------------------------------+
```

**Beneficios:**
- Navegacao rapida sem precisar rolar toda a pagina
- Click no item da navegacao faz scroll suave ate a secao
- Cada secao mostra claramente os prompts "Gerar" e "Regerar" separados
- Cards mais compactos em grid 2 colunas

---

### 4. Reorganizacao de Cada Secao

**Estrutura atual (confusa):**
```
Secao: Dados do Posto de Trabalho
  - prompt_regen_descricaoPostoTrabalho (Regerar)
  - prompt_regen_descricaoAtividadesLaborais (Regerar)
  [prompts misturados sem logica clara]
```

**Nova estrutura (organizada):**
```
Secao: Ambiente e Atividades Laborais
  +-------------------+-------------------+
  | GERAR             | REGERAR           |
  +-------------------+-------------------+
  | (nenhum)          | Regenerar via PDF |
  +-------------------+-------------------+
```

**Cada prompt card mostrara:**
- Badge colorido (Gerar=Verde, Regerar=Azul, Sistema=Cinza)
- Descricao curta
- Data de atualizacao
- Icone de edicao

---

### 5. Componentes a Criar/Modificar

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/components/dev-panel/DevPrompts.tsx` | Modificar | Novo layout 2 colunas, navegacao lateral |
| `src/components/dev-panel/PromptSectionCard.tsx` | Criar (opcional) | Card de secao com separacao Gerar/Regerar |
| `supabase/functions/seed-prompts/index.ts` | Modificar | Remover prompt obsoleto, atualizar descricoes |

---

### 6. Navegacao Lateral - Especificacao

**Comportamento:**
- Lista hierarquica de Cards e Secoes seguindo exatamente a ordem do `LAUDO_STRUCTURE`
- Cards podem expandir/colapsar para mostrar secoes
- Click em secao faz scroll suave ate o elemento correspondente
- Item ativo destacado visualmente
- Contador de prompts ao lado de cada item
- Posicao fixa durante scroll

**Codigo conceitual:**
```tsx
<div className="flex gap-6">
  {/* Navegacao lateral fixa */}
  <aside className="w-60 shrink-0 sticky top-0 h-[calc(100vh-200px)]">
    <ScrollArea className="h-full pr-4">
      {LAUDO_STRUCTURE.map(card => (
        <Collapsible key={card.id} defaultOpen>
          <CollapsibleTrigger className="w-full">
            <div className="flex justify-between py-2">
              <span className="font-medium">{card.title}</span>
              <Badge variant="outline">{count}</Badge>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {card.sections.map(section => (
              <button 
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  "w-full text-left pl-4 py-1 text-sm",
                  activeSection === section.id && "text-primary font-medium"
                )}
              >
                {section.label}
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </ScrollArea>
  </aside>

  {/* Area de conteudo */}
  <main className="flex-1">
    {/* Secoes com refs para scroll */}
  </main>
</div>
```

---

### 7. Card de Secao com Separacao Gerar/Regerar

**Layout de cada secao:**
```tsx
<Card id={`section-${section.id}`} ref={sectionRefs[section.id]}>
  <CardHeader>
    <CardTitle>{section.label}</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-2 gap-4">
      {/* Coluna Gerar */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-emerald-600">
          <Sparkles className="inline h-4 w-4 mr-1" />
          Gerar
        </h4>
        {gerarPrompts.length > 0 ? (
          gerarPrompts.map(p => <PromptMiniCard prompt={p} />)
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Nenhum prompt de geracao
          </p>
        )}
      </div>
      
      {/* Coluna Regerar */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-blue-600">
          <RefreshCw className="inline h-4 w-4 mr-1" />
          Regerar
        </h4>
        {regenarPrompts.map(p => <PromptMiniCard prompt={p} />)}
      </div>
    </div>
  </CardContent>
</Card>
```

---

## RESUMO DAS MUDANCAS

| Categoria | Mudanca | Impacto na Logica |
|-----------|---------|-------------------|
| Dados | Remover prompt obsoleto | Nenhum (prompt nao era usado) |
| Nomenclatura | Padronizar descricoes | Nenhum (apenas labels) |
| Layout | 2 colunas com nav lateral | Nenhum (visual apenas) |
| Organizacao | Separar Gerar/Regerar por coluna | Nenhum (visual apenas) |
| Navegacao | Scroll suave para secoes | Nenhum (UX apenas) |

---

## GARANTIAS

1. **Zero impacto na logica** - Todas as mudancas sao visuais e organizacionais
2. **Retrocompatibilidade** - Prompts existentes continuam funcionando
3. **Nomenclatura unificada** - Mesmos nomes no laudo e no DevPrompts
4. **Ordem identica ao laudo** - Navegacao espelha exatamente a estrutura do LaudoEditor
5. **Separacao clara** - Gerar e Regerar nunca mais misturados

---

## ORDEM DE IMPLEMENTACAO

```text
FASE 1 - Limpeza de Dados
├── Remover prompt obsoleto do seed-prompts
└── Atualizar descricoes para nomenclatura correta

FASE 2 - Refatoracao do Layout
├── Criar estrutura 2 colunas
├── Implementar navegacao lateral fixa
└── Adicionar scroll suave para secoes

FASE 3 - Organizacao por Tipo
├── Separar prompts Gerar/Regerar em cada secao
└── Grid 2 colunas dentro de cada Card
```
