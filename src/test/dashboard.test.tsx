import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar } from "@/components/dashboard/FilterBar";

describe("Smoke Tests - FilterBar", () => {
  const defaultFilters = {
    searchText: "",
    vitimaName: "",
    dataAcidenteStart: "",
    dataAcidenteEnd: "",
    dataPericiaStart: "",
    dataPericiaEnd: "",
    processoNumero: "",
    reclamante: "",
  };

  const mockOnFiltersChange = vi.fn();

  it("FilterBar renderiza campo de busca", () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
        resultCount={10}
      />
    );
    
    const searchInput = screen.getByPlaceholderText(/buscar/i);
    expect(searchInput).toBeInTheDocument();
  });

  it("FilterBar renderiza botão de filtros", () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
        resultCount={5}
      />
    );
    
    const filterButton = screen.getByRole("button", { name: /filtros/i });
    expect(filterButton).toBeInTheDocument();
  });

  it("FilterBar exibe contagem de resultados quando há filtros ativos", () => {
    const activeFilters = {
      ...defaultFilters,
      searchText: "teste",
    };
    
    render(
      <FilterBar
        filters={activeFilters}
        onFiltersChange={mockOnFiltersChange}
        resultCount={3}
      />
    );
    
    expect(screen.getByText(/3 laudos encontrados/i)).toBeInTheDocument();
  });

  it("FilterBar exibe botão limpar quando há filtros ativos", () => {
    const activeFilters = {
      ...defaultFilters,
      vitimaName: "João",
    };
    
    render(
      <FilterBar
        filters={activeFilters}
        onFiltersChange={mockOnFiltersChange}
        resultCount={1}
      />
    );
    
    const clearButton = screen.getByRole("button", { name: /limpar/i });
    expect(clearButton).toBeInTheDocument();
  });
});
