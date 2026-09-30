import { useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PenLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { documentSignatures, signDocument, type SignDocType } from "@/lib/assinaturas.functions";
import { ROLE_LABELS, dateTimeBR, useInvalidate, usePerms, type AppRole } from "@/lib/frotagov";

/**
 * Botão "Assinaturas" de um documento: mostra quem já assinou (e se o documento continua igual
 * ao que foi assinado) e permite assinar com a própria senha.
 */
export function SignatureButton({
  docType,
  docId,
  title = "documento",
  variant = "outline",
}: {
  docType: SignDocType;
  docId: string;
  title?: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useServerFn(documentSignatures);
  const sign = useServerFn(signDocument);
  const invalidate = useInvalidate();
  const perms = usePerms();

  const q = useQuery({
    queryKey: ["signatures", docType, docId],
    queryFn: () => list({ data: { docType, docId } }),
    enabled: open,
  });
  const signatures = q.data ?? [];
  const alreadySigned = signatures.some(
    (s) => s.signer_name && perms.userName && s.signer_name === perms.userName,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await sign({ data: { docType, docId, password } });
      toast.success(`Assinado. Código de conferência: ${r.code}`);
      setPassword("");
      invalidate(["signatures"]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível assinar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        className="gap-1"
        onClick={() => setOpen(true)}
      >
        <PenLine className="size-4" /> Assinaturas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assinatura eletrônica</DialogTitle>
            <DialogDescription>
              Assinar {title} com a sua senha. Cada assinatura recebe um código que qualquer pessoa
              pode conferir em <strong>/verificar</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!q.isLoading && signatures.length === 0 && (
              <p className="text-sm text-muted-foreground">Ainda não há assinaturas.</p>
            )}
            {signatures.map((s) => (
              <div key={s.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{s.signer_name}</strong>
                  {s.intact ? (
                    <Badge variant="secondary" className="gap-1">
                      <ShieldCheck className="size-3.5" /> Documento íntegro
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <ShieldAlert className="size-3.5" /> Alterado após a assinatura
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {s.signer_role ? (ROLE_LABELS[s.signer_role as AppRole] ?? s.signer_role) : ""} ·{" "}
                  {dateTimeBR(s.signed_at)}
                </p>
                <p className="font-mono text-xs">Código: {s.verification_code}</p>
              </div>
            ))}
          </div>

          {!alreadySigned && (
            <form onSubmit={submit} className="space-y-2 border-t pt-3">
              <Label htmlFor="sig-pass">Confirme a sua senha para assinar</Label>
              <PasswordInput
                id="sig-pass"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
                <Button type="submit" disabled={busy || !password}>
                  Assinar
                </Button>
              </DialogFooter>
            </form>
          )}
          {alreadySigned && (
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
