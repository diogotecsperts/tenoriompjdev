# Fases 5.4 + 5.5 — SSOT Previdenciário, Contexto e Esqueleto do Editor

## 1. Princípios de modelagem

- **Reaproveitar colunas nativas de `laudos`** sempre que o campo for semanticamente igual ao Trabalhista (perito, processo, vítima, anamnese, exame físico, CIDs, conclusão). Zero migração nova.
- **Tudo que é estritamente INSS/BPC vai para `prev_data` (jsonb)** — isolado, versionado, sem poluir o schema do Trabalhista.
- **`tipo_laudo = 'previdenciario'`** é setado no insert pelo Context (nunca pelo usuário, nunca pela UI).
- **Zero edição** em `LaudoContext`, `LaudoEditor`, exporters ou edge functions do Trabalhista.

---

## 2. Mapeamento de campos: Colunas nativas vs. `prev_data`

### 2.1 Campos REAPROVEITADOS de colunas nativas (já existem em `laudos`)

| Categoria | Coluna nativa | Uso no Previdenciário |
|---|---|---|
| Perito | `perito_nome`, `perito_crm`, `perito_especialidade`, `perito_email`, `perito_telefone`, `perito_endereco` | Idêntico |
| Processo | `processo_numero`, `processo_vara`, `reclamante`, `reclamada` | `reclamante` = segurado; `reclamada` = INSS |
| Datas/local | `data_pericia`, `local_pericia` | Idêntico |
| Segurado | `vitima_nome`, `vitima_nascimento`, `vitima_escolaridade`, `vitima_profissao`, `vitima_dominancia` | Idêntico (rótulo "Segurado" na UI) |
| Clínica | `historia_atual`, `antecedentes`, `tratamentos`, `afastamentos` | Idêntico |
| Exames | `laudos_medicos`, `exames_complementares`, `exame_fisico` | Idêntico |
| Diagnóstico | `cids_selecionados` (jsonb), `diagnostico_cids` (jsonb) | Idêntico |
| Documentos | `documentos` (text[]), `atestados_detalhados` (jsonb) | Idêntico |
| Resumo | `resumo_peticao_inicial` | Reusado como "Resumo da petição/recurso administrativo" |
| Metodologia | `metodologia_pericial`, `objetivo_pericia` | Texto-padrão previdenciário (novo default na UI) |
| Referências | `referencias_bibliograficas` | Idêntico (com bibliografia prev) |
| Honorários | `valor_honorarios` | Idêntico |
| Metadados | `title`, `status`, `ai_metadata`, `anotacoes` | Idêntico |
| Conclusão (genérica) | `conclusao_cid`, `conclusao_analise`, `conclusao_justificativa` | Reaproveitadas para texto livre |

### 2.2 Campos EXCLUSIVOS Previdenciário → `prev_data` (jsonb)

```ts
type PrevData = {
  // --- Benefício pleiteado ---
  beneficio: {
    tipo: 'B31' | 'B32' | 'B91' | 'B92' | 'BPC_LOAS' | 'isencao_IR' | 'majoracao_25' | '';
    nb_numero: string;          // Nº do benefício
    der: string;                // Data de Entrada do Requerimento (ISO date)
    dib: string;                // Data de Início do Benefício
    dcb: string;                // Data de Cessação do Benefício (se houver)
    motivo_cessacao: string;
  };

  // --- Segurado (complementos previdenciários) ---
  segurado: {
    rg: string;
    cpf: string;
    nit_pis: string;
    endereco: string;
    estado_civil: string;
    qualidade_segurado: 'empregado' | 'contribuinte_individual' | 'facultativo' | 'segurado_especial' | 'desempregado_periodo_graca' | '';
    ultima_atividade: string;
    data_ultima_contribuicao: string;
  };

  // --- História clínica/laboral previdenciária ---
  historia_clinica_prev: string;     // versão prev (livre, separada do trabalhista)
  historia_laboral_prev: string;     // trajetória ocupacional resumida

  // --- Análise de incapacidade (NÚCLEO PREVIDENCIÁRIO) ---
  incapacidade: {
    existe: 'sim' | 'nao' | 'parcial' | '';
    tipo: 'temporaria' | 'permanente' | '';
    grau: 'parcial' | 'total' | '';
    abrangencia: 'uniprofissional' | 'multiprofissional' | 'omniprofissional' | '';
    dii: string;                      // Data de Início da Incapacidade
    dii_justificativa: string;
    data_recuperacao_estimada: string;
    susceptivel_reabilitacao: 'sim' | 'nao' | 'inconclusivo' | '';
    necessita_auxilio_terceiros: 'sim' | 'nao' | '';
    justificativa: string;
  };

  // --- Nexo (técnico/previdenciário) ---
  nexo: {
    tipo: 'comum' | 'tecnico_NTEP' | 'profissional' | 'sem_nexo' | '';
    justificativa: string;
  };

  // --- Enquadramento legal ---
  enquadramento: {
    leis_aplicaveis: string[];        // ex: 'Lei 8.213/91 art. 42', 'Decreto 3.048/99 art. 43'
    fundamentacao: string;
  };

  // --- Conclusão previdenciária estruturada ---
  conclusao_prev: {
    parecer: 'apto' | 'incapaz_temporario' | 'incapaz_permanente_total' | 'incapaz_permanente_parcial' | 'inconclusivo' | '';
    beneficio_recomendado: string;    // ex: "Concessão de B31"
    texto_final: string;
  };

  // --- Quesitos (judiciais INSS) ---
  quesitos: {
    juizo: string;
    autor: string;
    inss: string;
  };
};
```

