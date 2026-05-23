import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useLaudoPrev } from "@/contexts/previdenciario/LaudoPrevidenciarioContext";

export default function NewPrevidenciarioLaudo() {
  const navigate = useNavigate();
  const { createLaudo } = useLaudoPrev();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const id = await createLaudo();
      if (id) {
        navigate(`/previdenciario/laudo/${id}`, { replace: true });
      } else {
        navigate("/previdenciario", { replace: true });
      }
    })();
  }, [createLaudo, navigate]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Criando novo laudo previdenciário…
      </div>
    </div>
  );
}
