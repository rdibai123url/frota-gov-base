import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { endTime, hhmm, isoDay, monthRange } from "@/lib/escala";
import { currentAbsence, usePerms, type DriverAbsence } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/minha-escala")({
  head: () => ({
    meta: [
      { title: "Minha escala — Dibai Fleet" },
      {
        name: "description",
        content: "Os dias, horários e unidades em que o motorista está escalado, no celular.",
      },
    ],
  }),
  component: MinhaEscala,
});

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEK_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function useMinhaEscala(userId: string | null, month: string) {
  const { from, to } = monthRange(month);
  return useQuery({
    queryKey: ["minha-escala", userId, month],
    enabled: Boolean(userId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data: driver, error: dErr } = await supabase
        .from("drivers")
        .select("id, full_name")
        .eq("user_id", userId as string)
        .order("active", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!driver) return { driver: null, shifts: [], absences: [] as DriverAbsence[] };
      const [{ data: shifts, error }, { data: abs }] = await Promise.all([
        supabase
          .from("duty_shifts")
          .select("id, shift_date, start_time, hours, duty_unit:duty_units(name)")
          .eq("driver_id", driver.id)
          .gte("shift_date", from)
          .lte("shift_date", to)
          .order("shift_date"),
        supabase
          .from("driver_absences")
          .select("id, driver_id, reason, start_date, expected_return, returned_at, notes")
          .eq("driver_id", driver.id),
      ]);
      if (error) throw error;
      return { driver, shifts: shifts ?? [], absences: (abs ?? []) as DriverAbsence[] };
    },
  });
}

function MinhaEscala() {
  const { userId } = usePerms();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useMinhaEscala(userId, month);
  const range = monthRange(month);
  const todayIso = new Date().toISOString().slice(0, 10);

  const byDay = useMemo(() => new Map((data?.shifts ?? []).map((s) => [s.shift_date, s])), [data]);
  const lead = new Date(range.year, range.month - 1, 1).getDay();
  const upcoming = (data?.shifts ?? []).filter((s) => s.shift_date >= todayIso);
  const totalHours = (data?.shifts ?? []).reduce((sum, s) => sum + s.hours, 0);
  const monthName = new Date(range.year, range.month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} de ${range.year}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Minha escala"
        description="Veja os dias, os horários e a unidade em que você está escalado."
      />

      {isLoading && !data && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && !data?.driver && (
        <div className="rounded-lg border bg-card p-6 text-sm shadow-card">
          <p className="font-medium">
            O seu usuário ainda não está ligado a um cadastro de condutor.
          </p>
          <p className="mt-1 text-muted-foreground">
            Peça ao gestor para abrir o seu cadastro em <strong>Cadastros → Condutores</strong> e
            escolher o seu usuário. Depois disso, a sua escala aparece aqui.
          </p>
        </div>
      )}

      {data?.driver && (
        <>
          <div className="flex items-center justify-between rounded-lg border bg-card p-2 shadow-card">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <label className="relative flex-1 cursor-pointer text-center">
              <span className="text-base font-semibold">{label}</span>
              <span className="block text-[0.65rem] font-normal text-muted-foreground">
                toque para escolher outro mês
              </span>
              <input
                type="month"
                aria-label="Escolher o mês"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-3 shadow-card">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Turnos no mês</p>
              <p className="mt-1 text-2xl font-semibold">{data.shifts.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3 shadow-card">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas no mês</p>
              <p className="mt-1 text-2xl font-semibold">{totalHours} h</p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-card">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4" /> Calendário
            </h2>
            <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase text-muted-foreground">
              {WEEK.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => (
                <span key={`v${i}`} />
              ))}
              {Array.from({ length: range.days }, (_, i) => {
                const day = i + 1;
                const iso = isoDay(range.year, range.month, day);
                const shift = byDay.get(iso);
                const away = currentAbsence(data.absences, iso);
                const today = iso === todayIso;
                return (
                  <div
                    key={iso}
                    title={
                      shift
                        ? `${hhmm(shift.start_time)} até ${endTime(shift.start_time, shift.hours).text} (${shift.hours} h)`
                        : away
                          ? "Afastado"
                          : ""
                    }
                    className={[
                      "flex aspect-square flex-col items-center justify-center rounded-md border text-sm",
                      shift ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                      away && !shift ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "",
                      today ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : "",
                    ].join(" ")}
                  >
                    <span className="font-medium leading-none">{day}</span>
                    {shift && (
                      <span className="text-[0.6rem] leading-none opacity-90">{shift.hours}h</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[0.7rem] text-muted-foreground">
              Azul: dia de trabalho. Amarelo: afastamento. Contorno: hoje.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-card">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4" /> Próximos turnos
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum turno a partir de hoje neste mês.
              </p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((s) => {
                  const d = new Date(`${s.shift_date}T12:00:00`);
                  const end = endTime(s.start_time, s.hours);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold capitalize">
                          {WEEK_LONG[d.getDay()]}, {d.toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.duty_unit?.name ?? "Unidade"} · {hhmm(s.start_time)} às {end.text}
                          {end.nextDay ? " (dia seguinte)" : ""}
                        </p>
                      </div>
                      <Badge variant="secondary">{s.hours} h</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
