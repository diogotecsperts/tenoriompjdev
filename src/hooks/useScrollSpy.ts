import { useState, useEffect, useRef, useCallback, RefObject } from "react";

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  enabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

/**
 * Finds the element closest to the offset position using getBoundingClientRect
 * Based on Mantine's useScrollSpy implementation
 */
function getActiveElement(
  rects: DOMRect[],
  ids: string[],
  offset: number
): string {
  if (rects.length === 0 || ids.length === 0) {
    return ids[0] || "";
  }

  // Find element whose top is closest to the offset
  const closest = rects.reduce(
    (acc, rect, index) => {
      const distance = Math.abs(rect.top - offset);
      if (distance < acc.distance) {
        return { index, distance };
      }
      return acc;
    },
    { index: 0, distance: Math.abs(rects[0].top - offset) }
  );

  return ids[closest.index];
}

export function useScrollSpy({ sectionIds, offset = 80, enabled = true, scrollContainerRef }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || "");
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Use the provided container or fallback to window
    const scrollContainer = scrollContainerRef?.current || window;

    const handleScroll = () => {
      // Ignore during programmatic navigation
      if (isScrollingRef.current) return;

      const rects = sectionIds
        .map(id => document.getElementById(id)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => rect !== undefined);

      if (rects.length === 0) return;

      const newActiveId = getActiveElement(rects, sectionIds, offset);
      
      // Only update if changed
      setActiveId(prev => prev !== newActiveId ? newActiveId : prev);
    };

    // Run once on mount to set initial state
    handleScroll();

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [sectionIds, offset, enabled, scrollContainerRef]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Block detection during animation
      isScrollingRef.current = true;
      
      // Update state immediately
      setActiveId(id);
      
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      
      // Re-enable after animation (~600ms)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    }
  }, []);

  return { activeId, setActiveId, scrollToSection };
}
