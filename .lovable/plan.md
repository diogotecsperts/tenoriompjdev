
## Plano: Indicador Visual de Split + Configuração Mistral OCR no DevPanel

---

## Resumo das 3 Tarefas

1. **Teste com PDF grande (>50MB):** Usar ferramentas de browser para testar o fluxo de split automático
2. **Indicador visual no modal de importação:** Mostrar quando o PDF será dividido automaticamente
3. **Configurar Mistral OCR no DevPanel:** Adicionar opção de selecionar Mistral OCR como alternativa primária para extração

---

## Tarefa 1: Testar com PDF Grande

Usarei as ferramentas de browser para:
1. Abrir o modal de importação no Dashboard
2. Fazer upload de um PDF > 50MB (se disponível) ou simular com um arquivo de teste
3. Observar logs de rede e console para verificar se o split está funcionando
4. Verificar se a mensagem "Dividindo PDF grande em partes..." aparece no progresso

**Observação:** O teste dependerá da disponibilidade de um arquivo PDF grande no ambiente.

---

## Tarefa 2: Indicador Visual de Split no Modal

### Localização: `src/components/tools/ImportarAutosDialog.tsx`

Quando um arquivo for selecionado e for maior que 45MB, exibir um alerta informativo antes do botão "Processar com IA".

### Mudanças:

1. **Adicionar constante de limite:**
```typescript
const GEMINI_PROCESSING_LIMIT_MB = 45; // 45MB - acima disso, PDF será dividido
```

2. **Adicionar indicador visual após seleção do arquivo (linha ~1440):**

Dentro do bloco `{selectedFile && (...)}`, adicionar antes do botão:

```tsx
{/* Large PDF Auto-Split Indicator */}
{selectedFile && selectedFile.size > GEMINI_PROCESSING_LIMIT_MB * 1024 * 1024 && (
  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
    <Layers className="h-4 w-4 text-amber-600" />
    <AlertTitle className="text-amber-700 dark:text-amber-400 text-sm font-medium">
      PDF Grande Detectado
    </AlertTitle>
    <AlertDescription className="text-amber-600 dark:text-amber-300 text-xs">
      Este arquivo ({formatFileSize(selectedFile.size)}) será dividido automaticamente em partes menores para processamento. 
      Isso é normal e não afeta a qualidade da extração.
    </AlertDescription>
  </Alert>
)}
```

3. **Importar ícone Layers:**
```typescript
import { ..., Layers } from "lucide-react";
```

### Resultado Visual:
```text
┌────────────────────────────────────────────────────────┐
│  📄 documento-grande.pdf                               │
│     68.5 MB                                      [x]   │
├────────────────────────────────────────────────────────┤
│  ⚠️ PDF Grande Detectado                               │
│  Este arquivo (68.5 MB) será dividido automaticamente  │
│  em partes menores para processamento.                 │
│  Isso é normal e não afeta a qualidade da extração.    │
├────────────────────────────────────────────────────────┤
│          [ ✨ Processar com IA ]                       │
└────────────────────────────────────────────────────────┘
```

---

## Tarefa 3: Adicionar Mistral OCR ao DevPanel

### Localização: `src/components/dev-panel/DevSettings.tsx`

### Mudanças Necessárias:

#### 3.1. Atualizar Interface `SystemConfig` (linha ~45-65):

Adicionar novo campo para provedor de OCR:
```typescript
interface SystemConfig {
  // ... campos existentes ...
  phase1_ocr_provider: string; // 'gemini' ou 'mistral'
  phase1_gemini_model: string;
}
```

#### 3.2. Atualizar `DEFAULT_CONFIG` (linha ~152-174):

```typescript
const DEFAULT_CONFIG: SystemConfig = {
  // ... campos existentes ...
  phase1_ocr_provider: "gemini",
  phase1_gemini_model: "gemini-2.5-flash"
};
```

#### 3.3. Modificar Seção "Fase 1: Extração Visual (OCR)" (linhas ~2333-2426):

Transformar em um seletor de provider com opções Gemini e Mistral:

