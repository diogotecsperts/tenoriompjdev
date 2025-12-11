import { useState, useEffect, useRef } from "react";

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  enabled?: boolean;
}

export function useScrollSpy({ sectionIds, offset = 100, enabled = true }: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || "");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      // Find the entry with the highest intersection ratio that is intersecting
      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      
      if (visibleEntries.length > 0) {
        // Sort by intersection ratio and pick the one with highest visibility
        const mostVisible = visibleEntries.reduce((prev, current) => 
          current.intersectionRatio > prev.intersectionRatio ? current : prev
        );
        // Only update if the ID actually changed to prevent unnecessary re-renders
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
    };
  }, [sectionIds, offset, enabled]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return { activeId, setActiveId, scrollToSection };
}
