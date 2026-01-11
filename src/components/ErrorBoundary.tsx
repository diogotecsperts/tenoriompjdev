import React, { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logErrorToDatabase } from "@/utils/errorLogger";
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

// Função segura para verificar ambiente dev (Vite)
const isDev = (): boolean => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });

    // Enviar para o banco de dados
    logErrorToDatabase({
      error_type: 'boundary',
      error_message: error.message || error.toString(),
      error_stack: error.stack,
      component_stack: errorInfo.componentStack || undefined,
      metadata: { name: error.name }
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleCopyError = async () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Error: ${error?.toString() || "Unknown error"}`,
      `Stack: ${error?.stack || "No stack trace"}`,
      `Component Stack: ${errorInfo?.componentStack || "No component stack"}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      console.error("Failed to copy error details");
    }
  };

  render() {
    if (this.state.hasError) {
      const showDevDetails = isDev() && this.state.error;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Algo deu errado</CardTitle>
              <CardDescription>
                Ocorreu um erro inesperado. Por favor, tente recarregar a página.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {showDevDetails && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-destructive text-xs">Detalhes do erro (dev)</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={this.handleCopyError}
                    >
                      {this.state.copied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <p className="font-medium text-destructive break-words">
                    {this.state.error?.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="mt-2 max-h-32 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={this.handleReload} className="flex-1">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recarregar Página
                </Button>
                <Button variant="outline" onClick={this.handleGoHome} className="flex-1">
                  <Home className="mr-2 h-4 w-4" />
                  Ir para Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
