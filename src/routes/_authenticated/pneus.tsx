import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CircleDot, History, Pencil, Plus, Replace } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  TIRE_POSITIONS,
  TIRE_STATUS,
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  label,
  num,
  parseBRNumber,
  supabase,
  useInvalidate,
  usePerms,
  useSuppliers,
  useTireMovements,
  useTires,
  useVehicles,
  type TireRow,
  type TireStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/pneus")({
  head: () => ({
    meta: [
      { title: "Pneus — FrotaGov" },
      {
        name: "description",
        content:
          "Controle individual de pneus por código: marca, medida, DOT, vida útil, situação, veículo e posição, com histórico completo de movimentações.",
      },
      { property: "og:title", content: "Pneus — FrotaGov" },
      { property: "og:description", content: "Gestão individualizada de pneus da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pneus,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  code: z.string().trim().min(1, "Informe o código do pneu").max(40),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  size: z.string().trim().max(40).optional(),
  dot: z.string().trim().max(20).optional(),
  serial_number: z.string().trim().max(60).optional(),
  purchase_date: z.string().optional(),
  purchase_value: z.string().optional(),
  expected_life_km: z.string().optional(),
  warranty_until: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  instalado: "default",
  estoque: "secondary",
  em_reparo: "outline",
  recapagem: "outline",
  descartado: "destructive",
  baixado: "destructive",
};

function Pneus() {
  const { data: tires = [], isLoading } = useTires();
  const { data: vehicles = [] } = useVehicles();
  const { data: suppliers = [] } = useSuppliers();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TireRow | null>(null);
  const [supplierId, setSupplierId] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState<TireRow | null>(null);
  const [moveStatus, setMoveStatus] = useState<TireStatus>("instalado");
  const [moveVehicle, setMoveVehicle] = useState(NONE);
  const [movePosition, setMovePosition] = useState(TIRE_POSITIONS[0]!);

  const [histOpen, setHistOpen] = useState(false);
  const [histTire, setHistTire] = useState<TireRow | null>(null);
  const { data: movements = [] } = useTireMovements(histTire?.id ?? null);

  const [fStatus, setFStatus] = useState(ALL);
  const [fVehicle, setFVehicle] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      tires.filter((t) => {
        if (fStatus !== ALL && t.status !== fStatus) return false;
        if (fVehicle !== ALL && t.vehicle_id !== fVehicle) return false;
        const q = search.trim().toLowerCase();
        return !q || `${t.code} ${t.brand ?? ""} ${t.model ?? ""} ${t.size ?? ""} ${t.dot ?? ""}`.toLowerCase().includes(q);
      }),
    [tires, fStatus, fVehicle, search],
  );

  const totals = useMemo(
    () => ({
      total: tires.length,
      instalados: tires.filter((t) => t.status === "instalado").length,
      estoque: tires.filter((t) => t.status === "estoque").length,
      fora: tires.filter((t) => ["descartado", "baixado"].includes(t.status)).length,
    }),
    [tires],
  );

  function openNew() {
    setEditing(null);
    setSupplierId(NONE);
    setOpen(true);
  }

  function openEdit(t: TireRow) {
    setEditing(t);
    setSupplierId(t.supplier_id ?? NONE);
    setOpen(true);
  }

  function openMove(t: TireRow) {
    setMoving(t);
    setMoveStatus(t.status === "instalado" ? "estoque" : "instalado");
    setMoveVehicle(t.vehicle_id ?? NONE);
    setMovePosition(t.position ?? TIRE_POSITIONS[0]!);
    setMoveOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    const payload = {
      code: d.code,
      brand: d.brand || null,
      model: d.model || null,
      size: d.size || null,
      dot: d.dot || null,
      serial_number: d.serial_number || null,
      purchase_date: d.purchase_date || null,
      purchase_value: numOrNull(d.purchase_value),
      expected_life_km: numOrNull(d.expected_life_km),
      warranty_until: d.warranty_until || null,
      supplier_id: supplierId === NONE ? null : supplierId,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase.from("tires").update({ ...payload, updated_by: userId }).eq("id", editing.id)
      : await supabase.from("tires").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe um pneu com esse código." : dbMessage(error));
      return;
    }
    toast.success(editing ? "Pneu atualizado." : "Pneu cadastrado.");
    invalidate(["tires"]);
    setOpen(false);
  }

  async function onMove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!moving) return;
    const form = new FormData(e.currentTarget);
    const km = numOrNull(String(form.get("km") ?? ""));
    const reason = String(form.get("reason") ?? "").trim();
    if (moveStatus === "instalado" && moveVehicle === NONE) {
      toast.error("Selecione o veículo para instalar o pneu.");
      return;
    }
    if (moveStatus !== "instalado" && moving.status === "instalado" && !reason) {
      toast.error("Informe o motivo da retirada.");
      return;
    }
    const payload =
      moveStatus === "instalado"
        ? {
            status: moveStatus,
            vehicle_id: moveVehicle,
            position: movePosition,
            install_km: km,
            install_date: new Date().toISOString().slice(0, 10),
            removal_km: null,
            removal_reason: null,
          }
        : {
            status: moveStatus,
            vehicle_id: null,
            position: null,
            removal_km: km,
            removal_reason: reason || null,
          };
    const { error } = await supabase.from("tires").update({ ...payload, updated_by: userId }).eq("id", moving.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Movimentação registrada.");
    invalidate(["tires"]);
    setMoveOpen(false);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Pneus"
        description="Cada pneu é controlado individualmente por código, com posição no veículo e histórico de movimentações."
        action={
          canManageFleet && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo pneu
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Pneus cadastrados", value: String(totals.total) },
          { label: "Instalados", value: String(totals.instalados) },
          { label: "Em estoque", value: String(totals.estoque) },
          { label: "Descartados / baixados", value: String(totals.fora) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Código, marca, medida, DOT" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {TIRE_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Veículo</Label>
          <Select value={fVehicle} onValueChange={setFVehicle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {(v.plate ?? v.asset_code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Marca / modelo</TableHead>
              <TableHead>Medida / DOT</TableHead>
              <TableHead>Veículo / posição</TableHead>
              <TableHead className="text-right">KM acumulado</TableHead>
              <TableHead>Vida útil</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <CircleDot className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum pneu encontrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((t) => {
              const life = Number(t.expected_life_km ?? 0);
              const used = Number(t.accumulated_km ?? 0) + (t.status === "instalado" && t.install_km && t.vehicle?.current_km
                ? Math.max(0, Number(t.vehicle.current_km) - Number(t.install_km))
                : 0);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.code}</TableCell>
                  <TableCell>
                    {t.brand || "—"}
                    <span className="block text-xs text-muted-foreground">{t.model || ""}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.size || "—"}
                    <span className="block text-xs text-muted-foreground">{t.dot ? `DOT ${t.dot}` : ""}</span>
                  </TableCell>
                  <TableCell>
                    {t.vehicle ? t.vehicle.plate : "—"}
                    <span className="block text-xs text-muted-foreground">{t.position ?? ""}</span>
                  </TableCell>
                  <TableCell className="text-right">{num(used, 0)} km</TableCell>
                  <TableCell className="text-sm">
                    {life > 0 ? `${num(life, 0)} km` : "—"}
                    <span className="block text-xs text-muted-foreground">
                      {life > 0 ? `${num((used / life) * 100, 1)}% consumido` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>{label(TIRE_STATUS, t.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Histórico"
                        onClick={() => {
                          setHistTire(t);
                          setHistOpen(true);
                        }}
                      >
                        <History className="size-4" />
                      </Button>
                      {canManageFleet && !["descartado", "baixado"].includes(t.status) && (
                        <Button variant="ghost" size="icon" aria-label="Movimentar" onClick={() => openMove(t)}>
                          <Replace className="size-4" />
                        </Button>
                      )}
                      {canManageFleet && (
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(t)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar pneu ${editing.code}` : "Novo pneu"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="code">Código *</Label>
                <Input id="code" name="code" defaultValue={editing?.code ?? ""} required />
              </div>
              <div>
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand ?? ""} />
              </div>
              <div>
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" name="model" defaultValue={editing?.model ?? ""} />
              </div>
              <div>
                <Label htmlFor="size">Medida</Label>
                <Input id="size" name="size" placeholder="205/55 R16" defaultValue={editing?.size ?? ""} />
              </div>
              <div>
                <Label htmlFor="dot">DOT</Label>
                <Input id="dot" name="dot" defaultValue={editing?.dot ?? ""} />
              </div>
              <div>
                <Label htmlFor="serial_number">Número de série</Label>
                <Input id="serial_number" name="serial_number" defaultValue={editing?.serial_number ?? ""} />
              </div>
              <div>
                <Label htmlFor="purchase_date">Data de aquisição</Label>
                <Input id="purchase_date" name="purchase_date" type="date" defaultValue={editing?.purchase_date ?? ""} />
              </div>
              <div>
                <Label htmlFor="purchase_value">Valor de aquisição (R$)</Label>
                <MoneyInput id="purchase_value" name="purchase_value" defaultValue={editing?.purchase_value ?? ""} />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.trade_name || s.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="expected_life_km">Vida útil prevista (KM)</Label>
                <Input
                  id="expected_life_km"
                  name="expected_life_km"
                  inputMode="numeric"
                  defaultValue={editing?.expected_life_km ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="warranty_until">Garantia até</Label>
                <Input id="warranty_until" name="warranty_until" type="date" defaultValue={editing?.warranty_until ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar pneu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Movimentar pneu {moving?.code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onMove} className="space-y-4">
            <div>
              <Label>Nova situação</Label>
              <Select value={moveStatus} onValueChange={(v) => setMoveStatus(v as TireStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIRE_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {moveStatus === "instalado" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Veículo *</Label>
                  <Select value={moveVehicle} onValueChange={setMoveVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Selecione</SelectItem>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {(v.plate ?? v.asset_code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Posição *</Label>
                  <Select value={movePosition} onValueChange={setMovePosition}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIRE_POSITIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="km">KM do veículo</Label>
              <Input id="km" name="km" inputMode="numeric" />
            </div>
            <div>
              <Label htmlFor="reason">Motivo / observação</Label>
              <Textarea id="reason" name="reason" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMoveOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Registrar movimentação</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico do pneu {histTire?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {histTire && (
              <p className="text-muted-foreground">
                Aquisição: {histTire.purchase_date ? dateBR(histTire.purchase_date) : "—"} ·{" "}
                {histTire.purchase_value ? brl(Number(histTire.purchase_value)) : "valor não informado"}
              </p>
            )}
            {movements.length === 0 && <p className="text-muted-foreground">Nenhuma movimentação registrada.</p>}
            {movements.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <p className="font-medium">
                  {label(TIRE_STATUS, m.to_status)} — {dateTimeBR(m.created_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.from_status ? `De ${label(TIRE_STATUS, m.from_status)} · ` : ""}
                  {m.odometer_km ? `${num(Number(m.odometer_km), 0)} km · ` : ""}
                  {m.reason || "sem observação"}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
