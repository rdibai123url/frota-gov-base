import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Ban, KeyRound, Plus, Copy } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase, useInvalidate, usePerms } from "@/lib/frotagov";
import { useApiKeys } from "@/lib/platform";
import { issueApiKey } from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/chaves-api")({
  head: () => ({
    meta: [
      { title: "Chaves de API — FrotaGov" },
      {
        name: "description",
        content:
          "Emita e revogue chaves de integração por órgão para consumir a API versionada do FrotaGov com escopo de leitura.",
      },
      { property: "og:title", content: "Chaves de API — FrotaGov" },
      { property: "og:description", content: "Integrações seguras com chaves por órgão e escopos controlados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChavesApi,
});

const SCOPES = [
  { value: "frota:read", label: "Leitura de frota (veículos e indicadores)" },
  { value: "*", label: "Leitura de todos os recursos publicados" },
];

function ChavesApi() {
  const { data: keys = [], isLoading } = useApiKeys();
  const perms = usePerms();
  const invalidate = useInvalidate();
  const canManage =
    Boolean(perms.orgId) && (perms.roles.includes("org_admin") || perms.roles.includes("super_admin"));

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("frota:read");
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const expiresAt = String(form.get("expires_at") || "");
    if (name.length < 3) {
      toast.error("Informe um nome para a chave.");
      return;
    }
    setSaving(true);
    try {
      const result = await issueApiKey({ data: { name, scopes: [scope], expiresAt: expiresAt || null } });
      setOpen(false);
      setIssued(result.key);
      invalidate(["org-api-keys"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível emitir a chave.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("org_api_keys")
      .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user?.id ?? null })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível revogar a chave.");
      return;
    }
    toast.success("Chave revogada.");
    invalidate(["org-api-keys"]);
  }

  const paged = usePaged(keys);
  return (
    <>
      <PageHeader
        title="Chaves de API"
        description="Integrações do órgão com a API versionada /api/public/v1, com escopo de leitura e revogação a qualquer momento."
        action={
          canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nova chave
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Prefixo</TableHead>
              <TableHead>Escopos</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            )}
            {!isLoading && keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma chave emitida.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.prefix}</TableCell>
                <TableCell className="text-sm">{k.scopes.join(", ")}</TableCell>
                <TableCell className="text-sm">
                  {k.expires_at ? new Date(k.expires_at).toLocaleDateString("pt-BR") : "Indeterminada"}
                </TableCell>
                <TableCell>
                  <Badge variant={k.revoked_at ? "outline" : "default"}>
                    {k.revoked_at ? "Revogada" : "Ativa"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && !k.revoked_at && (
                    <Button size="sm" variant="outline" onClick={() => revoke(k.id)}>
                      <Ban className="size-4" /> Revogar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Use o cabeçalho <span className="font-mono">x-api-key</span> nas requisições a
        <span className="font-mono"> /api/public/v1/frota</span>. A chave completa é exibida uma única
        vez no momento da emissão.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome / finalidade *</Label>
              <Input id="name" name="name" required placeholder="Integração Portal do Município" />
            </div>
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expires_at">Validade</Label>
              <Input id="expires_at" name="expires_at" type="date" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Emitir chave</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2"><KeyRound className="size-4" /> Chave emitida</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Guarde a chave agora: ela não poderá ser exibida novamente.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={issued ?? ""} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (issued) navigator.clipboard.writeText(issued);
                toast.success("Chave copiada.");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
