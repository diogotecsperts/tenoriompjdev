import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameDialogProps {
  currentTitle: string;
  suggestedTitle?: string;
  onRename: (newTitle: string) => void;
}

export function RenameDialog({ currentTitle, suggestedTitle, onRename }: RenameDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(currentTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== currentTitle) {
      onRename(trimmedTitle);
      setOpen(false);
    }
  };

  const useSuggestion = () => {
    if (suggestedTitle) {
      setTitle(suggestedTitle);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear Laudo</DialogTitle>
            <DialogDescription>
              Escolha um nome mais descritivo para facilitar a organização.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título do Laudo</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Digite o novo título"
                maxLength={100}
                autoFocus
              />
            </div>
            {suggestedTitle && suggestedTitle !== currentTitle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useSuggestion}
                className="w-full"
              >
                Usar sugestão: {suggestedTitle}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || title.trim() === currentTitle}>
              Renomear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
