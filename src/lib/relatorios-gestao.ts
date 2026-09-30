/**
 * Relatórios de gestão: resumos, cadastros, afastamentos e escala.
 * Cada relatório declara o módulo (aba) de onde vem — se o órgão não contratou a aba,
 * o relatório também não aparece.
 */
import { supabase, ABSENCE_REASONS, DRIVER_BONDS, VEHICLE_STATUS } from "@/lib/frotagov";
import { formatCPF, formatMoney, formatNumberBR } from "@/lib/format";

export const GESTAO_REPORTS = [
  {
    value: "resumo_executivo",
    label: "Resumo executivo da frota",
    group: "Gerenciais e resumos",
    module: null,
  },
  {
    value: "resumo_unidade",
    label: "Resumo por secretaria / unidade",
    group: "Gerenciais e resumos",
    module: null,
  },
  {
    value: "resumo_mensal",
    label: "Resumo mês a mês (combustível, manutenção e multas)",
    group: "Gerenciais e resumos",
    module: null,
  },
  {
    value: "manut_resumo",
    label: "Manutenção — resumo por veículo",
    group: "Gerenciais e resumos",
    module: "manutencoes",
  },
  {
    value: "multas_condutor",
    label: "Multas — resumo por condutor",
    group: "Gerenciais e resumos",
    module: "multas",
  },
  {
    value: "cad_condutores",
    label: "Cadastro de condutores (CNH e situação)",
    group: "Cadastros",
    module: "condutores",
  },
  {
    value: "cad_funcionarios",
    label: "Cadastro de funcionários",
    group: "Cadastros",
    module: "funcionarios",
  },
  {
    value: "cad_unidades",
    label: "Cadastro de secretarias / unidades",
    group: "Cadastros",
    module: "unidades",
  },
  {
    value: "afastamentos",
    label: "Afastamentos de condutores (férias, licença, INSS, atestado)",
    group: "Pessoal e escala",
    module: "condutores",
  },
  {
    value: "cnh_vencimento",
    label: "CNH vencida ou a vencer em 90 dias",
    group: "Pessoal e escala",
    module: "condutores",
  },
  {
    value: "escala_turnos",
    label: "Escala — turnos e horas por motorista",
    group: "Pessoal e escala",
    module: "escala",
  },
] as const;

export type GestaoKey = (typeof GESTAO_REPORTS)[number]["value"];

export const GESTAO_CAPS: Record<
  GestaoKey,
  { date: boolean; unit: boolean; vehicle: boolean; driver: boolean }
> = {
  resumo_executivo: { date: true, unit: false, vehicle: false, driver: false },
  resumo_unidade: { date: true, unit: false, vehicle: false, driver: false },
  resumo_mensal: { date: true, unit: true, vehicle: false, driver: false },
  manut_resumo: { date: true, unit: true, vehicle: true, driver: false },
  multas_condutor: { date: true, unit: true, vehicle: false, driver: true },
  cad_condutores: { date: false, unit: true, vehicle: false, driver: true },
  cad_funcionarios: { date: false, unit: true, vehicle: false, driver: false },
  cad_unidades: { date: false, unit: false, vehicle: false, driver: false },
  afastamentos: { date: true, unit: true, vehicle: false, driver: true },
  cnh_vencimento: { date: false, unit: true, vehicle: false, driver: false },
  escala_turnos: { date: true, unit: true, vehicle: false, driver: true },
};

export const GESTAO_LABELS: Record<string, string> = {
  indicador: "Indicador",
  resultado: "Resultado",
  valor: "Valor",
  qtd: "Quantidade",
  veiculos: "Veículos",
  condutores: "Condutores",
  litros: "Litros",
  combustivel: "Combustível (R$)",
  manutencao: "Manutenção (R$)",
  multas: "Multas (R$)",
  nome: "Nome",
  vinculo: "Vínculo",
  cnh: "CNH",
  categorias: "Categorias",
  validade: "Validade da CNH",
  situacao_cnh: "Situação da CNH",
  afastamento: "Afastamento atual",
  ativo: "Ativo",
  funcoes: "Funções",
  condutor_vinculado: "É condutor",
  sigla: "Sigla",
  responsavel: "Responsável",
  motivo: "Motivo",
  inicio: "Início",
  previsao: "Previsão de retorno",
  retorno: "Retorno registrado",
  dias: "Dias",
  vence_em: "Dias para vencer",
  turnos: "Turnos",
  horas: "Horas",
  dias_trabalhados: "Dias trabalhados",
  plantao: "Unidade de plantão",
  pendentes: "Pendentes",
  ultima: "Última manutenção",
  media: "Média por manutenção (R$)",
};

