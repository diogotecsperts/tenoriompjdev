import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle,
  File
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ImportarAutosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "success" | "error";
  progress: number;
}

export function ImportarAutosDialog({ open, onOpenChange }: ImportarAutosDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const simulateUpload = (file: File) => {
    const uploadedFile: UploadedFile = {
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: "uploading",
      progress: 0,
    };

    setFiles((prev) => [...prev, uploadedFile]);

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id
              ? { ...f, progress: 100, status: "success" }
              : f
          )
        );
      } else {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id ? { ...f, progress } : f
          )
        );
      }
    }, 200);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(
      (file) => file.type === "application/pdf"
    );

    if (pdfFiles.length !== droppedFiles.length) {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Apenas arquivos PDF são aceitos.",
      });
    }

    pdfFiles.forEach(simulateUpload);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(
      (file) => file.type === "application/pdf"
    );

    if (pdfFiles.length !== selectedFiles.length) {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Apenas arquivos PDF são aceitos.",
      });
    }

    pdfFiles.forEach(simulateUpload);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClose = () => {
    setFiles([]);
    onOpenChange(false);
  };

  const handleProcessFiles = () => {
    const successFiles = files.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum arquivo",
        description: "Faça upload de pelo menos um arquivo PDF.",
      });
      return;
    }

    toast({
      title: "Processamento iniciado",
      description: `${successFiles.length} arquivo(s) serão processados.`,
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Autos do Processo
          </DialogTitle>
          <DialogDescription>
            Faça upload dos arquivos PDF do processo para extrair informações automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          )}
        >
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center transition-colors",
              isDragging ? "bg-primary/20" : "bg-muted"
            )}>
              <Upload className={cn(
                "h-6 w-6 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Arraste arquivos PDF aqui
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                ou clique para selecionar
              </p>
            </div>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                    {file.status === "uploading" && (
                      <Progress value={file.progress} className="h-1 flex-1" />
                    )}
                    {file.status === "success" && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Pronto
                      </span>
                    )}
                    {file.status === "error" && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Erro
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => removeFile(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleProcessFiles}
            disabled={files.filter(f => f.status === "success").length === 0}
          >
            <File className="mr-2 h-4 w-4" />
            Processar {files.filter(f => f.status === "success").length > 0 && 
              `(${files.filter(f => f.status === "success").length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
