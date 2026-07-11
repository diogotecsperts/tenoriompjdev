import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { createPericia, updatePericia, uploadPericiaPdf } from "../api/pautas";

const MAX_BYTES = 150 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pautaId: string;
  userId: string;
  proximaOrdem: number;
  onDone: () => void;
}

type Row = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
};

function nomeDoArquivo(file: File): string {
  const raw = file.name.replace(/\.pdf$/i, "").trim();
  return raw.slice(0, 120);
}

export function UploadLotePdfsDialog({
  open,
  onOpenChange,
  pautaId,
  userId,
  proximaOrdem,
  onDone,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: File[]) => {
    const accepted: Row[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
        rejected.push(`${f.name}: não é PDF`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        rejected.push(`${f.name}: acima de 150 MB`);
        continue;
      }
      accepted.push({ file: f, status: "pending" });
    }
    if (rejected.length) {
      toast({
        variant: "destructive",
        title: `${rejected.length} arquivo(s) ignorado(s)`,
        description: rejected.slice(0, 4).join("\n"),
      });
    }
    setRows((prev) => [...prev, ...accepted]);
  };

  const removeAt = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setRows([]);
    setRunning(false);
    abortRef.current = false;
  };

  const handleClose = (v: boolean) => {
    if (running) return; // não fechar durante execução
    if (!v) reset();
    onOpenChange(v);
  };

  const start = async () => {
    if (rows.length === 0) return;
    setRunning(true);
    abortRef.current = false;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "uploading" } : r)));
      const row = rows[i];
      try {
        const pericia = await createPericia({
          pauta_id: pautaId,
          user_id: userId,
          ordem: proximaOrdem + i,
          periciado_nome: nomeDoArquivo(row.file),
        });
        const path = await uploadPericiaPdf(userId, pericia.id, row.file);
        await updatePericia(pericia.id, { pdf_path: path, pdf_processado: false });
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "done" } : r)));
        ok++;
      } catch (err: any) {
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", errorMsg: err?.message || "Falha no upload" }
              : r,
          ),
        );
        fail++;
      }
    }
    setRunning(false);
    toast({
      title: "Upload em lote concluído",
      description: `${ok} enviado(s)${fail ? ` · ${fail} falha(s)` : ""}.`,
      variant: fail && ok === 0 ? "destructive" : "default",
    });
    onDone();
    if (fail === 0) {
      // fecha automaticamente se tudo ok
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 800);
    }
  };

  const totalMb = rows.reduce((s, r) => s + r.file.size, 0) / (1024 * 1024);
  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const progressPct =
    rows.length === 0 ? 0 : Math.round(((doneCount + errorCount) / rows.length) * 100);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload em lote</DialogTitle>
          <DialogDescription>
            Envie vários PDFs de uma vez. Cada arquivo cria uma perícia (aguardando processamento).
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (running) return;
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) addFiles(files);
          }}
          className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-foreground">
            Arraste PDFs aqui ou{" "}
            <button
              type="button"
              className="text-primary underline"
              disabled={running}
              onClick={() => inputRef.current?.click()}
            >
              selecione do computador
            </button>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Somente PDF · máx. 150 MB por arquivo
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) addFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1 border rounded-md p-2">
            {rows.map((r, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{r.file.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {(r.file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                {r.status === "pending" && !running && (
                  <button
                    onClick={() => removeAt(idx)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {r.status === "uploading" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                {r.status === "done" && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                )}
                {r.status === "error" && (
                  <span title={r.errorMsg} className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {rows.length} arquivo(s) · {totalMb.toFixed(1)} MB no total
              </span>
              {running && (
                <span className="tabular-nums">
                  {doneCount + errorCount}/{rows.length}
                </span>
              )}
            </div>
            {running && <Progress value={progressPct} className="h-1" />}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                abortRef.current = true;
              }}
            >
              Cancelar restante
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Fechar
              </Button>
              <Button onClick={start} disabled={rows.length === 0}>
                <Upload className="h-4 w-4 mr-1.5" />
                Enviar {rows.length > 0 ? `${rows.length} arquivo${rows.length === 1 ? "" : "s"}` : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
