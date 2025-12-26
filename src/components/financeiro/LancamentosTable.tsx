import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Lancamento } from "@/pages/Financeiro";

interface LancamentosTableProps {
  lancamentos: Lancamento[];
  onEdit: (lancamento: Lancamento) => void;
  onDelete: (id: string) => void;
}

const statusConfig = {
  pendente: { label: "Pendente", variant: "secondary" as const },
  recebido: { label: "Recebido", variant: "default" as const },
  atrasado: { label: "Atrasado", variant: "destructive" as const },
  cancelado: { label: "Cancelado", variant: "outline" as const },
};

export function LancamentosTable({ lancamentos, onEdit, onDelete }: LancamentosTableProps) {
  const navigate = useNavigate();

  if (lancamentos.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">Nenhum lançamento encontrado</h3>
        <p className="text-muted-foreground">Crie um novo lançamento para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Processo</TableHead>
            <TableHead className="text-right">Honorários</TableHead>
            <TableHead className="text-right">Despesas</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((lancamento) => {
            const status = statusConfig[lancamento.status as keyof typeof statusConfig] || statusConfig.pendente;
            
            return (
              <TableRow key={lancamento.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{lancamento.descricao}</p>
                    {lancamento.laudo?.reclamante && (
                      <p className="text-sm text-muted-foreground">{lancamento.laudo.reclamante}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {lancamento.laudo?.processo_numero ? (
                    <button
                      onClick={() => navigate(`/laudo/${lancamento.laudo_id}`)}
                      className="text-primary hover:underline text-sm"
                    >
                      {lancamento.laudo.processo_numero}
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-emerald-600">
                  {Number(lancamento.valor_honorarios) > 0 
                    ? `R$ ${Number(lancamento.valor_honorarios).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : "-"
                  }
                </TableCell>
                <TableCell className="text-right font-medium text-destructive">
                  {Number(lancamento.valor_despesas) > 0 
                    ? `R$ ${Number(lancamento.valor_despesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : "-"
                  }
                </TableCell>
                <TableCell>
                  {lancamento.data_vencimento 
                    ? format(new Date(lancamento.data_vencimento), "dd/MM/yyyy", { locale: ptBR })
                    : "-"
                  }
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(lancamento)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDelete(lancamento.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
