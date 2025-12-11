import { useState, useEffect, useRef, useCallback } from "react";

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  enabled?: boolean;
}

export function useScrollSpy({ sectionIds, offset = 80, enabled = true }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || "");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isManualNavigationRef = useRef(false);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      observerRef.current?.disconnect();
      return;
    }

    // Reset flag on mount
    isManualNavigationRef.current = false;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      // Skip updates only during manual navigation click animation
      if (isManualNavigationRef.current) return;

      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      
      if (visibleEntries.length > 0) {
        const mostVisible = visibleEntries.reduce((prev, current) => 
          current.intersectionRatio > prev.intersectionRatio ? current : prev
        );
        setActiveId(prev => prev !== mostVisible.target.id ? mostVisible.target.id : prev);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin: `-${offset}px 0px -40% 0px`,
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1],
    });

    sectionIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      isManualNavigationRef.current = false;
    };
  }, [sectionIds, offset, enabled]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Block observer updates only during this navigation
      isManualNavigationRef.current = true;
      
      // Update activeId immediately
      setActiveId(id);
      
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      
      // Re-enable observer after scroll animation completes
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      navigationTimeoutRef.current = setTimeout(() => {
        isManualNavigationRef.current = false;
      }, 600);
    }
  }, []);

  return { activeId, setActiveId, scrollToSection };
}
