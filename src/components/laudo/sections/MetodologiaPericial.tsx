import { useState, useEffect } from "react";
import { useLaudo } from "@/contexts/LaudoContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

// Fallback caso banco esteja indisponível
const METODOLOGIA_FALLBACK = `A perícia médica judicial foi realizada segundo critérios técnicos e científicos reconhecidos na Medicina Legal e na Perícia Médica, observando princípios de causalidade médica, análise de exposição e risco ocupacional e fundamentos de Medicina Baseada em Evidências, em consonância com referenciais técnicos da Associação Brasileira de Medicina Legal e Perícia Médica.

O procedimento pericial compreendeu:

a) anamnese clínica e ocupacional;

b) exame físico pericial direto;

c) análise crítica dos documentos médicos apresentados e daqueles constantes nos autos;

d) avaliação das atividades laborativas sob a ótica dos riscos ocupacionais, quando pertinente.

A análise do nexo causal ou concausal foi realizada com base em critérios técnicos consagrados na literatura médico-pericial, incluindo a classificação de Schilling e os critérios de Simonin e de Bradford-Hill, correlacionando os achados clínicos, o curso temporal, a plausibilidade biológica e a compatibilidade com o padrão de exposição ocupacional descrito.

A avaliação da capacidade laborativa foi efetuada de forma individualizada, considerando as exigências funcionais da atividade exercida e a repercussão clínico-funcional dos achados ao exame físico, conforme recomendações técnicas em saúde ocupacional e medicina do trabalho.

Ressalta-se que este Perito Judicial limita-se à análise técnico-pericial, não sendo de sua atribuição questionar, revisar ou emitir juízo de valor sobre condutas adotadas por profissionais assistentes, cujos registros foram considerados exclusivamente como elementos informativos no contexto da presente perícia.

Os achados foram interpretados à luz do princípio da imparcialidade, do contraditório e do conjunto probatório disponível nos autos.`;

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

  if (!currentLaudo) return null;

  const handleRestaurarPadrao = () => {
    updateLaudo({ metodologiaPericial: metodologiaPadrao });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metodologia Pericial</CardTitle>
        <CardDescription>
          Descrição da metodologia utilizada na elaboração do laudo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-end mb-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRestaurarPadrao}
              className="h-8 text-xs"
              disabled={loading}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Restaurar padrão
            </Button>
          </div>
          <LaudoTextareaAIField
            id="metodologiaPericial"
            label="Metodologia"
            value={currentLaudo.metodologiaPericial || ""}
            onChange={(value) => updateLaudo({ metodologiaPericial: value })}
            placeholder="Descreva a metodologia utilizada para elaboração do laudo..."
            rows={6}
            enableEnhance={true}
            enableRegenerate={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}
