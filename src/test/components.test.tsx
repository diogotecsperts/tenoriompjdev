import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

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
});
