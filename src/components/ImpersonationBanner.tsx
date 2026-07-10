import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { VenetianMask, LogOut } from "lucide-react";

/**
 * Banner fixo exibido no topo do app quando a aba atual está em modo
 * impersonation (dev entrou como cliente). Deixa visualmente óbvio
 * para o dev que ele NÃO é o cliente, e oferece encerrar a sessão.
 *
 * Renderiza null quando não há impersonation ativa — zero impacto para
 * o usuário final normal.
 */
export function ImpersonationBanner() {
  const { isImpersonating, impersonatedBy, profile, logout } = useAuth();
  if (!isImpersonating || !impersonatedBy) return null;

  return (
    <div className="w-full bg-amber-500 text-amber-950 border-b border-amber-600 shadow-sm">
      <div className="max-w-full px-4 py-2 flex items-center gap-3 text-sm">
        <VenetianMask className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">Sessão de dev ativa:</span>{" "}
          <span>
            {impersonatedBy.byName} entrou como{" "}
            <strong>{profile?.nome ?? "usuário"}</strong>. Esta aba está
            isolada — sua conta original permanece aberta em outra aba.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-white hover:bg-amber-50 border-amber-700 text-amber-900 h-7"
          onClick={() => logout()}
        >
          <LogOut className="h-3.5 w-3.5 mr-1.5" />
          Encerrar sessão
        </Button>
      </div>
    </div>
  );
}