> Toda escrita usa **merge raso** (`{ ...laudo.prev_data, [grupo]: { ...grupo, [campo]: valor } }`) para nunca sobrescrever sub-objetos por engano.

### 2.3 Arquivo `src/lib/previdenciario/laudo-prev-structure.ts`

Mesmo padrão do `laudo-structure.ts` (SSOT), com `LAUDO_PREV_CARDS_STRUCTURE`:

```text
1. Preliminares       → perito | processo | objetivo | documentos
2. Resumo Administrativo → resumo-adm | metodologia-prev
3. Segurado            → identificacao | qualidade-segurado | beneficio
4. História            → historia-clinica | historia-laboral | antecedentes | tratamentos
5. Exame               → laudos-medicos | exames-complementares | exame-fisico
6. Análise Técnica     → cids | nexo-prev | incapacidade | enquadramento-legal
7. Conclusão           → conclusao-prev | quesitos-prev
8. Referências         → referencias
```

Helpers espelhados (`getCardById`, `getNextSection`, etc.) — namespace isolado, **sem importar** nada do `laudo-structure.ts`.

---

## 3. `LaudoPrevidenciarioContext.tsx` (gestão de estado)

Localização: `src/contexts/previdenciario/LaudoPrevidenciarioContext.tsx`

### 3.1 Shape

```ts
interface LaudoPrev extends Tables<'laudos'> {
  prev_data: PrevData;  // tipado forte (jsonb no banco)
}
```

### 3.2 Operações principais

| Operação | Comportamento |
|---|---|
| `createLaudo()` | `insert` com **`tipo_laudo: 'previdenciario'` forçado**, `prev_data: getDefaultPrevData()`, `user_id: auth.uid()`, `title: 'Novo Laudo Previdenciário'`. Retorna `id` para navegação. |
| `loadLaudo(id)` | `select().eq('id', id).eq('tipo_laudo', 'previdenciario').single()` — garante isolamento mesmo se URL for adulterada. Se retorna `null` → redireciona para `/previdenciario/historico`. |
| `updateLaudo(patch)` | Debounce 800ms. Se `patch` contém chave de `prev_data`, faz merge raso. **Nunca permite mudar `tipo_laudo`** (whitelist de campos editáveis). |
| `updatePrevData(group, patch)` | Helper específico: `prev_data[group] = { ...prev_data[group], ...patch }`. |
| `deleteLaudo(id)` | Mesmo filtro defensivo `.eq('tipo_laudo', 'previdenciario')`. |

### 3.3 Guardas de segurança no Context

```ts
// Whitelist — tipo_laudo NUNCA é editável pela UI
const FORBIDDEN_FIELDS = ['tipo_laudo', 'user_id', 'id', 'created_at'];
const sanitizedPatch = Object.fromEntries(
  Object.entries(patch).filter(([k]) => !FORBIDDEN_FIELDS.includes(k))
);
```

### 3.4 Integração com `NavigationGuardContext`

Reaproveitar o existente (já é genérico, marca `isDirty`). Zero alteração no guard.

---

## 4. Esqueleto do `PrevidenciarioLaudoEditor` (Fase 5.5)

### 4.1 Roteamento (em `App.tsx`)

