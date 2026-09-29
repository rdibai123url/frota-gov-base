import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  SHIFT_HOURS,
  endTime,
  hhmm,
  isoDay,
  monthRange,
  useDutyShifts,
  useDutyUnits,
} from "@/lib/escala";
import {
  currentAbsence,
  dbMessage,
  useDrivers,
  useInvalidate,
  useOrganization,
  usePerms,
} from "@/lib/frotagov";
import { printReport } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala de motoristas — Dibai Fleet" },
      {
        name: "description",
        content:
          "Escala mensal de motoristas por unidade de plantão, com dias, horário de início e carga horária de 8, 12 ou 24 horas.",
      },
    ],
  }),
  component: Escala,
});

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const thisMonth = () => new Date().toISOString().slice(0, 7);

function Escala() {
  const { canWrite, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: units = [] } = useDutyUnits();
  const { data: drivers = [] } = useDrivers();
  const { data: org } = useOrganization();
  const [unitId, setUnitId] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [newUnit, setNewUnit] = useState(false);
  const [unitName, setUnitName] = useState("");

  // montagem
  const [building, setBuilding] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [days, setDays] = useState<Set<string>>(new Set());
  const [start, setStart] = useState("07:00");
  const [hours, setHours] = useState<number>(12);
  const [saving, setSaving] = useState(false);

  const { data: shifts = [] } = useDutyShifts(unitId, month);
  const range = monthRange(month);
  const unit = units.find((u) => u.id === unitId) ?? null;
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  const end = endTime(start, hours);

  const activeDrivers = drivers.filter((d) => d.active);
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.full_name ?? "—";

  const monthDays = useMemo(
    () =>
      Array.from({ length: range.days }, (_, i) => {
        const day = i + 1;
        const iso = isoDay(range.year, range.month, day);
        return { day, iso, dow: new Date(range.year, range.month - 1, day).getDay() };
      }),
    [range.days, range.year, range.month],
  );
  const lead = monthDays[0]?.dow ?? 0;

  const myShifts = useMemo(
    () => new Set(shifts.filter((s) => s.driver_id === driverId).map((s) => s.shift_date)),
    [shifts, driverId],
  );
  const absentOn = (iso: string) => (driver ? currentAbsence(driver.absences, iso) : null);

  function toggle(iso: string) {
    if (!driver || absentOn(iso) || myShifts.has(iso)) return;
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function pick(rule: (d: { day: number; dow: number; iso: string }) => boolean) {
    if (!driver) return;
    setDays(
      new Set(
        monthDays
          .filter((d) => rule(d) && !absentOn(d.iso) && !myShifts.has(d.iso))
          .map((d) => d.iso),
      ),
    );
  }

  async function createUnit() {
    if (!orgId || unitName.trim().length < 2) {
      toast.error("Informe o nome da unidade de plantão.");
      return;
    }
    const { data, error } = await supabase
      .from("duty_units")
      .insert({ organization_id: orgId, name: unitName.trim(), created_by: userId })
      .select("id")
      .single();
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Unidade criada.");
    invalidate(["duty-units"]);
    setUnitId(data.id);
    setUnitName("");
    setNewUnit(false);
  }

  async function saveShifts() {
    if (!orgId || !unitId || !driver) return;
    const list = [...days].sort();
    if (list.length === 0) {
      toast.error("Marque pelo menos um dia no calendário.");
      return;
    }
    setSaving(true);
    let ok = 0;
    const failed: string[] = [];
    const rows = list.map((iso) => ({
      organization_id: orgId,
      duty_unit_id: unitId,
      driver_id: driver.id,
      shift_date: iso,
      start_time: start,
      hours,
      created_by: userId,
    }));
    // tenta salvar tudo de uma vez; se algum dia for recusado, salva um a um para dizer qual
    const bulk = await supabase.from("duty_shifts").insert(rows);
    if (!bulk.error) ok = rows.length;
    else {
      for (const row of rows) {
        const { error } = await supabase.from("duty_shifts").insert(row);
        if (error)
          failed.push(
            `${row.shift_date.slice(8)}/${row.shift_date.slice(5, 7)}: ${dbMessage(error)}`,
          );
        else ok++;
      }
    }
    setSaving(false);
    invalidate(["duty-shifts"]);
    if (ok > 0) toast.success(`${ok} turno(s) salvo(s) na escala de ${driver.full_name}.`);
    if (failed.length > 0)
      toast.error(
        `Não foi possível salvar ${failed.length} dia(s): ${failed.slice(0, 3).join(" · ")}`,
      );
    setDays(
      new Set(
        failed.length
          ? list.filter((iso) => failed.some((f) => f.startsWith(`${iso.slice(8)}/`)))
          : [],
      ),
    );
  }

  async function removeShift(id: string) {
    const { error } = await supabase.from("duty_shifts").delete().eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["duty-shifts"]);
  }

  // visão do mês
  const byDriver = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    for (const s of shifts) map.set(s.driver_id, [...(map.get(s.driver_id) ?? []), s]);
    return [...map.entries()].sort((a, b) =>
      driverName(a[0]).localeCompare(driverName(b[0]), "pt-BR"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, drivers]);

  function print() {
    if (!unit) return;
    const rows = byDriver.flatMap(([id, list]) =>
      list.map((s) => ({
        motorista: driverName(id),
        data: new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("pt-BR"),
        dia: WEEK[new Date(`${s.shift_date}T12:00:00`).getDay()] ?? "",
        inicio: hhmm(s.start_time),
        termino: `${endTime(s.start_time, s.hours).text}${endTime(s.start_time, s.hours).nextDay ? " (dia seguinte)" : ""}`,
        carga: `${s.hours} h`,
      })),
    );
    const ok = printReport(
      {
        title: `Escala de motoristas — ${unit.name}`,
        organization: org?.legal_name ?? null,
        subtitle: `Mês de referência: ${String(range.month).padStart(2, "0")}/${range.year}`,
        period: `${String(range.month).padStart(2, "0")}/${range.year}`,
        filters: [{ label: "Unidade de plantão", value: unit.name }],
      },
      [
        { key: "data", label: "Data" },
        { key: "dia", label: "Dia" },
        { key: "motorista", label: "Motorista" },
        { key: "inicio", label: "Início" },
        { key: "termino", label: "Término" },
        { key: "carga", label: "Carga horária" },
      ],
      rows.sort((a, b) =>
        a.data.split("/").reverse().join("").localeCompare(b.data.split("/").reverse().join("")),
      ),
    );
    if (!ok) toast.error("Permita a abertura de janelas para imprimir.");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Escala de motoristas"
        description="Monte, mês a mês, a escala dos motoristas de cada unidade de plantão (ex.: SAMU — unidade X)."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Unidade de plantão</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a unidade" />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canWrite && (
          <Button variant="outline" className="gap-2" onClick={() => setNewUnit(true)}>
            <Plus className="size-4" /> Nova unidade de plantão
          </Button>
        )}
      </div>

      {!unit ? (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
          {units.length === 0
            ? "Nenhuma unidade de plantão cadastrada. Clique em “Nova unidade de plantão” para começar."
            : "Escolha a unidade de plantão para ver e montar a escala."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && !building && (
              <Button className="gap-2" onClick={() => setBuilding(true)}>
                <Plus className="size-4" /> Nova escala
              </Button>
            )}
            {building && (
              <Button variant="outline" onClick={() => setBuilding(false)}>
                ← Voltar à escala do mês
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              disabled={shifts.length === 0}
              onClick={print}
            >
              <Printer className="size-4" /> Imprimir escala de{" "}
              {String(range.month).padStart(2, "0")}/{range.year}
            </Button>
          </div>

          {building ? (
            <div className="space-y-4">
              <ol className="grid gap-2 text-sm sm:grid-cols-3">
                <li className="rounded-md border bg-card px-3 py-2">
                  <strong>1.</strong> Escolha o mês
                </li>
                <li className="rounded-md border bg-card px-3 py-2">
                  <strong>2.</strong> Escolha o motorista
                </li>
                <li className="rounded-md border bg-card px-3 py-2">
                  <strong>3.</strong> Marque os dias, o horário e a carga horária
                </li>
              </ol>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="esc-mes-nova">Mês da escala</Label>
                  <Input
                    id="esc-mes-nova"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) {
                        setMonth(e.target.value);
                        setDays(new Set());
                      }
                    }}
                  />
                </div>
              </div>
              {!canWrite ? (
                <p className="text-sm text-muted-foreground">
                  Seu perfil só consulta a escala. Veja a aba “Escala do mês”.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Motorista</Label>
                        <Select
                          value={driverId}
                          onValueChange={(v) => {
                            setDriverId(v);
                            setDays(new Set());
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha o motorista na lista" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeDrivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.full_name}
                                {d.current_absence ? " (afastado agora)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="esc-ini">Horário de início</Label>
                        <Input
                          id="esc-ini"
                          type="time"
                          value={start}
                          onChange={(e) => setStart(e.target.value || "07:00")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Carga horária da escala</Label>
                        <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SHIFT_HOURS.map((h) => (
                              <SelectItem key={h} value={String(h)}>
                                {h} horas
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Horário de término (calculado)</Label>
                        <Input
                          readOnly
                          value={`${end.text}${end.nextDay ? " — no dia seguinte" : ""}`}
                          className="bg-muted/50"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!driver}
                        onClick={() => pick((d) => d.dow >= 1 && d.dow <= 5)}
                      >
                        Dias úteis
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!driver}
                        onClick={() => pick((d) => d.dow === 0 || d.dow === 6)}
                      >
                        Fins de semana
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!driver}
                        onClick={() => pick((d) => d.day % 2 === 1)}
                      >
                        Dia sim, dia não
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!driver}
                        onClick={() => pick(() => true)}
                      >
                        Todos os dias
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDays(new Set())}
                      >
                        Limpar
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4 shadow-card">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarDays className="size-4" /> Dias de trabalho
                      </h3>
                      <span className="text-xs text-muted-foreground">{days.size} marcado(s)</span>
                    </div>
                    {!driver ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Escolha o motorista para marcar os dias.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase text-muted-foreground">
                          {WEEK.map((w) => (
                            <span key={w}>{w}</span>
                          ))}
                        </div>
                        <div className="mt-1 grid grid-cols-7 gap-1">
                          {Array.from({ length: lead }, (_, i) => (
                            <span key={`v${i}`} />
                          ))}
                          {monthDays.map((d) => {
                            const absent = absentOn(d.iso);
                            const has = myShifts.has(d.iso);
                            const on = days.has(d.iso);
                            return (
                              <button
                                key={d.iso}
                                type="button"
                                disabled={Boolean(absent) || has}
                                onClick={() => toggle(d.iso)}
                                title={
                                  absent
                                    ? "Motorista afastado neste dia"
                                    : has
                                      ? "Já escalado neste dia"
                                      : ""
                                }
                                className={[
                                  "aspect-square rounded-md border text-sm transition-colors",
                                  on
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "bg-card hover:bg-accent",
                                  absent
                                    ? "cursor-not-allowed border-amber-500/40 bg-amber-500/10 text-amber-700 line-through opacity-70"
                                    : "",
                                  has
                                    ? "cursor-not-allowed border-emerald-600/40 bg-emerald-600/10 text-emerald-700"
                                    : "",
                                  d.dow === 0 || d.dow === 6 ? "font-semibold" : "",
                                ].join(" ")}
                              >
                                {d.day}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[0.7rem] text-muted-foreground">
                          Verde: já escalado. Riscado: motorista afastado.
                        </p>
                      </>
                    )}
                    <Button
                      className="mt-3 w-full"
                      disabled={saving || !driver || days.size === 0}
                      onClick={saveShifts}
                    >
                      Salvar {days.size ? `${days.size} turno(s)` : "escala"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="esc-mes-ver">Mês da escala</Label>
                  <Input
                    id="esc-mes-ver"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) {
                        setMonth(e.target.value);
                        setDays(new Set());
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {shifts.length} turno(s) em {String(range.month).padStart(2, "0")}/{range.year}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={shifts.length === 0}
                  onClick={print}
                >
                  <Printer className="size-4" /> Imprimir escala
                </Button>
              </div>
              {byDriver.length === 0 ? (
                <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
                  Nenhum turno lançado neste mês.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
                  <table className="w-full text-xs [&_td]:border [&_th]:border">
                    <thead className="bg-surface-strong">
                      <tr>
                        <th className="sticky left-0 z-10 min-w-40 bg-surface-strong px-2 py-1.5 text-left">
                          Motorista
                        </th>
                        {monthDays.map((d) => (
                          <th
                            key={d.iso}
                            className={`min-w-9 px-1 py-1 text-center font-medium ${d.dow === 0 || d.dow === 6 ? "text-primary" : ""}`}
                          >
                            {d.day}
                            <span className="block text-[0.6rem] font-normal text-muted-foreground">
                              {WEEK[d.dow]}
                            </span>
                          </th>
                        ))}
                        <th className="px-2 text-center">Turnos</th>
                        <th className="px-2 text-center">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDriver.map(([id, list]) => (
                        <tr key={id}>
                          <td className="sticky left-0 bg-card px-2 py-1.5 font-medium">
                            {driverName(id)}
                          </td>
                          {monthDays.map((d) => {
                            const s = list.find((x) => x.shift_date === d.iso);
                            return (
                              <td key={d.iso} className="p-0 text-center">
                                {s ? (
                                  canWrite ? (
                                    <button
                                      type="button"
                                      className="group h-full w-full bg-primary/10 px-0.5 py-1 hover:bg-destructive/15"
                                      title={`${hhmm(s.start_time)} → ${endTime(s.start_time, s.hours).text} (${s.hours} h). Clique para remover.`}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            `Remover o turno de ${driverName(id)} em ${d.day}/${range.month}?`,
                                          )
                                        )
                                          void removeShift(s.id);
                                      }}
                                    >
                                      <span className="group-hover:hidden">{s.hours}h</span>
                                      <Trash2 className="mx-auto hidden size-3 group-hover:block" />
                                    </button>
                                  ) : (
                                    <span className="block bg-primary/10 px-0.5 py-1">
                                      {s.hours}h
                                    </span>
                                  )
                                ) : null}
                              </td>
                            );
                          })}
                          <td className="px-2 text-center font-semibold">{list.length}</td>
                          <td className="px-2 text-center font-semibold">
                            {list.reduce((sum, s) => sum + s.hours, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Dica: passe o mouse sobre um turno para ver o horário. Legenda:{" "}
                <Badge variant="outline">8h</Badge> <Badge variant="outline">12h</Badge>{" "}
                <Badge variant="outline">24h</Badge> carga do turno.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={newUnit} onOpenChange={setNewUnit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova unidade de plantão</DialogTitle>
            <DialogDescription>
              Local ou serviço que precisa de motoristas em escala, como “SAMU — unidade X”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="unit-name">Nome da unidade *</Label>
            <Input
              id="unit-name"
              value={unitName}
              maxLength={120}
              placeholder="Ex.: SAMU — Unidade Centro"
              onChange={(e) => setUnitName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewUnit(false)}>
              Cancelar
            </Button>
            <Button onClick={createUnit}>Criar unidade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
