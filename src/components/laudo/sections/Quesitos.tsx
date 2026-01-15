import { useLaudo } from "@/contexts/LaudoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LaudoTextareaAIField } from "@/components/laudo/LaudoTextareaAIField";

export function Quesitos() {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

  const hasPdfSource = !!(currentLaudo.aiMetadata as any)?.importJobId || !!(currentLaudo.aiMetadata as any)?.pdfFilePath;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quesitos</CardTitle>
        <CardDescription>
          Respostas aos quesitos formulados pelo Juízo e pelas partes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="juizo" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="juizo">Do Juízo</TabsTrigger>
            <TabsTrigger value="reclamante">Do Reclamante</TabsTrigger>
            <TabsTrigger value="reclamada">Da Reclamada</TabsTrigger>
          </TabsList>
          <TabsContent value="juizo" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosJuizo"
              label="Quesitos do Juízo"
              value={currentLaudo.quesitosJuizo || ""}
              onChange={(value) => updateLaudo({ quesitosJuizo: value })}
              placeholder="Cole aqui os quesitos formulados pelo Juízo e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={true}
              fieldKey="quesitosJuizo"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
          <TabsContent value="reclamante" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosReclamante"
              label="Quesitos do Reclamante"
              value={currentLaudo.quesitosReclamante || ""}
              onChange={(value) => updateLaudo({ quesitosReclamante: value })}
              placeholder="Cole aqui os quesitos formulados pelo Reclamante e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={true}
              fieldKey="quesitosReclamante"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
          <TabsContent value="reclamada" className="space-y-2">
            <LaudoTextareaAIField
              id="quesitosReclamada"
              label="Quesitos da Reclamada"
              value={currentLaudo.quesitosReclamada || ""}
              onChange={(value) => updateLaudo({ quesitosReclamada: value })}
              placeholder="Cole aqui os quesitos formulados pela Reclamada e suas respectivas respostas..."
              rows={12}
              enableEnhance={true}
              enableRegenerate={true}
              fieldKey="quesitosReclamada"
              laudoId={currentLaudo.id}
              hasPdfSource={hasPdfSource}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
