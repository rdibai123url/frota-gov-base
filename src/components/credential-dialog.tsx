import { toast } from "sonner";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CredentialDialog({
  credential,
  onClose,
}: {
  credential: { email: string; tempPassword: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!credential} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acesso criado</DialogTitle>
        </DialogHeader>
        {credential && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Entregue estes dados ao usuário por canal seguro. A senha temporária é exibida apenas
              agora e deve ser trocada no primeiro acesso.
            </p>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input readOnly value={credential.email} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha temporária</Label>
              <div className="flex gap-2">
                <Input readOnly value={credential.tempPassword} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(credential.tempPassword);
                    toast.success("Senha copiada.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
