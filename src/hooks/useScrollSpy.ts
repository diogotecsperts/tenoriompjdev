import { useState, useEffect, useRef, useCallback } from "react";

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  enabled?: boolean;
}

export function useScrollSpy({ sectionIds, offset = 100, enabled = true }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || "");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      observerRef.current?.disconnect();
      return;
    }

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      // Ignore observer updates during programmatic scroll
      if (isScrollingRef.current) return;

      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      
      if (visibleEntries.length > 0) {
        const mostVisible = visibleEntries.reduce((prev, current) => 
          current.intersectionRatio > prev.intersectionRatio ? current : prev
        );
        setActiveId(prev => prev !== mostVisible.target.id ? mostVisible.target.id : prev);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin: `-${offset}px 0px -50% 0px`,
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });

    sectionIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [sectionIds, offset, enabled]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Block observer detection during smooth scroll animation
      isScrollingRef.current = true;
      
      // Update activeId immediately before scroll
      setActiveId(id);
      
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      
      // Unblock after animation completes (~500ms)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 500);
    }
  }, []);

  return { activeId, setActiveId, scrollToSection };
}
