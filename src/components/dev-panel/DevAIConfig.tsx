import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, Zap, Globe, Lock } from "lucide-react";

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: string[];
  requiresKey: boolean;
  color: string;
}

const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: "lovable",
    name: "Lovable AI",
    description: "Gateway integrado com acesso a modelos Gemini e GPT sem necessidade de API key externa.",
    models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5", "openai/gpt-5-mini"],
    requiresKey: false,
    color: "hsl(168, 58%, 39%)",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Acesso direto aos modelos da OpenAI como GPT-4o e série o1.",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
    requiresKey: true,
    color: "hsl(160, 84%, 39%)",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Modelos Gemini diretamente da API do Google AI Studio.",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    requiresKey: true,
    color: "hsl(217, 91%, 60%)",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    description: "Modelos Claude com foco em segurança e raciocínio avançado.",
    models: ["claude-3.5-sonnet", "claude-3.5-haiku"],
    requiresKey: true,
    color: "hsl(25, 95%, 53%)",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Inferência ultra-rápida com modelos open-source otimizados.",
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    requiresKey: true,
    color: "hsl(280, 87%, 65%)",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Modelos chineses de alta qualidade com preços competitivos.",
    models: ["deepseek-chat", "deepseek-coder"],
    requiresKey: true,
    color: "hsl(200, 95%, 48%)",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Gateway unificado com acesso a múltiplos providers e modelos.",
    models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-pro"],
    requiresKey: true,
    color: "hsl(340, 82%, 52%)",
  },
];

export function DevAIConfig() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">IA & Modelos</h1>
        <p className="text-muted-foreground mt-1">
          Visão geral dos providers de IA disponíveis no sistema
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {AI_PROVIDERS.map((provider) => (
          <Card key={provider.id} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={{ backgroundColor: provider.color }}
            />
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{provider.name}</CardTitle>
                {provider.requiresKey ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Zap className="h-4 w-4 text-primary" />
                )}
              </div>
              <CardDescription>{provider.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Modelos:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {provider.models.map((model) => (
                    <Badge key={model} variant="secondary" className="text-xs">
                      {model}
                    </Badge>
                  ))}
                </div>
                <div className="pt-2">
                  <Badge variant={provider.requiresKey ? "outline" : "default"}>
                    {provider.requiresKey ? "Requer API Key" : "Integrado"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <strong>Lovable AI</strong> é o provider padrão e não requer configuração adicional.
              Usa o gateway integrado para acessar modelos Gemini e GPT.
            </li>
            <li>
              Providers externos requerem uma <strong>API key</strong> que pode ser configurada
              por usuário ou globalmente no sistema.
            </li>
            <li>
              As configurações de IA de cada usuário podem ser ajustadas na aba
              <strong> Usuários</strong>, clicando no botão de configurações.
            </li>
            <li>
              O sistema registra todas as requisições de IA na tabela de logs,
              permitindo análise de uso e custos.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
