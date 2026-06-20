import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Progresso simulado calibrado pelas 3 fases reais do prev-pre-processar:
 *  - 0  → 35%  em ~8s   (OCR Mistral)
 *  - 35 → 75%  em ~10s  (extração IA estruturada)
 *  - 75 → 95%  em ~5s   (queixa unificada)
 *  - trava em 95% até finish() ser chamado → 100% por 400ms → 0.
 *
 * Não tenta refletir progresso real do backend (a edge function não faz
 * stream); só dá feedback visual honesto baseado em tempo médio observado.
 */
export function useFakeProgress(active: boolean) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const finishingRef = useRef(false);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const computeTarget = (elapsedMs: number): number => {
    // fases em ms
    const P1 = 8000;   // 0 → 35
    const P2 = 10000;  // 35 → 75
    const P3 = 5000;   // 75 → 95
    if (elapsedMs <= P1) return (elapsedMs / P1) * 35;
    if (elapsedMs <= P1 + P2) return 35 + ((elapsedMs - P1) / P2) * 40;
    if (elapsedMs <= P1 + P2 + P3) return 75 + ((elapsedMs - P1 - P2) / P3) * 20;
    return 95;
  };

  useEffect(() => {
    if (active) {
      finishingRef.current = false;
      startRef.current = Date.now();
      setProgress(0);
      clearTimer();
      intervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startRef.current;
        const target = Math.min(95, computeTarget(elapsed));
        setProgress((curr) => {
          const next = curr + (target - curr) * 0.18;
          return Math.min(95, Math.round(next * 10) / 10);
        });
      }, 200);
    } else if (!finishingRef.current) {
      clearTimer();
      setProgress(0);
    }
    return () => {
      // não limpa em re-render normal; só em unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => clearTimer(), []);

  const finish = useCallback(() => {
    finishingRef.current = true;
    clearTimer();
    setProgress(100);
    window.setTimeout(() => {
      setProgress(0);
      finishingRef.current = false;
    }, 400);
  }, []);

  return { progress: Math.round(progress), finish };
}