type Ctx = {
  from: string;
  to: string;
  unit: string | null;
  vehicle: string | null;
  driver: string | null;
  /** Módulos habilitados para o órgão (para os resumos omitirem o que não foi contratado). */
  has: (moduleKey: string) => boolean;
};

const day = (v?: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const isoToday = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;
const sim = (b: boolean) => (b ? "Sim" : "Não");
const diffDays = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000,
  );
const bondLabel = (v: string) => DRIVER_BONDS.find((b) => b.value === v)?.label ?? v;
const reasonLabel = (v: string) => ABSENCE_REASONS.find((r) => r.value === v)?.label ?? v;
const statusLabel = (v: string) => VEHICLE_STATUS.find((s) => s.value === v)?.label ?? v;

function cnhStatus(expiry: string | null) {
  if (!expiry) return { text: "Sem validade informada", days: null as number | null };
  const days = diffDays(isoToday(), expiry);
  if (days < 0) return { text: "Vencida", days };
  if (days <= 90) return { text: "A vencer em até 90 dias", days };
  return { text: "Em dia", days };
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

type Row = Record<string, unknown>;

export async function runGestaoReport(report: GestaoKey, c: Ctx): Promise<Row[]> {
  const start = `${c.from}T00:00:00`;
  const end = `${c.to}T23:59:59`;

  if (report === "resumo_executivo") {
    const out: Row[] = [];
    const add = (indicador: string, valor: string | number) =>
      out.push({ indicador, resultado: valor });
    if (c.has("veiculos")) {
      const v = await must(supabase.from("vehicles").select("status"));
      add("Veículos cadastrados", v.length);
      for (const s of VEHICLE_STATUS) {
        const n = v.filter((x) => x.status === s.value).length;
        if (n) add(`Veículos — ${s.label}`, n);
      }
    }
    if (c.has("condutores")) {
      const d = await must(supabase.from("drivers").select("id, active, license_expiry"));
      const a = await must(
        supabase
          .from("driver_absences")
          .select("driver_id, start_date, expected_return, returned_at"),
      ).catch(() => [] as never[]);
      const hoje = isoToday();
      const afastados = new Set(
        a
          .filter(
            (x) =>
              hoje >= x.start_date &&
              (!x.returned_at || hoje < x.returned_at) &&
              (!x.expected_return || hoje < x.expected_return),
          )
          .map((x) => x.driver_id),
      );
      const ativos = d.filter((x) => x.active);
      add("Condutores ativos", ativos.length);
      add("Condutores afastados hoje", ativos.filter((x) => afastados.has(x.id)).length);
      add(
        "CNH vencida",
        ativos.filter((x) => cnhStatus(x.license_expiry).text === "Vencida").length,
      );
      add(
        "CNH a vencer em até 90 dias",
        ativos.filter((x) => cnhStatus(x.license_expiry).text === "A vencer em até 90 dias").length,
      );
    }
    if (c.has("abastecimentos")) {
      const f = await must(
        supabase
          .from("fuelings")
          .select("quantity, total_value")
          .gte("fueled_at", start)
          .lte("fueled_at", end),
      );
      add("Abastecimentos no período", f.length);
      add(
        "Litros abastecidos",
        formatNumberBR(
          f.reduce((s, x) => s + num(x.quantity), 0),
          1,
        ),
      );
      add("Gasto com combustível", formatMoney(f.reduce((s, x) => s + num(x.total_value), 0)));
    }
    if (c.has("manutencoes")) {
      const m = await must(
        supabase
          .from("maintenance_records")
          .select("total_value")
          .gte("entry_at", start)
          .lte("entry_at", end),
      );
      add("Manutenções no período", m.length);
      add("Gasto com manutenção", formatMoney(m.reduce((s, x) => s + num(x.total_value), 0)));
    }
    if (c.has("multas")) {
      const t = await must(
        supabase
          .from("traffic_fines")
          .select("amount")
          .gte("occurred_at", start)
          .lte("occurred_at", end),
      );
      add("Multas no período", t.length);
      add("Valor das multas", formatMoney(t.reduce((s, x) => s + num(x.amount), 0)));
    }
    if (c.has("sinistros")) {
      const s = await must(
        supabase
          .from("accidents")
          .select("expenses_value")
          .gte("occurred_at", start)
          .lte("occurred_at", end),
      );
      add("Acidentes e sinistros no período", s.length);
      add("Despesas com sinistros", formatMoney(s.reduce((t, x) => t + num(x.expenses_value), 0)));
    }
    return out;
  }

  if (report === "resumo_unidade") {
    const units = await must(supabase.from("units").select("id, name, acronym").order("name"));
    const veh = c.has("veiculos") ? await must(supabase.from("vehicles").select("unit_id")) : [];
    const drv = c.has("condutores")
      ? await must(supabase.from("drivers").select("unit_id, active"))
      : [];
    const fu = c.has("abastecimentos")
      ? await must(
          supabase
            .from("fuelings")
            .select("unit_id, quantity, total_value")
            .gte("fueled_at", start)
            .lte("fueled_at", end),
        )
      : [];
    const ma = c.has("manutencoes")
      ? await must(
          supabase
            .from("maintenance_records")
            .select("unit_id, total_value")
            .gte("entry_at", start)
            .lte("entry_at", end),
        )
      : [];
    return units.map((u) => {
      const row: Row = { unidade: u.acronym ? `${u.name} (${u.acronym})` : u.name };
      if (c.has("veiculos")) row["veiculos"] = veh.filter((x) => x.unit_id === u.id).length;
      if (c.has("condutores"))
        row["condutores"] = drv.filter((x) => x.unit_id === u.id && x.active).length;
      if (c.has("abastecimentos")) {
        const f = fu.filter((x) => x.unit_id === u.id);
        row["litros"] = formatNumberBR(
          f.reduce((s, x) => s + num(x.quantity), 0),
          1,
        );
        row["combustivel"] = formatMoney(f.reduce((s, x) => s + num(x.total_value), 0));
      }
      if (c.has("manutencoes"))
        row["manutencao"] = formatMoney(
          ma.filter((x) => x.unit_id === u.id).reduce((s, x) => s + num(x.total_value), 0),
        );
      return row;
    });
  }

  if (report === "resumo_mensal") {
    const months = new Map<string, { comb: number; man: number; mul: number }>();
    const slot = (iso: string) => {
      const k = iso.slice(0, 7);
      if (!months.has(k)) months.set(k, { comb: 0, man: 0, mul: 0 });
      return months.get(k)!;
    };
    if (c.has("abastecimentos")) {
      let q = supabase
        .from("fuelings")
        .select("fueled_at, total_value")
        .gte("fueled_at", start)
        .lte("fueled_at", end);
      if (c.unit) q = q.eq("unit_id", c.unit);
      for (const x of await must(q)) slot(x.fueled_at).comb += num(x.total_value);
    }
    if (c.has("manutencoes")) {
      let q = supabase
        .from("maintenance_records")
        .select("entry_at, total_value")
        .gte("entry_at", start)
        .lte("entry_at", end);
      if (c.unit) q = q.eq("unit_id", c.unit);
      for (const x of await must(q)) slot(x.entry_at).man += num(x.total_value);
    }
    if (c.has("multas")) {
      let q = supabase
        .from("traffic_fines")
        .select("occurred_at, amount")
        .gte("occurred_at", start)
        .lte("occurred_at", end);
      if (c.unit) q = q.eq("unit_id", c.unit);
      for (const x of await must(q)) slot(x.occurred_at).mul += num(x.amount);
    }
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        const row: Row = { mes: `${m}/${y}` };
        if (c.has("abastecimentos")) row["combustivel"] = formatMoney(v.comb);
        if (c.has("manutencoes")) row["manutencao"] = formatMoney(v.man);
        if (c.has("multas")) row["multas"] = formatMoney(v.mul);
        row["total"] = formatMoney(v.comb + v.man + v.mul);
        return row;
      });
  }

  if (report === "manut_resumo") {
    let q = supabase
      .from("maintenance_records")
      .select("entry_at, total_value, vehicle:vehicles(id, plate, asset_code), unit:units(name)")
      .gte("entry_at", start)
      .lte("entry_at", end);
    if (c.unit) q = q.eq("unit_id", c.unit);
    if (c.vehicle) q = q.eq("vehicle_id", c.vehicle);
    const rows = await must(q);
    const by = new Map<
      string,
      { nome: string; unidade: string; n: number; total: number; ultima: string }
    >();
    for (const r of rows) {
      const id = r.vehicle?.id ?? "?";
      const cur = by.get(id) ?? {
        nome: r.vehicle?.plate ?? r.vehicle?.asset_code ?? "—",
        unidade: r.unit?.name ?? "—",
        n: 0,
        total: 0,
        ultima: "",
      };
      cur.n += 1;
      cur.total += num(r.total_value);
      if (r.entry_at > cur.ultima) cur.ultima = r.entry_at;
      by.set(id, cur);
    }
    return [...by.values()]
      .sort((a, b) => b.total - a.total)
      .map((v) => ({
        veiculo: v.nome,
        unidade: v.unidade,
        qtd: v.n,
        valor: formatMoney(v.total),
        media: formatMoney(v.n ? v.total / v.n : 0),
        ultima: day(v.ultima),
      }));
  }

  if (report === "multas_condutor") {
    let q = supabase
      .from("traffic_fines")
      .select("status, amount, driver:drivers(id, full_name), unit:units(name)")
      .gte("occurred_at", start)
      .lte("occurred_at", end);
    if (c.unit) q = q.eq("unit_id", c.unit);
    if (c.driver) q = q.eq("driver_id", c.driver);
    const by = new Map<string, { nome: string; n: number; total: number; pend: number }>();
    for (const r of await must(q)) {
      const id = r.driver?.id ?? "sem";
      const cur = by.get(id) ?? {
        nome: r.driver?.full_name ?? "Sem condutor identificado",
        n: 0,
        total: 0,
        pend: 0,
      };
      cur.n += 1;
      cur.total += num(r.amount);
      if (!["paga", "paid", "cancelada", "recorrida"].includes(String(r.status))) cur.pend += 1;
      by.set(id, cur);
    }
    return [...by.values()]
      .sort((a, b) => b.total - a.total)
      .map((v) => ({
        condutor: v.nome,
        qtd: v.n,
        pendentes: v.pend,
        valor: formatMoney(v.total),
      }));
  }

  if (report === "cad_condutores") {
    let q = supabase
      .from("drivers")
      .select(
        "id, full_name, cpf, registration_number, bond_type, license_number, license_categories, license_expiry, active, unit:units(name)",
      )
      .order("full_name");
    if (c.unit) q = q.eq("unit_id", c.unit);
    if (c.driver) q = q.eq("id", c.driver);
    const rows = await must(q);
    const abs = await must(
      supabase
        .from("driver_absences")
        .select("driver_id, reason, start_date, expected_return, returned_at"),
    ).catch(() => [] as never[]);
    const hoje = isoToday();
    return rows.map((d) => {
      const a = abs.find(
        (x) =>
          x.driver_id === d.id &&
          hoje >= x.start_date &&
          (!x.returned_at || hoje < x.returned_at) &&
          (!x.expected_return || hoje < x.expected_return),
      );
      return {
        nome: d.full_name,
        cpf: d.cpf ? formatCPF(d.cpf) : "—",
        matricula: d.registration_number ?? "—",
        unidade: d.unit?.name ?? "—",
        vinculo: bondLabel(d.bond_type),
        cnh: d.license_number ?? "—",
        categorias: (d.license_categories ?? []).join(", ") || "—",
        validade: day(d.license_expiry),
        situacao_cnh: cnhStatus(d.license_expiry).text,
        afastamento: a
          ? `${reasonLabel(a.reason)}${a.expected_return ? ` até ${day(a.expected_return)}` : ""}`
          : "—",
        ativo: sim(d.active),
      };
    });
  }

  if (report === "cad_funcionarios") {
    let q = supabase
      .from("employees")
      .select(
        "full_name, cpf, registration, job_title, functions, active, driver_id, unit:units(name)",
      )
      .order("full_name");
    if (c.unit) q = q.eq("unit_id", c.unit);
    return (await must(q)).map((e) => ({
      nome: e.full_name,
      cpf: e.cpf ? formatCPF(e.cpf) : "—",
      matricula: e.registration ?? "—",
      cargo: e.job_title ?? "—",
      unidade: e.unit?.name ?? "—",
      funcoes: (e.functions ?? []).join(", ") || "—",
      condutor_vinculado: sim(Boolean(e.driver_id)),
      ativo: sim(e.active),
    }));
  }

  if (report === "cad_unidades") {
    const units = await must(
      supabase
        .from("units")
        .select("id, name, acronym, unit_type, manager_name, manager_role, phone, email, active")
        .order("name"),
    );
    const veh = c.has("veiculos") ? await must(supabase.from("vehicles").select("unit_id")) : [];
    const drv = c.has("condutores")
      ? await must(supabase.from("drivers").select("unit_id, active"))
      : [];
    return units.map((u) => {
      const row: Row = {
        unidade: u.name,
        sigla: u.acronym ?? "—",
        tipo: u.unit_type,
        responsavel: [u.manager_name, u.manager_role].filter(Boolean).join(" — ") || "—",
        telefone: u.phone ?? "—",
      };
      if (c.has("veiculos")) row["veiculos"] = veh.filter((x) => x.unit_id === u.id).length;
      if (c.has("condutores"))
        row["condutores"] = drv.filter((x) => x.unit_id === u.id && x.active).length;
      row["ativo"] = sim(u.active);
      return row;
    });
  }

  if (report === "afastamentos") {
    const abs = await must(
      supabase
        .from("driver_absences")
        .select(
          "reason, start_date, expected_return, returned_at, notes, driver:drivers(id, full_name, unit_id)",
        )
        .lte("start_date", c.to)
        .order("start_date", { ascending: false }),
    );
    const hoje = isoToday();
    return abs
      .filter((a) => {
        const finish = a.returned_at ?? a.expected_return ?? "9999-12-31";
        return finish >= c.from;
      })
      .filter((a) => (c.driver ? a.driver?.id === c.driver : true))
      .filter((a) => (c.unit ? a.driver?.unit_id === c.unit : true))
      .map((a) => {
        const finish = a.returned_at ?? a.expected_return;
        const emCurso =
          hoje >= a.start_date &&
          (!a.returned_at || hoje < a.returned_at) &&
          (!a.expected_return || hoje < a.expected_return);
        return {
          condutor: a.driver?.full_name ?? "—",
          motivo: reasonLabel(a.reason),
          inicio: day(a.start_date),
          previsao: day(a.expected_return),
          retorno: day(a.returned_at),
          dias: finish ? diffDays(a.start_date, finish) : "em aberto",
          situacao: emCurso ? "Afastado agora" : a.start_date > hoje ? "Programado" : "Encerrado",
          detalhe: a.notes ?? "—",
        };
      });
  }

  if (report === "cnh_vencimento") {
    let q = supabase
      .from("drivers")
      .select(
        "full_name, cpf, license_number, license_categories, license_expiry, unit:units(name)",
      )
      .eq("active", true);
    if (c.unit) q = q.eq("unit_id", c.unit);
    return (await must(q))
      .map((d) => ({ d, s: cnhStatus(d.license_expiry) }))
      .filter(({ s }) => s.text !== "Em dia")
      .sort((a, b) => (a.s.days ?? -99999) - (b.s.days ?? -99999))
      .map(({ d, s }) => ({
        nome: d.full_name,
        unidade: d.unit?.name ?? "—",
        cnh: d.license_number ?? "—",
        categorias: (d.license_categories ?? []).join(", ") || "—",
        validade: day(d.license_expiry),
        vence_em: s.days ?? "—",
        situacao_cnh: s.text,
      }));
  }

  // escala_turnos
  let q = supabase
    .from("duty_shifts")
    .select(
      "shift_date, hours, driver_id, driver:drivers(full_name, unit_id), duty_unit:duty_units(name)",
    )
    .gte("shift_date", c.from)
    .lte("shift_date", c.to);
  if (c.driver) q = q.eq("driver_id", c.driver);
  const shifts = await must(q);
  const by = new Map<
    string,
    { nome: string; plantao: string; turnos: number; horas: number; dias: Set<string> }
  >();
  for (const s of shifts) {
    if (c.unit && s.driver?.unit_id !== c.unit) continue;
    const key = `${s.driver_id}|${s.duty_unit?.name}`;
    const cur = by.get(key) ?? {
      nome: s.driver?.full_name ?? "—",
      plantao: s.duty_unit?.name ?? "—",
      turnos: 0,
      horas: 0,
      dias: new Set<string>(),
    };
    cur.turnos += 1;
    cur.horas += s.hours;
    cur.dias.add(s.shift_date);
    by.set(key, cur);
  }
  return [...by.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((v) => ({
      condutor: v.nome,
      plantao: v.plantao,
      turnos: v.turnos,
      dias_trabalhados: v.dias.size,
      horas: `${v.horas} h`,
    }));
}
