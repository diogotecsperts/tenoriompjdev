import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Lancamento } from "@/pages/Financeiro";

interface NovoLancamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lancamento: Lancamento | null;
  laudos: Array<{
    id: string;
    title: string;
    processoNumero?: string;
    reclamante?: string;
  }>;
}

interface FormData {
  descricao: string;
  laudo_id: string;
  valor_honorarios: string;
  valor_despesas: string;
  tipo_despesa: string;
  data_vencimento: string;
  data_pagamento: string;
  status: string;
  forma_pagamento: string;
  observacoes: string;
}

const tiposDespesa = [
  { value: "combustivel", label: "Combustível" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "material", label: "Material" },
  { value: "transporte", label: "Transporte" },
  { value: "outros", label: "Outros" },
];

const statusOptions = [
  { value: "pendente", label: "Pendente" },
  { value: "recebido", label: "Recebido" },
  { value: "atrasado", label: "Atrasado" },
  { value: "cancelado", label: "Cancelado" },
];

const formasPagamento = [
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
];

export function NovoLancamentoDialog({ 
  open, 
  onOpenChange, 
  lancamento, 
  laudos 
}: NovoLancamentoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!lancamento;

  const form = useForm<FormData>({
    defaultValues: {
      descricao: "",
      laudo_id: "",
      valor_honorarios: "",
      valor_despesas: "",
      tipo_despesa: "",
      data_vencimento: "",
      data_pagamento: "",
      status: "pendente",
      forma_pagamento: "",
      observacoes: "",
    },
  });

  // Reset form when dialog opens/closes or lancamento changes
  useEffect(() => {
    if (open) {
      if (lancamento) {
        form.reset({
          descricao: lancamento.descricao || "",
          laudo_id: lancamento.laudo_id || "",
          valor_honorarios: lancamento.valor_honorarios?.toString() || "",
          valor_despesas: lancamento.valor_despesas?.toString() || "",
          tipo_despesa: lancamento.tipo_despesa || "",
          data_vencimento: lancamento.data_vencimento || "",
          data_pagamento: lancamento.data_pagamento || "",
          status: lancamento.status || "pendente",
          forma_pagamento: lancamento.forma_pagamento || "",
          observacoes: lancamento.observacoes || "",
        });
      } else {
        form.reset({
          descricao: "",
          laudo_id: "",
          valor_honorarios: "",
          valor_despesas: "",
          tipo_despesa: "",
          data_vencimento: "",
          data_pagamento: "",
          status: "pendente",
          forma_pagamento: "",
          observacoes: "",
        });
      }
    }
  }, [open, lancamento, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record<string, unknown> = {
        user_id: user?.id,
        descricao: data.descricao,
        laudo_id: data.laudo_id && data.laudo_id !== "_none" ? data.laudo_id : null,
        valor_honorarios: parseFloat(data.valor_honorarios) || 0,
        valor_despesas: parseFloat(data.valor_despesas) || 0,
        tipo_despesa: data.tipo_despesa && data.tipo_despesa !== "_none" ? data.tipo_despesa : null,
        data_vencimento: data.data_vencimento || null,
        data_pagamento: data.data_pagamento || null,
        status: data.status || "pendente",
        forma_pagamento: data.forma_pagamento && data.forma_pagamento !== "_none" ? data.forma_pagamento : null,
        observacoes: data.observacoes || "",
      };

      if (isEditing) {
        const { error } = await supabase
          .from("financeiro")
          .update(payload as never)
          .eq("id", lancamento.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financeiro")
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success(isEditing ? "Lançamento atualizado!" : "Lançamento criado!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error saving lancamento:", error);
      toast.error("Erro ao salvar lançamento");
    },
  });

  const onSubmit = (data: FormData) => {
    if (!data.descricao.trim()) {
      toast.error("A descrição é obrigatória");
      return;
    }
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Lançamento" : "Novo Lançamento"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Descrição */}
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Honorários Perícia João Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Laudo associado */}
            <FormField
              control={form.control}
              name="laudo_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Laudo Associado</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um laudo (opcional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {laudos.map((laudo) => (
                        <SelectItem key={laudo.id} value={laudo.id}>
                          {laudo.processoNumero || laudo.title} 
                          {laudo.reclamante && ` - ${laudo.reclamante}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Valores */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="valor_honorarios"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Honorários (R$)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        placeholder="0,00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor_despesas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Despesas (R$)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        placeholder="0,00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tipo de despesa */}
            <FormField
              control={form.control}
              name="tipo_despesa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Despesa</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione (se aplicável)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {tiposDespesa.map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Datas */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="data_vencimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Vencimento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_pagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Pagamento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status e Forma de pagamento */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="forma_pagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma</SelectItem>
                        {formasPagamento.map((forma) => (
                          <SelectItem key={forma.value} value={forma.value}>
                            {forma.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Observações */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Observações adicionais..."
                      className="resize-none"
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
