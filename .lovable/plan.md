

# Tornar Metodologia Pericial Editável via Banco de Dados

## Objetivo

Permitir editar o texto padrão da "Metodologia Pericial" diretamente no banco de dados, sem necessidade de alterar código.

## Texto Padrão (Novo)

```text
A perícia médica judicial foi realizada segundo critérios técnicos e científicos reconhecidos na Medicina Legal e na Perícia Médica, observando princípios de causalidade médica, análise de exposição e risco ocupacional e fundamentos de Medicina Baseada em Evidências, em consonância com referenciais técnicos da Associação Brasileira de Medicina Legal e Perícia Médica.

O procedimento pericial compreendeu:

a) anamnese clínica e ocupacional;

b) exame físico pericial direto;

c) análise crítica dos documentos médicos apresentados e daqueles constantes nos autos;

d) avaliação das atividades laborativas sob a ótica dos riscos ocupacionais, quando pertinente.

A análise do nexo causal ou concausal foi realizada com base em critérios técnicos consagrados na literatura médico-pericial, incluindo a classificação de Schilling e os critérios de Simonin e de Bradford-Hill, correlacionando os achados clínicos, o curso temporal, a plausibilidade biológica e a compatibilidade com o padrão de exposição ocupacional descrito.

A avaliação da capacidade laborativa foi efetuada de forma individualizada, considerando as exigências funcionais da atividade exercida e a repercussão clínico-funcional dos achados ao exame físico, conforme recomendações técnicas em saúde ocupacional e medicina do trabalho.

Ressalta-se que este Perito Judicial limita-se à análise técnico-pericial, não sendo de sua atribuição questionar, revisar ou emitir juízo de valor sobre condutas adotadas por profissionais assistentes, cujos registros foram considerados exclusivamente como elementos informativos no contexto da presente perícia.

Os achados foram interpretados à luz do princípio da imparcialidade, do contraditório e do conjunto probatório disponível nos autos.
```

---

## Implementação

### 1. Inserir configuração no banco de dados

Inserir na tabela `system_config` com ID `config_metodologia_padrao`:

```sql
INSERT INTO system_config (id, value, description)
VALUES (
  'config_metodologia_padrao',
  '{"texto": "A perícia médica judicial foi realizada segundo critérios técnicos e científicos reconhecidos na Medicina Legal e na Perícia Médica, observando princípios de causalidade médica, análise de exposição e risco ocupacional e fundamentos de Medicina Baseada em Evidências, em consonância com referenciais técnicos da Associação Brasileira de Medicina Legal e Perícia Médica.\n\nO procedimento pericial compreendeu:\n\na) anamnese clínica e ocupacional;\n\nb) exame físico pericial direto;\n\nc) análise crítica dos documentos médicos apresentados e daqueles constantes nos autos;\n\nd) avaliação das atividades laborativas sob a ótica dos riscos ocupacionais, quando pertinente.\n\nA análise do nexo causal ou concausal foi realizada com base em critérios técnicos consagrados na literatura médico-pericial, incluindo a classificação de Schilling e os critérios de Simonin e de Bradford-Hill, correlacionando os achados clínicos, o curso temporal, a plausibilidade biológica e a compatibilidade com o padrão de exposição ocupacional descrito.\n\nA avaliação da capacidade laborativa foi efetuada de forma individualizada, considerando as exigências funcionais da atividade exercida e a repercussão clínico-funcional dos achados ao exame físico, conforme recomendações técnicas em saúde ocupacional e medicina do trabalho.\n\nRessalta-se que este Perito Judicial limita-se à análise técnico-pericial, não sendo de sua atribuição questionar, revisar ou emitir juízo de valor sobre condutas adotadas por profissionais assistentes, cujos registros foram considerados exclusivamente como elementos informativos no contexto da presente perícia.\n\nOs achados foram interpretados à luz do princípio da imparcialidade, do contraditório e do conjunto probatório disponível nos autos."}'::jsonb,
  'Texto padrão da Metodologia Pericial'
)
ON CONFLICT (id) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
```

### 2. Modificar componente MetodologiaPericial.tsx

**Mudanças:**

| Antes | Depois |
|-------|--------|
| Texto padrão hardcoded em constante | Buscar do banco via `useEffect` |
| `handleRestaurarPadrao` usa constante | Usa estado carregado do banco |

**Código atualizado:**

```typescript
import { useState, useEffect } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { supabase } from "@/integrations/supabase/client";
// ... demais imports

// Fallback caso banco esteja indisponível
const METODOLOGIA_FALLBACK = `A perícia médica judicial foi realizada segundo critérios técnicos...`;

export function MetodologiaPericial() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const [metodologiaPadrao, setMetodologiaPadrao] = useState(METODOLOGIA_FALLBACK);
  const [loading, setLoading] = useState(true);

  // Buscar texto padrão do banco na montagem
  useEffect(() => {
    const fetchMetodologia = async () => {
      try {
        const { data, error } = await supabase
          .from("system_config")
          .select("value")
          .eq("id", "config_metodologia_padrao")
          .single();

        if (data?.value && !error) {
          const parsed = typeof data.value === 'string' 
            ? JSON.parse(data.value) 
            : data.value;
          if (parsed.texto) {
            setMetodologiaPadrao(parsed.texto);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar metodologia padrão:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetodologia();
  }, []);

  const handleRestaurarPadrao = () => {
    updateLaudo({ metodologiaPericial: metodologiaPadrao });
  };
  
  // ... resto do componente
}
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| Tabela `system_config` | INSERT da configuração |
| `src/components/laudo/sections/MetodologiaPericial.tsx` | Buscar texto do banco |

---

## Como Editar Futuramente (Opção A)

Para alterar o texto da metodologia, execute via SQL:

```sql
UPDATE system_config
SET value = '{"texto": "SEU NOVO TEXTO AQUI"}'::jsonb,
    updated_at = now()
WHERE id = 'config_metodologia_padrao';
```

---

## Lembrete para o Futuro

Quando este assunto surgir novamente, considerar implementar a **Opção B**: criar uma interface no DevPanel (aba "Configurações de Texto") para editar `config_metodologia_padrao` visualmente, sem necessidade de SQL.

---

## Resultado Esperado

1. O botão "Restaurar padrão" usará o texto do banco de dados
2. Laudos **existentes** não são afetados
3. Novos laudos ou ao clicar "Restaurar padrão" recebem o novo texto
4. Fallback seguro: se o banco falhar, usa texto hardcoded
5. Editável via SQL sem deploy de código

