

# Confirmação: Importação de PDF na Impugnação - Totalmente Isolada

## Arquitetura Atual - Confirmação de Separação

Após análise detalhada do código, confirmo que o sistema planejado é **100% isolado** do sistema de importação de laudos.

```text
┌─────────────────────────────────────────────────────────────────┐
│               SISTEMA DE LAUDOS (Não será tocado)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ImportarAutosDialog.tsx                                        │
│         ↓                                                       │
│  Edge Function: processar-autos                                 │
│         ↓                                                       │
│  • PDF Vision extraction com estruturação de dados              │
│  • Geração de resumos (6 tipos)                                 │
│  • Client-side splitting para PDFs grandes                      │
│  • Polling via check-import-status                              │
│  • import_jobs + import_attempts tables                         │
│         ↓                                                       │
│  Cria novo laudo na tabela 'laudos'                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               SISTEMA DE IMPUGNAÇÃO (Novo/Isolado)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/pages/Impugnacao.tsx                                       │
│         ↓                                                       │
│  Edge Function: extrair-texto-pdf (NOVA)                        │
│         ↓                                                       │
│  • OCR simples - retorna apenas texto bruto                     │
│  • Sem estruturação de dados                                    │
│  • Sem resumos                                                  │
│  • Sem tabelas import_jobs/import_attempts                      │
│         ↓                                                       │
│  Insere texto no campo textarea do quesito                      │
│                                                                 │
│  Edge Function: gerar-resposta-impugnacao (já existe)           │
│         ↓                                                       │
│  Gera resposta técnica baseada no laudo                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Garantias de Isolamento

| Aspecto | Sistema de Laudos | Sistema de Impugnação |
|---------|-------------------|----------------------|
| **Edge Function** | `processar-autos` | `extrair-texto-pdf` (nova) |
| **Frontend** | `ImportarAutosDialog.tsx` | `Impugnacao.tsx` |
| **Storage Path** | `{user_id}/autos/...` | `{user_id}/impugnacoes/...` |
| **Tabelas** | `laudos`, `import_jobs`, `import_attempts` | `impugnacoes` |
| **Output** | Dados estruturados em JSON | Texto bruto em string |
| **Polling** | Sim (processo longo) | Não (OCR direto) |
| **Resumos IA** | 6 resumos gerados | Zero resumos |

## Arquivos a Modificar

| Arquivo | Ação | Impacto no Sistema de Laudos |
|---------|------|------------------------------|
| `src/pages/Impugnacao.tsx` | Adicionar botão + upload | **NENHUM** |
| `supabase/functions/extrair-texto-pdf/index.ts` | Criar nova | **NENHUM** |
| `supabase/config.toml` | Adicionar nova função | **NENHUM** |

**Nenhum arquivo do sistema de laudos será modificado:**
- `ImportarAutosDialog.tsx` - Intocado
- `processar-autos/index.ts` - Intocado
- `check-import-status/index.ts` - Intocado
- `gerar-resumos/index.ts` - Intocado

## Nova Edge Function: `extrair-texto-pdf`

Esta função será simples e focada apenas em OCR, sem qualquer complexidade do sistema de laudos:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    extrair-texto-pdf                            │
├─────────────────────────────────────────────────────────────────┤
│  ENTRADA:                                                       │
│    { filePath: string }   // Caminho no bucket                  │
│                                                                 │
│  PROCESSAMENTO:                                                 │
│    1. Download do PDF do storage                                │
│    2. Mistral OCR (até 50MB)                                    │
│    3. Fallback para Gemini Vision se necessário                 │
│                                                                 │
│  SAÍDA:                                                         │
│    {                                                            │
│      texto: string,        // Texto bruto extraído              │
│      pageCount: number,    // Número de páginas                 │
│      provider: string,     // "mistral-ocr" ou "gemini-vision"  │
│      durationMs: number    // Tempo de processamento            │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Comparação com `processar-autos`:**

| Característica | processar-autos | extrair-texto-pdf |
|----------------|-----------------|-------------------|
| Linhas de código | ~2.680 | ~150 (estimativa) |
| Estruturação JSON | Sim (schema complexo) | Não |
| Geração de resumos | 6 tipos | Nenhum |
| Atualização de job | Sim (polling) | Não |
| Criação de laudo | Sim | Não |
| Retentativas automáticas | Sim | Não |

## Fluxo de Uso no Frontend

```text
┌────────────────────────────────────────────────────────────────┐
│ Campo de Quesito                                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────────────────────────┐ [📎 Importar] │
│  │ Digite o texto do quesito...               │               │
│  │                                             │               │
│  │ (ou clique em Importar PDF)                │               │
│  └─────────────────────────────────────────────┘               │
│                                                                │
│  Ao clicar em "Importar PDF":                                  │
│  1. Abre seletor de arquivo                                    │
│  2. Upload para storage (bucket: processos-pdf)                │
│  3. Chama extrair-texto-pdf                                    │
│  4. Texto retornado é inserido no textarea                     │
│  5. Usuário edita/refina se necessário                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Segurança

| Verificação | Status |
|-------------|--------|
| Arquivos separados | Nova edge function isolada |
| Tabelas separadas | Usa `impugnacoes`, não `laudos` |
| Storage path separado | `{user_id}/impugnacoes/` |
| RLS | Mantém proteção existente |
| Dependências compartilhadas | Apenas `_shared/ai-config.ts` e `_shared/mistral-ocr.ts` (somente leitura) |

## Risco de Impacto

**Risco de quebrar importação de laudos: ZERO**

Os módulos compartilhados (`_shared/`) são:
- Funções puras (input → output)
- Sem estado global
- Sem efeitos colaterais
- Já usados por múltiplas edge functions sem conflito

---

## Implementação

A nova funcionalidade será implementada em:

1. **`supabase/functions/extrair-texto-pdf/index.ts`** (Criar)
   - Edge function simples para OCR
   - Usa `extractWithMistralOCR` do módulo compartilhado

2. **`supabase/config.toml`** (Modificar)
   - Adicionar configuração da nova função
   - Não altera configurações existentes

3. **`src/pages/Impugnacao.tsx`** (Modificar)
   - Adicionar botão "Importar PDF" no campo de quesito
   - Adicionar lógica de upload + chamada da edge function
   - Adicionar estado de loading durante processamento

