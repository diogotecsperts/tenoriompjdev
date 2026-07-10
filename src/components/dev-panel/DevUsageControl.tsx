import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BarChart3, Scale, ShieldCheck } from "lucide-react";
import { PrevUsagePanel } from "./usage/PrevUsagePanel";

export function DevUsageControl() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Controle de uso
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Monitore quantos processos cada usuário criou, enviou e processou.
            Espelho da tela do usuário, com acesso direto aos arquivos.
          </p>
        </CardHeader>
      </Card>

      <Tabs defaultValue="previdenciario" className="w-full">
        <TabsList>
          <TabsTrigger value="previdenciario" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Previdenciário
          </TabsTrigger>
          <TabsTrigger value="trabalhista" className="gap-2">
            <Scale className="h-4 w-4" /> Trabalhista
          </TabsTrigger>
        </TabsList>
        <TabsContent value="previdenciario" className="mt-4">
          <PrevUsagePanel />
        </TabsContent>
        <TabsContent value="trabalhista" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium">Controle de uso — Trabalhista</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Em breve. A mesma estrutura da aba Previdenciário será replicada
                aqui.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
