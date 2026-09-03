import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ListPagination, usePaged } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompatibilityOverrides, usePartCompatibilities } from "@/lib/almoxarifado";
import { dateTimeBR, dbMessage, supabase, useInvalidate, usePartsCatalog, usePerms, useVehicles } from "@/lib/frotagov";

const NONE = "__none__";

/** Matriz de compatibilidade peça × ativo, com histórico de liberações excepcionais auditadas. */
export function PartCompatibilityPanel() {
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: rows = [] } = usePartCompatibilities();
  const { data: overrides = [] } = useCompatibilityOverrides();
  const { data: parts = [] } = usePartsCatalog();
  const { data: vehicles = [] } = useVehicles();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    part_id: "",
    scope: "familia",
    vehicle_id: NONE,
    asset_class: NONE,
    brand: "",
    model: "",
    year_from: "",
    year_to: "",
    engine: "",
    version: "",
    equipment_type: "",
    application: "",
  });

  const partLabel = useMemo(() => {
    const map = new Map<string, string>();
    parts.forEach((p) => map.set(p.id, p.description));
    return map;
  }, [parts]);
  const vehicleLabel = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => map.set(v.id, v.plate ?? v.asset_code ?? "—"));
    return map;
  }, [vehicles]);
  const paged = usePaged(rows);

  async function save() {
    if (!orgId || !f.part_id) {
      toast.error("Selecione a peça");
      return;
    }
    const { error } = await supabase.from("part_compatibilities").insert({
      organization_id: orgId,
      part_id: f.part_id,
      scope: f.scope,
      vehicle_id: f.scope === "ativo" && f.vehicle_id !== NONE ? f.vehicle_id : null,
      asset_class: f.asset_class === NONE ? null : f.asset_class,
      brand: f.brand.trim() || null,
      model: f.model.trim() || null,
      year_from: f.year_from ? Number(f.year_from) : null,
      year_to: f.year_to ? Number(f.year_to) : null,
      engine: f.engine.trim() || null,
      version: f.version.trim() || null,
      equipment_type: f.equipment_type.trim() || null,
      application: f.application.trim() || null,
      created_by: userId,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Compatibilidade cadastrada");
    setOpen(false);
    invalidate(["part-compatibilities"]);
  }

  async function inactivate(id: string) {
    const reason = window.prompt("Motivo da inativação:");
    if (!reason?.trim()) return;
    const { error } = await supabase
      .from("part_compatibilities")
      .update({
        active: false,
        inactivated_at: new Date().toISOString(),
        inactivated_reason: reason.trim(),
        updated_by: userId,
      })
      .eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Compatibilidade inativada (o histórico é preservado)");
    invalidate(["part-compatibilities"]);
  }

  return (
    <div className="space-y-4">
      <div className="gov-card p-4 text-sm text-muted-foreground">
        Peças sem nenhuma compatibilidade cadastrada são aceitas em qualquer ativo. A partir do primeiro registro, a
        aplicação em ativo fora da matriz exige justificativa auditada de perfil autorizado.
      </div>
      {canManageFleet && (
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova compatibilidade
        </Button>
      )}

      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Peça</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead>Aplicação</TableHead>
              <TableHead>Anos</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Nenhuma compatibilidade cadastrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{partLabel.get(r.part_id) ?? "—"}</TableCell>
                <TableCell>{r.scope === "ativo" ? "Ativo específico" : "Família / modelo"}</TableCell>
                <TableCell>
                  {r.scope === "ativo"
                    ? (r.vehicle_id ? (vehicleLabel.get(r.vehicle_id) ?? "—") : "—")
                    : [r.brand, r.model, r.engine, r.version, r.equipment_type].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  {r.year_from ?? "—"} a {r.year_to ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Ativa" : "Inativa"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManageFleet && r.active && (
                    <Button size="sm" variant="outline" onClick={() => inactivate(r.id)}>
                      Inativar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <div>
        <h2 className="gov-title mb-2 text-lg">Liberações excepcionais auditadas</h2>
        <div className="gov-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Peça</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Contexto</TableHead>
                <TableHead>Justificativa</TableHead>
                <TableHead>Autorizado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Nenhuma liberação excepcional registrada.
                  </TableCell>
                </TableRow>
              )}
              {overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{dateTimeBR(o.created_at)}</TableCell>
                  <TableCell>{partLabel.get(o.part_id) ?? "—"}</TableCell>
                  <TableCell>{o.vehicle_id ? (vehicleLabel.get(o.vehicle_id) ?? "—") : "—"}</TableCell>
                  <TableCell>{o.context}</TableCell>
                  <TableCell>{o.justification}</TableCell>
                  <TableCell>{o.authorized_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova compatibilidade</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Peça *</Label>
              <Select value={f.part_id} onValueChange={(v) => setF({ ...f, part_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Escopo</Label>
              <Select value={f.scope} onValueChange={(v) => setF({ ...f, scope: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="familia">Família / modelo</SelectItem>
                  <SelectItem value="ativo">Ativo específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.scope === "ativo" ? (
              <div>
                <Label>Ativo</Label>
                <Select value={f.vehicle_id} onValueChange={(v) => setF({ ...f, vehicle_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate ?? v.asset_code ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Classe do ativo</Label>
                <Select value={f.asset_class} onValueChange={(v) => setF({ ...f, asset_class: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Qualquer</SelectItem>
                    <SelectItem value="veiculo">Veículo</SelectItem>
                    <SelectItem value="equipamento">Máquina / equipamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Marca</Label>
              <Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
            </div>
            <div>
              <Label>Modelo</Label>
              <Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
            </div>
            <div>
              <Label>Ano inicial</Label>
              <Input value={f.year_from} onChange={(e) => setF({ ...f, year_from: e.target.value })} />
            </div>
            <div>
              <Label>Ano final</Label>
              <Input value={f.year_to} onChange={(e) => setF({ ...f, year_to: e.target.value })} />
            </div>
            <div>
              <Label>Motorização</Label>
              <Input value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value })} />
            </div>
            <div>
              <Label>Versão</Label>
              <Input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} />
            </div>
            <div>
              <Label>Tipo de equipamento</Label>
              <Input value={f.equipment_type} onChange={(e) => setF({ ...f, equipment_type: e.target.value })} />
            </div>
            <div>
              <Label>Aplicação</Label>
              <Input value={f.application} onChange={(e) => setF({ ...f, application: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
