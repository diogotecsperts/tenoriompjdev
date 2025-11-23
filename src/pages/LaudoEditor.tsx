import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, FileText, Printer } from "lucide-react";
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LaudoSidebar } from "@/components/laudo/LaudoSidebar";
import { DadosPerito } from "@/components/laudo/sections/DadosPerito";
import { DadosProcesso } from "@/components/laudo/sections/DadosProcesso";
import { DocumentosAvaliacao } from "@/components/laudo/sections/DocumentosAvaliacao";
import { DadosVitima } from "@/components/laudo/sections/DadosVitima";
import { DadosAcidente } from "@/components/laudo/sections/DadosAcidente";
import { Anamnese } from "@/components/laudo/sections/Anamnese";
import { AntecedentesPatologicos } from "@/components/laudo/sections/AntecedentesPatologicos";
import { Planejamento } from "@/components/laudo/sections/Planejamento";
import { LaudosMedicos } from "@/components/laudo/sections/LaudosMedicos";
import { ExamesComplementares } from "@/components/laudo/sections/ExamesComplementares";
import { ExameFisico } from "@/components/laudo/sections/ExameFisico";
import { NexoCausal } from "@/components/laudo/sections/NexoCausal";
import { Conclusao } from "@/components/laudo/sections/Conclusao";
import { AvaliacaoSequelas } from "@/components/laudo/sections/AvaliacaoSequelas";
import { Quesitos } from "@/components/laudo/sections/Quesitos";

const sections = [
  { id: "perito", label: "Dados do Perito", component: DadosPerito },
  { id: "processo", label: "Dados do Processo", component: DadosProcesso },
  { id: "documentos", label: "Documentos", component: DocumentosAvaliacao },
  { id: "vitima", label: "Dados da Vítima", component: DadosVitima },
  { id: "acidente", label: "Dados do Acidente", component: DadosAcidente },
  { id: "anamnese", label: "Anamnese", component: Anamnese },
  { id: "antecedentes", label: "Antecedentes", component: AntecedentesPatologicos },
  { id: "planejamento", label: "Planejamento", component: Planejamento },
  { id: "laudos", label: "Laudos Médicos", component: LaudosMedicos },
  { id: "exames", label: "Exames Complementares", component: ExamesComplementares },
  { id: "exame-fisico", label: "Exame Físico", component: ExameFisico },
  { id: "nexo", label: "Nexo Causal", component: NexoCausal },
  { id: "conclusao", label: "Conclusão", component: Conclusao },
  { id: "sequelas", label: "Avaliação de Sequelas", component: AvaliacaoSequelas },
  { id: "quesitos", label: "Quesitos", component: Quesitos },
];

export default function LaudoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentLaudo, loadLaudo, saveLaudo } = useLaudo();
  const [activeSection, setActiveSection] = useState("perito");

  useEffect(() => {
    if (id) {
      loadLaudo(id);
    }
  }, [id]);

  const handleSave = () => {
    saveLaudo();
  };

  const handlePrint = () => {
    window.print();
  };

  const ActiveComponent = sections.find((s) => s.id === activeSection)?.component || DadosPerito;

  if (!currentLaudo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Carregando laudo...</h2>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <LaudoSidebar
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header className="border-b bg-card px-6 py-4 print:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <SidebarTrigger />
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <div className="border-l pl-4">
                  <h1 className="text-lg font-semibold">{currentLaudo.title}</h1>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Gerar PDF
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-4xl">
              <ActiveComponent />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
