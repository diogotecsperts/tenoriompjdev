import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";

describe("Smoke Tests - Componentes de Loading", () => {
  it("DashboardSkeleton renderiza elementos de skeleton", () => {
    render(<DashboardSkeleton />);
    
    // Verifica se existem elementos com animação de pulse (skeleton)
    const skeletonElements = document.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });
});

describe("Smoke Tests - Componentes UI Básicos", () => {
  it("Skeleton component funciona corretamente", async () => {
    const { Skeleton } = await import("@/components/ui/skeleton");
    render(<Skeleton className="h-4 w-20" />);
    
    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeTruthy();
  });

  it("Button renderiza com variante default", () => {
    render(<Button>Clique aqui</Button>);
    
    const button = screen.getByRole("button", { name: /clique aqui/i });
    expect(button).toBeInTheDocument();
  });

  it("Button renderiza com variante outline", () => {
    render(<Button variant="outline">Outline</Button>);
    
    const button = screen.getByRole("button", { name: /outline/i });
    expect(button).toBeInTheDocument();
  });

  it("Button renderiza com variante destructive", () => {
    render(<Button variant="destructive">Deletar</Button>);
    
    const button = screen.getByRole("button", { name: /deletar/i });
    expect(button).toBeInTheDocument();
  });

  it("Input renderiza corretamente com placeholder", () => {
    render(<Input placeholder="Digite algo" />);
    
    const input = screen.getByPlaceholderText(/digite algo/i);
    expect(input).toBeInTheDocument();
  });

  it("Input renderiza com tipo password", () => {
    render(<Input type="password" placeholder="Senha" />);
    
    const input = screen.getByPlaceholderText(/senha/i);
    expect(input).toHaveAttribute("type", "password");
  });

  it("Card renderiza estrutura completa", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título do Card</CardTitle>
          <CardDescription>Descrição do card</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Conteúdo do card</p>
        </CardContent>
        <CardFooter>
          <Button>Ação</Button>
        </CardFooter>
      </Card>
    );
    
    expect(screen.getByText("Título do Card")).toBeInTheDocument();
    expect(screen.getByText("Descrição do card")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo do card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ação/i })).toBeInTheDocument();
  });
});

describe("Smoke Tests - ErrorBoundary", () => {
  // Componente auxiliar que lança erro propositalmente
  const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error("Erro de teste");
    }
    return <div>Componente funcionando</div>;
  };

  it("ErrorBoundary renderiza children quando não há erro", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText("Componente funcionando")).toBeInTheDocument();
  });

  it("ErrorBoundary exibe fallback quando há erro", () => {
    // Suprimir console.error para este teste específico
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText("Algo deu errado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recarregar página/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ir para início/i })).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });
});
