import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Landmark, Paperclip, Plus, Printer, Upload } from "lucide-react";
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
  ASSET_MOVEMENT_KINDS,
  CONDITION_STATES,
  DISPOSAL_KINDS,
  EXTERNAL_KINDS,
  VEHICLE_STATUS,
  brl,
  dateBR,
  dbMessage,
  label,
  num,
  openFleetFile,
  parseBRNumber,
  supabase,
  uploadFleetFile,
  useAssetMovements,
  useExternalEntities,
  useInvalidate,
  useOrganization,
  usePerms,
  useUnits,
  useVehicles,
  type AssetMovementKind,
  type AssetMovementRow,
} from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

type VehicleStatus = Database["public"]["Enums"]["vehicle_status"];

export const Route = createFileRoute("/_authenticated/patrimonio")({
  head: () => ({
    meta: [
      { title: "Movimentação Patrimonial — FrotaGov" },
      {
        name: "description",
        content:
          "Cessões, locações, remanejamentos, doações, leilões, alienações e baixas dos veículos do órgão, com termo imprimível e histórico.",
      },
      { property: "og:title", content: "Movimentação Patrimonial — FrotaGov" },
      { property: "og:description", content: "Controle patrimonial dos veículos públicos com rastreabilidade total." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Patrimonio,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  moved_on: z.string().min(1, "Informe a data da movimentação"),
  reason: z.string().trim().min(3, "Informe o motivo").max(600),
  owner_name: z.string().trim().max(160).optional(),
  holder_name: z.string().trim().max(160).optional(),
  odometer_km: z.string().optional(),
  hour_meter: z.string().optional(),
  book_value: z.string().optional(),
  asset_code: z.string().trim().max(60).optional(),
  act_number: z.string().trim().max(120).optional(),
  act_published_on: z.string().optional(),
  official_gazette: z.string().trim().max(160).optional(),
  auction_number: z.string().trim().max(80).optional(),
  auction_lot: z.string().trim().max(60).optional(),
  auction_value: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

function Patrimonio() {
  const { data: movements = [], isLoading } = useAssetMovements();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: entities = [] } = useExternalEntities();
  const { data: org } = useOrganization();
  const { canRegister, canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [kind, setKind] = useState<AssetMovementKind>("remanejamento");
  const [unitId, setUnitId] = useState(NONE);
  const [entityId, setEntityId] = useState(NONE);
  const [winnerId, setWinnerId] = useState(NONE);
  const [toStatus, setToStatus] = useState<string>(NONE);
  const [condition, setCondition] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const [fVehicle, setFVehicle] = useState(ALL);
  const [fKind, setFKind] = useState(ALL);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const sensitive = DISPOSAL_KINDS.includes(kind);
  const needsEntity = EXTERNAL_KINDS.includes(kind);

  const filtered = useMemo(
    () =>
      movements.filter((m) => (fVehicle === ALL || m.vehicle_id === fVehicle) && (fKind === ALL || m.kind === fKind)),
    [movements, fVehicle, fKind],
  );

  const totals = useMemo(() => {
    const ref = new Date();
    const inMonth = movements.filter((m) => {
      const d = new Date(`${m.moved_on}T12:00:00`);
      return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
    });
    return {
      mes: inMonth.length,
      baixados: movements.filter((m) => DISPOSAL_KINDS.includes(m.kind)).length,
      cedidos: movements.filter((m) => m.kind === "cedido_a_terceiros").length,
      valor: movements.reduce((s, m) => s + Number(m.auction_value ?? 0), 0),
    };
  }, [movements]);

  function openNew() {
    setVehicleId(NONE);
    setKind("remanejamento");
    setUnitId(NONE);
    setEntityId(NONE);
    setWinnerId(NONE);
    setToStatus(NONE);
    setCondition(NONE);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (vehicleId === NONE) {
      toast.error("Selecione o veículo.");
      return;
    }
    if (sensitive && !canManageFleet) {
      toast.error("Somente gestores de frota podem concluir baixas e alienações.");
      return;
    }
    if (needsEntity && entityId === NONE) {
      toast.error("Selecione a entidade externa envolvida.");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    try {
      const input = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = input?.files?.[0];
      const path = file && orgId ? await uploadFleetFile(orgId, file, "patrimonio") : null;
      const { error } = await supabase.from("asset_movements").insert({
        organization_id: orgId!,
        vehicle_id: vehicleId,
        kind,
        moved_on: d.moved_on,
        reason: d.reason,
        from_unit_id: vehicle?.unit_id ?? null,
        unit_id: unitId === NONE ? null : unitId,
        entity_id: entityId === NONE ? null : entityId,
        auction_winner_entity_id: winnerId === NONE ? null : winnerId,
        from_status: (vehicle?.status ?? null) as VehicleStatus | null,
        to_status: toStatus === NONE ? null : (toStatus as VehicleStatus),
        owner_name: d.owner_name || null,
        holder_name: d.holder_name || null,
        odometer_km: numOrNull(d.odometer_km),
        hour_meter: numOrNull(d.hour_meter),
        book_value: numOrNull(d.book_value),
        asset_code: d.asset_code || null,
        condition_state: condition === NONE ? null : condition,
        act_number: d.act_number || null,
        act_published_on: d.act_published_on || null,
        official_gazette: d.official_gazette || null,
        auction_number: d.auction_number || null,
        auction_lot: d.auction_lot || null,
        auction_value: numOrNull(d.auction_value),
        notes: d.notes || null,
        attachment_path: path,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Movimentação patrimonial registrada. O histórico do veículo foi atualizado.");
      invalidate(["asset-movements", "vehicles", "vehicle-status-history", "fueling-alerts"]);
      setOpen(false);
    } catch (err) {
      toast.error(dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function printTerm(m: AssetMovementRow) {
    const w = window.open("", "_blank", "noopener,width=900,height=1000");
    if (!w) return;
    const rows: [string, string][] = [
      ["Código da movimentação", m.code ?? "—"],
      ["Tipo", label(ASSET_MOVEMENT_KINDS, m.kind)],
      ["Data", dateBR(m.moved_on)],
      ["Veículo", `${m.vehicle?.plate ?? "—"} — ${m.vehicle?.brand ?? ""} ${m.vehicle?.model ?? ""}`],
      ["Código patrimonial", m.asset_code ?? "—"],
      ["Unidade de origem", m.from_unit?.name ?? "—"],
      ["Unidade de destino", m.unit?.name ?? "—"],
      ["Entidade externa", m.entity ? `${m.entity.name} (${m.entity.document ?? "sem documento"})` : "—"],
      ["Proprietário", m.owner_name ?? org?.legal_name ?? "—"],
      ["Usuário / fiel depositário", m.holder_name ?? "—"],
      ["Hodômetro", m.odometer_km !== null ? `${num(Number(m.odometer_km), 0)} km` : "—"],
      ["Horímetro", m.hour_meter !== null ? num(Number(m.hour_meter), 2) : "—"],
      ["Estado de conservação", m.condition_state ?? "—"],
      ["Valor contábil", m.book_value !== null ? brl(Number(m.book_value)) : "—"],
      ["Ato / portaria / lei", m.act_number ?? "—"],
      ["Publicação", m.act_published_on ? dateBR(m.act_published_on) : "—"],
      ["Diário oficial", m.official_gazette ?? "—"],
      ["Leilão / lote", [m.auction_number, m.auction_lot].filter(Boolean).join(" · ") || "—"],
      ["Arrematante", m.winner ? `${m.winner.name} (${m.winner.document ?? "—"})` : "—"],
      ["Valor de arrematação", m.auction_value !== null ? brl(Number(m.auction_value)) : "—"],
      ["Motivo", m.reason ?? "—"],
      ["Observações", m.notes ?? "—"],
    ];
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de movimentação patrimonial ${esc(m.code ?? "")}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;margin:48px;color:#111}
h1{font-size:18px;text-align:center;text-transform:uppercase;letter-spacing:1px}
h2{font-size:14px;text-align:center;font-weight:normal;margin-top:0}
table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}
td{border-bottom:1px solid #ddd;padding:7px 4px;vertical-align:top}
td:first-child{width:34%;font-weight:bold}
.sig{margin-top:72px;display:flex;justify-content:space-between;gap:48px;font-size:13px;text-align:center}
.sig div{flex:1;border-top:1px solid #111;padding-top:6px}
</style></head><body>
<h1>${esc(org?.legal_name ?? "Órgão público")}</h1>
<h2>${esc([org?.city, org?.state].filter(Boolean).join(" / "))}</h2>
<h1>Termo de movimentação patrimonial de veículo</h1>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<div class="sig"><div>Responsável pelo patrimônio</div><div>Gestor da frota</div><div>Recebedor</div></div>
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Movimentação patrimonial"
        description="Cessões, locações, remanejamentos, doações, leilões, alienações e baixas. A unidade do veículo só muda por este fluxo e nada é excluído."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova movimentação
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Movimentações no mês", value: String(totals.mes) },
          { label: "Baixas e alienações", value: String(totals.baixados) },
          { label: "Cedidos a terceiros", value: String(totals.cedidos) },
          { label: "Valor arrematado", value: brl(totals.valor) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  {v.plate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={fKind} onValueChange={setFKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {ASSET_MOVEMENT_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
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
              <TableHead>Veículo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origem → destino</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ato</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Landmark className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma movimentação registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.code ?? "—"}</TableCell>
                <TableCell>{m.vehicle?.plate ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={DISPOSAL_KINDS.includes(m.kind) ? "destructive" : "outline"}>
                    {label(ASSET_MOVEMENT_KINDS, m.kind)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {(m.from_unit?.acronym ?? m.from_unit?.name ?? "—") +
                    " → " +
                    (m.unit?.acronym ?? m.unit?.name ?? m.entity?.name ?? "—")}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{dateBR(m.moved_on)}</TableCell>
                <TableCell className="text-sm">{m.act_number ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {m.attachment_path && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Anexo"
                        onClick={() => void openFleetFile(m.attachment_path!)}
                      >
                        <Paperclip className="size-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Imprimir termo" onClick={() => printTerm(m)}>
                      <Printer className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova movimentação patrimonial</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Veículo *</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {v.brand ?? ""} {v.model ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicle && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Condição atual: {label(VEHICLE_STATUS, vehicle.status)} ·{" "}
                    {units.find((u) => u.id === vehicle.unit_id)?.acronym ?? "sem unidade"}
                  </p>
                )}
              </div>
              <div>
                <Label>Tipo de movimentação *</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as AssetMovementKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_MOVEMENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sensitive && !canManageFleet && (
                  <p className="mt-1 text-xs text-destructive">
                    Seu perfil não pode concluir baixas, doações, leilões ou alienações.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="moved_on">Data *</Label>
                <Input
                  id="moved_on"
                  name="moved_on"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label>Unidade de destino</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Manter unidade atual</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ?? u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nova situação do veículo</Label>
                <Select value={toStatus} onValueChange={setToStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Manter situação atual</SelectItem>
                    {VEHICLE_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entidade externa {needsEntity ? "*" : ""}</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {entities
                      .filter((en) => en.active)
                      .map((en) => (
                        <SelectItem key={en.id} value={en.id}>
                          {en.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="owner_name">Proprietário</Label>
                <Input id="owner_name" name="owner_name" defaultValue={org?.legal_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="holder_name">Usuário atual / fiel depositário</Label>
                <Input id="holder_name" name="holder_name" />
              </div>
              <div>
                <Label htmlFor="asset_code">Código patrimonial / contábil</Label>
                <Input id="asset_code" name="asset_code" defaultValue={vehicle?.asset_code ?? ""} />
              </div>
              <div>
                <Label htmlFor="odometer_km">Hodômetro (km)</Label>
                <MoneyInput id="odometer_km" name="odometer_km" defaultValue={vehicle?.current_km ?? ""} />
              </div>
              <div>
                <Label htmlFor="hour_meter">Horímetro</Label>
                <MoneyInput id="hour_meter" name="hour_meter" />
              </div>
              <div>
                <Label>Estado de conservação</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {CONDITION_STATES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="book_value">Valor contábil (R$)</Label>
                <MoneyInput id="book_value" name="book_value" />
              </div>
              <div>
                <Label htmlFor="act_number">Portaria / lei / ato</Label>
                <Input id="act_number" name="act_number" />
              </div>
              <div>
                <Label htmlFor="act_published_on">Data de publicação</Label>
                <Input id="act_published_on" name="act_published_on" type="date" />
              </div>
              <div>
                <Label htmlFor="official_gazette">Diário oficial</Label>
                <Input id="official_gazette" name="official_gazette" />
              </div>
            </div>

            {(kind === "leilao" || kind === "alienado") && (
              <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-4">
                <div>
                  <Label htmlFor="auction_number">Leilão nº</Label>
                  <Input id="auction_number" name="auction_number" />
                </div>
                <div>
                  <Label htmlFor="auction_lot">Lote</Label>
                  <Input id="auction_lot" name="auction_lot" />
                </div>
                <div>
                  <Label htmlFor="auction_value">Valor arrematado (R$)</Label>
                  <MoneyInput id="auction_value" name="auction_value" />
                </div>
                <div>
                  <Label>Arrematante</Label>
                  <Select value={winnerId} onValueChange={setWinnerId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informar</SelectItem>
                      {entities.map((en) => (
                        <SelectItem key={en.id} value={en.id}>
                          {en.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="reason">Motivo *</Label>
                <Textarea id="reason" name="reason" rows={2} required />
              </div>
              <div>
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>

            <div>
              <Label htmlFor="file" className="flex items-center gap-1">
                <Upload className="size-3" /> Anexo (termo, ato, publicação)
              </Label>
              <Input id="file" name="file" type="file" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Registrar movimentação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
