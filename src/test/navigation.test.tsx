import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";

// Wrapper para componentes que precisam de ThemeProvider
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    {children}
  </ThemeProvider>
);

// Wrapper para componentes que precisam de Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("Smoke Tests - ThemeToggle", () => {
  it("ThemeToggle renderiza botão corretamente", () => {
    render(
      <ThemeWrapper>
        <ThemeToggle />
      </ThemeWrapper>
    );
    
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("ThemeToggle contém texto de acessibilidade", () => {
    render(
      <ThemeWrapper>
        <ThemeToggle />
      </ThemeWrapper>
    );
    
    expect(screen.getByText("Alternar tema")).toBeInTheDocument();
  });
});

describe("Smoke Tests - NavLink", () => {
  it("NavLink renderiza como link", () => {
    render(
      <RouterWrapper>
        <NavLink to="/dashboard">Dashboard</NavLink>
      </RouterWrapper>
    );
    
    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toBeInTheDocument();
  });

  it("NavLink possui href correto", () => {
    render(
      <RouterWrapper>
        <NavLink to="/historico">Histórico</NavLink>
      </RouterWrapper>
    );
    
    const link = screen.getByRole("link", { name: /histórico/i });
    expect(link).toHaveAttribute("href", "/historico");
  });

  it("NavLink aceita className customizada", () => {
    render(
      <RouterWrapper>
        <NavLink to="/test" className="custom-class">
          Test Link
        </NavLink>
      </RouterWrapper>
    );
    
    const link = screen.getByRole("link", { name: /test link/i });
    expect(link).toHaveClass("custom-class");
  });
});
