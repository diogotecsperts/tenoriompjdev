import { describe, it, expect } from "vitest";
import { renderWithProviders, screen, waitFor } from "./test-utils";

// Páginas públicas (não requerem autenticação)
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

describe("Smoke Tests - Páginas Públicas", () => {
  it("Login renderiza corretamente", async () => {
    renderWithProviders(<Login />);
    
    await waitFor(() => {
      // Verifica se elementos básicos do login estão presentes
      expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
    });
  });

  it("NotFound renderiza corretamente", () => {
    renderWithProviders(<NotFound />);
    
    // Verifica se o 404 está presente
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
