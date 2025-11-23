import { useLaudo } from "@/contexts/LaudoContext";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionNavigation } from "../SectionNavigation";

interface QuesitosProps {
  currentIndex: number;
  totalSections: number;
  onNext: () => void;
  onPrevious: () => void;
}

export function Quesitos({ currentIndex, totalSections, onNext, onPrevious }: QuesitosProps) {
  const { currentLaudo, updateLaudo } = useLaudo();

  if (!currentLaudo) return null;

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="juizo">Do Juízo</TabsTrigger>
            <TabsTrigger value="reclamante">Do Reclamante</TabsTrigger>
            <TabsTrigger value="reclamada">Da Reclamada</TabsTrigger>
          </TabsList>
          <TabsContent value="juizo" className="space-y-2">
            <Label htmlFor="quesitosJuizo">Quesitos do Juízo</Label>
            <Textarea
              id="quesitosJuizo"
              value={currentLaudo.quesitosJuizo}
              onChange={(e) => updateLaudo({ quesitosJuizo: e.target.value })}
              placeholder="Cole aqui os quesitos formulados pelo Juízo e suas respectivas respostas..."
              rows={12}
            />
          </TabsContent>
          <TabsContent value="reclamante" className="space-y-2">
            <Label htmlFor="quesitosReclamante">Quesitos do Reclamante</Label>
            <Textarea
              id="quesitosReclamante"
              value={currentLaudo.quesitosReclamante}
              onChange={(e) => updateLaudo({ quesitosReclamante: e.target.value })}
              placeholder="Cole aqui os quesitos formulados pelo Reclamante e suas respectivas respostas..."
              rows={12}
            />
          </TabsContent>
          <TabsContent value="reclamada" className="space-y-2">
            <Label htmlFor="quesitosReclamada">Quesitos da Reclamada</Label>
            <Textarea
              id="quesitosReclamada"
              value={currentLaudo.quesitosReclamada}
              onChange={(e) => updateLaudo({ quesitosReclamada: e.target.value })}
              placeholder="Cole aqui os quesitos formulados pela Reclamada e suas respectivas respostas..."
              rows={12}
            />
          </TabsContent>
        </Tabs>
        <SectionNavigation
          currentIndex={currentIndex}
          totalSections={totalSections}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      </CardContent>
    </Card>
  );
}
