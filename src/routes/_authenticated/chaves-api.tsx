import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Ban, Copy, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase, useInvalidate, usePerms } from "@/lib/frotagov";
import { issueApiKey } from "@/lib/platform.functions";
import { useApiKeys } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/chaves-api")({
  head: () => ({
    meta: [
      { title: "Chaves de API — FrotaGov" },
      {
        name: "description",
        content:
          "Emita e revogue chaves de integração por órgão para consumir a API versionada do FrotaGov com escopos de leitura controlados.",
      },
      { property: "og:title", content: "Chaves de API — FrotaGov" },
      {
        property: "og:description",
        content: "Integrações seguras com chaves por órgão e escopos controlados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChavesApi,
});

const SCOPES = [
  { value: "frota:read", label: "Frota", description: "Veículos, equipamentos e condutores." },
  {
    value: "abastecimento:read",
    label: "Abastecimento",
    description: "Abastecimentos e autorizações.",
  },
  { value: "contratos:read", label: "Contratos", description: "Contratos, itens e empenhos." },
  { value: "manutencao:read", label: "Manutenção", description: "Manutenções, OS, peças e pneus." },
  { value: "almoxarifado:read", label: "Almoxarifado", description: "OFP e saldos de estoque." },
  {
    value: "legal:read",
    label: "Legal / obrigações",
    description: "Multas, sinistros, seguros e obrigações.",
  },
  {
    value: "*",
    label: "Todos os recursos",
    description: "Leitura de todos os recursos publicados pela API.",
  },
] as const;

const scopeLabel = (value: string) => SCOPES.find((scope) => scope.value === value)?.label ?? value;

function ChavesApi() {
  const { data: keys = [], isLoading } = useApiKeys();
  const perms = usePerms();
  const invalidate = useInvalidate();
  const canManage =
    Boolean(perms.orgId) &&
    (perms.roles.includes("org_admin") || perms.roles.includes("super_admin"));

  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["frota:read"]);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  function openNew() {
    setScopes(["frota:read"]);
    setOpen(true);
  }

  function toggleScope(value: string, checked: boolean) {
    if (value === "*") {
      setScopes(checked ? ["*"] : []);
      return;
    }

    setScopes((current) => {
      const withoutAll = current.filter((scope) => scope !== "*");
      if (checked) return Array.from(new Set([...withoutAll, value]));
      return withoutAll.filter((scope) => scope !== value);
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const expiresAt = String(form.get("expires_at") || "");

    if (name.length < 3) {
      toast.error("Informe um nome para a chave.");
      return;
    }

    if (scopes.length === 0) {
      toast.error("Selecione ao menos um escopo.");
      return;
    }

    setSaving(true);
    try {
      const result = await issueApiKey({ data: { name, scopes, expiresAt: expiresAt || null } });
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
        description="Integrações do órgão com a API versionada /api/public/v1, com escopos de leitura independentes e revogação a qualquer momento."
        action={
          canManage ? (
            <Button onClick={openNew}>
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
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
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
                <TableCell>
                  <div className="flex max-w-xl flex-wrap gap-1">
                    {k.scopes.map((scope) => (
                      <Badge key={scope} variant="outline">
                        {scopeLabel(scope)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {k.expires_at
                    ? new Date(k.expires_at).toLocaleDateString("pt-BR")
                    : "Indeterminada"}
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
        Use o cabeçalho <span className="font-mono">x-api-key</span> nas requisições a{" "}
        <span className="font-mono">/api/public/v1/frota</span> ou{" "}
        <span className="font-mono">/api/public/v1/recursos/&lt;recurso&gt;</span>. A chave completa
        é exibida uma única vez no momento da emissão.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome / finalidade *</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Integração Portal do Município"
              />
            </div>

            <div className="space-y-2">
              <Label>Escopos de leitura *</Label>
              <div className="space-y-2 rounded-md border p-3">
                {SCOPES.map((scope) => {
                  const checked = scopes.includes(scope.value);
                  const disabled = scope.value !== "*" && scopes.includes("*");

                  return (
                    <div key={scope.value} className="flex items-start gap-3">
                      <Checkbox
                        id={`scope-${scope.value}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(value) => toggleScope(scope.value, value === true)}
                      />
                      <div className="grid gap-0.5">
                        <Label
                          htmlFor={`scope-${scope.value}`}
                          className="cursor-pointer font-medium"
                        >
                          {scope.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {scope.description} <span className="font-mono">({scope.value})</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Conceda somente os módulos necessários à integração. “Todos os recursos” substitui
                os demais escopos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expires_at">Validade</Label>
              <Input
                id="expires_at"
                name="expires_at"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Emitindo..." : "Emitir chave"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <KeyRound className="size-4" /> Chave emitida
              </span>
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
              aria-label="Copiar chave"
              onClick={() => {
                if (issued) void navigator.clipboard.writeText(issued);
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
