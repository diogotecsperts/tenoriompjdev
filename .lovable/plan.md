

## Plano: Adicionar Mistral OCR ao Modo Passagem Única

---

## Resumo

Adicionar Mistral OCR como opção selecionável no modo **"Passagem Única"**, permitindo que seja usado como:
1. **Provider primário** para extração de PDF (substituindo Gemini)
2. **Provider de fallback** quando o primário falhar

---

## Arquitetura Atual vs Proposta

### Atual
```text
Passagem Única:
├── Provider Principal: [Gemini | Lovable | OpenRouter...]
├── Provider Fallback: [Gemini | Lovable | OpenRouter...]
└── Gemini Vision Direto (Legacy)
```

### Proposta
```text
Passagem Única:
├── Provider Principal: [Gemini | Lovable | OpenRouter | MISTRAL OCR ✨]
├── Provider Fallback: [Gemini | Lovable | OpenRouter | MISTRAL OCR ✨]
└── Gemini Vision Direto (Legacy)
```

---

## Mudanças no Frontend

### 1. Adicionar Mistral OCR à lista AI_PROVIDERS

**Arquivo:** `src/components/dev-panel/DevSettings.tsx`  
**Linha:** ~79 (lista AI_PROVIDERS)

Adicionar novo provider na lista:
```typescript
{
  id: "mistral-ocr",
  name: "Mistral OCR",
  description: "Precisão elite (~94.9%) para tabelas e documentos escaneados. OCR especializado.",
  models: ["mistral-ocr-latest"],
  requiresKey: true,
  color: "hsl(25, 95%, 55%)", // Laranja Mistral
  keyPlaceholder: "..."
}
```

### 2. Modificar Seção "Extração de PDF" (Passagem Única)

**Arquivo:** `src/components/dev-panel/DevSettings.tsx`  
**Linhas:** ~1900-2096 e ~2098-2250

**Mudança 1:** Na seleção de Provider Principal para PDF (linha ~1943), garantir que Mistral OCR apareça quando houver chave configurada.

**Mudança 2:** Adicionar badge "Elite OCR" para Mistral na lista de providers:
```tsx
<SelectItem key="mistral-ocr" value="mistral-ocr">
  <div className="flex items-center gap-2">
    <div className="w-2 h-2 rounded-full bg-orange-500" />
    <span>Mistral OCR</span>
    <Badge className="text-[9px] bg-purple-100 text-purple-700">Elite</Badge>
  </div>
</SelectItem>
```

**Mudança 3:** Na seção "Fallback para PDF" (linha ~2107), adicionar mesma lógica.

### 3. Adicionar Indicador Visual quando Mistral estiver selecionado

Quando `pdf_ai_provider === "mistral-ocr"` ou `pdf_fallback_provider === "mistral-ocr"`:
```tsx
<div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
  <div className="flex items-start gap-2">
    <Crown className="h-4 w-4 text-orange-500" />
    <div className="text-xs space-y-1">
      <p className="font-medium text-orange-700">Mistral OCR Ativo</p>
      <ul className="text-orange-600 space-y-0.5">
        <li>• Precisão elite ~94.9%</li>
        <li>• Custo: ~$1/1000 páginas</li>
        <li>• Limite: 50MB por arquivo</li>
      </ul>
    </div>
  </div>
</div>
```

---

## Mudanças no Backend

### 1. Modificar lógica Single-Pass para suportar Mistral

**Arquivo:** `supabase/functions/processar-autos/index.ts`  
**Linhas:** ~1200-1310 (bloco SINGLE PASS)

**Mudança:** Antes de usar Gemini ou callPDFProvider, verificar se o provider configurado é `mistral-ocr`:

```typescript
// Buscar config de provider para PDF
const { data: pdfConfig } = await supabaseAdmin
  .from('system_config')
  .select('value')
  .in('id', ['pdf_ai_provider', 'pdf_fallback_provider'])
  .returns<{ id: string; value: string }[]>();

const pdfProvider = pdfConfig?.find(c => c.id === 'pdf_ai_provider')?.value || 'gemini';
const fallbackProvider = pdfConfig?.find(c => c.id === 'pdf_fallback_provider')?.value || 'gemini';

// Se Mistral OCR for o provider principal
if (pdfProvider === 'mistral-ocr') {
  console.log('[processar-autos] Using MISTRAL OCR for single-pass extraction...');
  
  const mistralKey = getMistralAPIKey();
  if (!mistralKey) {
    console.warn('[processar-autos] Mistral key not found, falling back to Gemini');
    // Fallback para Gemini
  } else {
    // Converter stream para bytes se necessário
    let bytesForMistral: Uint8Array;
    if (pdfStream) {
      const chunks: Uint8Array[] = [];
      const reader = pdfStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      pdfStream = null;
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      bytesForMistral = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytesForMistral.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      bytesForMistral = pdfBytes!;
    }
    
    // Check for split if >50MB
    if (needsSplit(bytesForMistral.byteLength)) {
      // Split and process with Mistral
      const { parts, pageRanges } = await splitPDF(bytesForMistral, { maxSizeBytes: 40_000_000 });
      // ... process each part with Mistral
    } else {
      const mistralResult = await extractWithMistralOCR(bytesForMistral, mistralKey);
      // ... continue with structured extraction
    }
  }
}
```