```text
/previdenciario/laudo/new  → cria e redireciona para /previdenciario/laudo/:id
/previdenciario/laudo/:id  → editor
```

Ambas envolvidas em: `ProtectedRoute → ModuleProtectedRoute("previdenciario") → PrevidenciarioLayout → LaudoPrevidenciarioProvider → PrevidenciarioLaudoEditor`.

### 4.2 Fluxo "Novo Laudo"

1. Usuário clica "Novo Laudo" em `/previdenciario` ou `/previdenciario/historico`.
2. Navega para `/previdenciario/laudo/new`.
3. Componente `NewPrevidenciarioLaudo` chama `createLaudo()` → recebe `id` → `navigate(/previdenciario/laudo/${id}, { replace: true })`.
4. Editor monta, carrega via `loadLaudo(id)` (filtro defensivo aplica).

### 4.3 Estrutura visual do editor (skeleton apenas nesta fase)

- **Layout**: clone visual do `LaudoEditor.tsx` (sidebar de seções à esquerda, conteúdo à direita, header com título editável + status + ações).
- **Sidebar**: gerada a partir de `LAUDO_PREV_CARDS_STRUCTURE`.
- **Conteúdo**: `renderSection(sectionId)` retorna `<PlaceholderSection sectionId={id} label={label} />` para TODAS as seções nesta fase. Apenas duas seções funcionais como prova de fluxo:
  - **`perito`** → reusa visualmente um form simples (read-only do perfil) — mesmo padrão do Trabalhista.
  - **`processo`** → 4 inputs (processo_numero, processo_vara, reclamante=segurado, reclamada=INSS) para validar que o `updateLaudo` persiste e o `loadLaudo` recupera corretamente.
- **Sem export, sem IA, sem CIDs especiais** nesta fase — esses entram em 5.6/5.7/5.8.

### 4.4 Componentes novos criados

```
src/contexts/previdenciario/LaudoPrevidenciarioContext.tsx
src/lib/previdenciario/laudo-prev-structure.ts
src/lib/previdenciario/prev-data-defaults.ts        (getDefaultPrevData())
src/pages/previdenciario/PrevidenciarioLaudoEditor.tsx
src/pages/previdenciario/NewPrevidenciarioLaudo.tsx (cria + redireciona)
src/components/previdenciario/PrevidenciarioSidebar.tsx
src/components/previdenciario/sections/PlaceholderSection.tsx
src/components/previdenciario/sections/PeritoSection.tsx       (funcional, read-only)
src/components/previdenciario/sections/ProcessoSection.tsx     (funcional, CRUD)
```

### 4.5 Pontos de integração com Histórico/Home (já existentes)

- `PrevidenciarioHome` e `PrevidenciarioHistorico`: botão "Novo Laudo" passa a apontar para `/previdenciario/laudo/new`.
- `PrevidenciarioHistorico`: linha clicável → `/previdenciario/laudo/:id`.
- **Nenhuma alteração** em arquivos do Trabalhista.

---

## 5. Garantias desta fase

- 0 migrações de banco (a coluna `prev_data` já existe; apenas começa a ser populada).
- 0 edições em arquivos do Trabalhista.
- 0 dependência cruzada com `LaudoContext` ou `laudo-structure.ts`.
- `tipo_laudo='previdenciario'` é imutável a partir do Context.
- Filtro defensivo `.eq('tipo_laudo', 'previdenciario')` em **todo** read/update/delete do Context.
- Rollback = deletar a pasta `previdenciario/` + remover 2 rotas em `App.tsx`.

---

## 6. Validação ao final da fase

1. Trabalhista: smoke test completo (criar laudo, editar, exportar) — deve permanecer 100% igual.
2. Previdenciário: criar laudo em branco, preencher `processo`, recarregar a página, validar persistência.
3. SQL spot-check (via DevPanel ou query): novo registro tem `tipo_laudo='previdenciario'` e `prev_data` populado com defaults.
4. Tentar manualmente via DevTools alterar `tipo_laudo` no patch — deve ser bloqueado pelo whitelist.

---

## 7. O que fica para depois (não entra nesta fase)

- 5.6: Implementação real das seções (formulários completos de incapacidade, benefício, enquadramento legal).
- 5.7: Export DOCX/PDF previdenciário.
- 5.8: Prompts IA específicos (import de processo INSS, geração de nexo previdenciário, etc.).

Aguardo aprovação da modelagem de dados (seção 2) e da estratégia do Context (seção 3) para iniciar a codificação.