```tsx
{/* Phase 1 OCR Provider Selection */}
<div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
  <h4 className="font-medium text-sm flex items-center gap-2">
    <Cpu className="h-4 w-4 text-blue-600" />
    Fase 1: Extração Visual (OCR)
  </h4>
  <p className="text-xs text-muted-foreground">
    Selecione o provedor de OCR para extração de texto do PDF. 
    Mistral OCR tem precisão elite (~94.9%) para tabelas e documentos escaneados.
  </p>
  
  {/* Provider Selector */}
  <div className="space-y-2">
    <Label>Provedor de OCR</Label>
    <Select 
      value={config.phase1_ocr_provider || "gemini"} 
      onValueChange={value => setConfig({...config, phase1_ocr_provider: value})}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="gemini">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Google Gemini</span>
            <Badge variant="outline" className="text-[10px]">Padrão</Badge>
          </div>
        </SelectItem>
        <SelectItem value="mistral">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>Mistral OCR</span>
            <Badge className="text-[10px] bg-purple-100 text-purple-700">Elite</Badge>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  {/* Gemini Model Selector (only if Gemini selected) */}
  {config.phase1_ocr_provider === "gemini" && (
    <div className="space-y-2">
      <Label>Modelo Gemini</Label>
      <Select 
        value={config.phase1_gemini_model || "gemini-2.5-flash"} 
        onValueChange={value => setConfig({...config, phase1_gemini_model: value})}
      >
        {/* ... existing Gemini model options ... */}
      </Select>
    </div>
  )}
  
  {/* Mistral OCR Info (only if Mistral selected) */}
  {config.phase1_ocr_provider === "mistral" && (
    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
      <div className="flex items-start gap-2">
        <Crown className="h-4 w-4 text-orange-500 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-medium text-orange-700 dark:text-orange-400">
            Mistral OCR - Precisão Elite
          </p>
          <ul className="text-orange-600 dark:text-orange-300 space-y-0.5">
            <li>• Precisão ~94.9% em tabelas e fórmulas</li>
            <li>• Output: Markdown estruturado</li>
            <li>• Custo: ~$1.00 por 1.000 páginas</li>
            <li>• Limite: 50MB por arquivo</li>
          </ul>
          {!savedApiKeys['mistral'] && (
            <p className="text-orange-500 font-medium mt-2">
              ⚠️ Requer MISTRAL_API_KEY configurada
            </p>
          )}
        </div>
      </div>
    </div>
  )}
</div>
```

#### 3.4. Adicionar Importação do ícone Crown:

```typescript
import { ..., Crown } from "lucide-react";
```

#### 3.5. Atualizar `fetchConfig` para incluir novo campo:

Adicionar `'phase1_ocr_provider'` à lista de IDs buscados na query do system_config.

#### 3.6. Atualizar `saveConfig` para salvar novo campo:

Incluir `phase1_ocr_provider` nos campos salvos no upsert.

---

## Mudanças no Backend (processar-autos)

### Localização: `supabase/functions/processar-autos/index.ts`

Modificar a lógica de extração visual para respeitar a configuração do DevPanel:

1. **Buscar configuração `phase1_ocr_provider`** junto com outras configs (linha ~881):
```typescript
.in('id', ['import_strategy', 'text_fill_provider', 'text_fill_model', 
           'store_extracted_text', 'phase1_gemini_model', 'phase1_ocr_provider']);
```

2. **Adicionar lógica condicional** para usar Mistral ou Gemini:
```typescript
const ocrProvider = strategyMap.phase1_ocr_provider || 'gemini';

if (ocrProvider === 'mistral') {
  const mistralKey = getMistralAPIKey();
  if (!mistralKey) {
    throw new Error('MISTRAL_API_KEY não configurada');
  }
  
  // Use Mistral OCR
  const mistralResult = await extractWithMistralOCR(pdfBytes, mistralKey);
  rawExtractedText = mistralResult.text;
  extractionProvider = 'mistral-ocr';
} else {
  // Use Gemini (existing flow)
  // ...
}
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/tools/ImportarAutosDialog.tsx` | MODIFICAR | Adicionar indicador visual de split automático |
| `src/components/dev-panel/DevSettings.tsx` | MODIFICAR | Adicionar seletor de provider OCR (Gemini/Mistral) |
| `supabase/functions/processar-autos/index.ts` | MODIFICAR | Respeitar configuração de provider OCR |

---

## Fluxo Visual do DevPanel

```text
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ Estratégia de Importação                        [ATIVO]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Modo de Importação: [Duas Fases (Recomendado) ▼]               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🔷 Fase 1: Extração Visual (OCR)                               │
│                                                                 │
│  Provedor de OCR: [Mistral OCR ▼]                               │
│                   ● Google Gemini  [Padrão]                     │
│                   ● Mistral OCR    [Elite]  ◄── NOVO            │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👑 Mistral OCR - Precisão Elite                            │ │
│  │ • Precisão ~94.9% em tabelas e fórmulas                    │ │
│  │ • Output: Markdown estruturado                             │ │
│  │ • Custo: ~$1.00 por 1.000 páginas                          │ │
│  │ • Limite: 50MB por arquivo                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📝 Fase 2: Preenchimento de Campos                             │
│  Provider: [OpenRouter ▼]  Modelo: [openai/gpt-4o-mini]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefícios

1. **Transparência:** Usuário sabe quando o PDF será dividido antes de processar
2. **Flexibilidade:** Admin pode escolher Mistral OCR para documentos complexos
3. **Custo-benefício:** Mistral OCR é mais barato que Gemini Pro com precisão similar
4. **Elite Precision:** Mistral OCR ~94.9% é superior para tabelas e fórmulas

---

## Próximos Passos de Implementação

1. Adicionar indicador visual de split no ImportarAutosDialog
2. Adicionar seletor de provider OCR no DevSettings
3. Modificar lógica de extração no processar-autos para usar provider configurado
4. Testar fluxo completo com ambos os providers
5. Testar com PDF grande para verificar split + Mistral