### 2. Adicionar fallback para Mistral quando primário falhar

Na lógica de erro/retry do single-pass, adicionar verificação:
```typescript
catch (primaryError) {
  console.error('[processar-autos] Primary provider failed:', primaryError);
  
  // Check if fallback is Mistral OCR
  if (fallbackProvider === 'mistral-ocr') {
    console.log('[processar-autos] Attempting Mistral OCR fallback...');
    const mistralKey = getMistralAPIKey();
    if (mistralKey) {
      // ... use Mistral OCR as fallback
    }
  }
}
```

### 3. Atualizar config.toml se necessário

Verificar se edge function precisa de mais tempo para processamento Mistral (já está com 600s, deve ser suficiente).

---

## Estrutura Visual Final no DevPanel

```text
┌─────────────────────────────────────────────────────────────────┐
│  📄 Extração de PDF                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Provider Principal para PDF                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Provider: [Mistral OCR ▼]                                   ││
│  │           ● IA Integrada                                    ││
│  │           ● Google Gemini                                   ││
│  │           ● Mistral OCR  [Elite] ◄── NOVO                   ││
│  │           ● OpenRouter                                      ││
│  │           ● ...                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👑 Mistral OCR Ativo                                       │ │
│  │ • Precisão elite ~94.9%                                    │ │
│  │ • Especializado em tabelas e documentos escaneados         │ │
│  │ • Custo: ~$1.00 por 1.000 páginas                          │ │
│  │ • Limite: 50MB (dividido automaticamente se maior)         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🛡️ Fallback para PDF                                           │
│  Provider: [Google Gemini ▼]    Modelo: [gemini-2.5-flash]      │
│            ● IA Integrada                                       │
│            ● Google Gemini                                      │
│            ● Mistral OCR  [Elite] ◄── NOVO                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/dev-panel/DevSettings.tsx` | MODIFICAR | Adicionar Mistral OCR à lista de providers e lógica condicional |
| `supabase/functions/processar-autos/index.ts` | MODIFICAR | Adicionar suporte a Mistral OCR no modo single-pass |

---

## Benefícios

1. **Flexibilidade Total:** Usuário pode escolher Mistral OCR como provider principal OU fallback
2. **Consistência:** Mesma opção disponível em ambos os modos (Passagem Única e Duas Fases)
3. **Precisão Elite:** ~94.9% de precisão em tabelas, fórmulas e documentos escaneados
4. **Custo-Benefício:** ~$1/1000 páginas é mais barato que Gemini Pro
5. **Auto-Split:** PDFs >50MB são divididos automaticamente (mesma lógica já implementada)

---

## Fluxo de Decisão Completo

```text
                          PDF Recebido
                              │
                ┌─────────────┴─────────────┐
                │  Modo de Importação?      │
                └─────────────┬─────────────┘
                   PASSAGEM    │    DUAS
                   ÚNICA       │    FASES
                      │        │       │
              ┌───────┴────┐   │   ┌───┴───┐
              │ pdf_ai_    │   │   │ phase1│
              │ provider?  │   │   │ _ocr_ │
              └─────┬──────┘   │   │provider│
                    │          │   └───┬───┘
       ┌────────────┼────────────┐     │
       │            │            │     │
    gemini     mistral-ocr    outros   │
       │            │            │     │
       ▼            ▼            ▼     ▼
   ┌────────┐  ┌──────────┐  ┌──────┐ ┌──────────┐
   │Gemini  │  │Mistral   │  │Call  │ │Fase 1 OCR│
   │Vision  │  │OCR API   │  │PDF   │ │(config)  │
   └────┬───┘  └────┬─────┘  │Prov. │ └────┬─────┘
        │           │        └──┬───┘      │
        └───────────┴───────────┴──────────┘
                         │
                         ▼
                ┌────────────────┐
                │ Texto Extraído │
                └───────┬────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Preenchimento    │
              │ Estruturado JSON │
              └──────────────────┘
```

---

## Próximos Passos de Implementação

1. Adicionar `mistral-ocr` à lista `AI_PROVIDERS` no DevSettings
2. Modificar seção "Extração de PDF" para mostrar Mistral como opção
3. Modificar seção "Fallback para PDF" para mostrar Mistral como opção
4. Adicionar indicador visual quando Mistral estiver selecionado
5. Modificar lógica single-pass no `processar-autos` para suportar Mistral como provider
6. Adicionar lógica de fallback para Mistral no single-pass
7. Testar fluxo completo com Mistral como provider principal
8. Testar fluxo de fallback Gemini → Mistral

