/**
 * Prestação de contas: pacotes de dados por exercício (ano) em layout padronizado do FrotaGov,
 * prontos para enviar ao Tribunal de Contas, à controladoria ou ao órgão de auditoria.
 *
 * Cada Tribunal de Contas tem seu próprio leiaute oficial. Estes pacotes trazem os dados na
 * ordem e com os nomes mais comuns; quando o órgão for obrigado a um leiaute específico, o
 * mapeamento é feito sobre estes mesmos campos.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReportColumn, ReportRow } from "@/lib/reports";

export type Dataset = {
  key: string;
  label: string;
  description: string;
  columns: ReportColumn[];
  fetch: (year: number) => Promise<ReportRow[]>;
};

const LIMIT = 20000;
const range = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });
const ts = (year: number) => ({ from: `${year}-01-01T00:00:00`, to: `${year}-12-31T23:59:59` });
const d = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
const n = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : Number(v);

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const DATASETS: Dataset[] = [
  {
    key: "bens",
    label: "Bens — veículos e equipamentos",
    description: "Relação dos veículos e equipamentos do órgão, com dados de aquisição e situação.",
    columns: [
      { key: "placa", label: "Placa" },
      { key: "patrimonio", label: "Patrimônio" },
      { key: "chassi", label: "Chassi" },
      { key: "renavam", label: "Renavam" },
      { key: "marca", label: "Marca" },
      { key: "modelo", label: "Modelo" },
      { key: "ano_fabricacao", label: "Ano de fabricação" },
      { key: "ano_modelo", label: "Ano do modelo" },
      { key: "combustivel", label: "Combustível" },
      { key: "data_aquisicao", label: "Data de aquisição" },
      { key: "valor_aquisicao", label: "Valor de aquisição" },
      { key: "quilometragem", label: "Quilometragem atual" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("plate")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((v) => ({
        placa: v.plate ?? "",
        patrimonio: v.asset_code ?? "",
        chassi: v.chassis ?? "",
        renavam: v.renavam ?? "",
        marca: v.brand ?? "",
        modelo: v.model ?? "",
        ano_fabricacao: n(v.year_manufacture),
        ano_modelo: n(v.year_model),
        combustivel: v.fuel_type ?? "",
        data_aquisicao: d(v.acquisition_date),
        valor_aquisicao: n(v.acquisition_value),
        quilometragem: n(v.current_km),
        situacao: v.status,
      }));
    },
  },
  {
    key: "abastecimentos",
    label: "Abastecimentos",
    description: "Todos os abastecimentos válidos do exercício, com valores e documento fiscal.",
    columns: [
      { key: "data", label: "Data" },
      { key: "placa", label: "Placa" },
      { key: "combustivel", label: "Combustível" },
      { key: "quantidade", label: "Quantidade" },
      { key: "preco_unitario", label: "Preço unitário" },
      { key: "valor_total", label: "Valor total" },
      { key: "quilometragem", label: "Quilometragem" },
      { key: "nota_fiscal", label: "Nota fiscal" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "contrato", label: "Contrato" },
      { key: "empenho", label: "Empenho" },
      { key: "secretaria", label: "Secretaria / unidade" },
    ],
    fetch: async (year) => {
      const { from, to } = ts(year);
      const { data, error } = await supabase
        .from("fuelings")
        .select(
          "fueled_at, quantity, unit_price, total_value, odometer_km, invoice_number, vehicle:vehicles(plate), fuel:fuel_types(name), supplier:suppliers(legal_name), contract:contracts(number), commitment:commitments(number), unit:units(name)",
        )
        .eq("status", "valido")
        .gte("fueled_at", from)
        .lte("fueled_at", to)
        .order("fueled_at")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((f) => ({
        data: d(f.fueled_at),
        placa: f.vehicle?.plate ?? "",
        combustivel: f.fuel?.name ?? "",
        quantidade: n(f.quantity),
        preco_unitario: n(f.unit_price),
        valor_total: n(f.total_value),
        quilometragem: n(f.odometer_km),
        nota_fiscal: f.invoice_number ?? "",
        fornecedor: f.supplier?.legal_name ?? "",
        contrato: f.contract?.number ?? "",
        empenho: f.commitment?.number ?? "",
        secretaria: f.unit?.name ?? "",
      }));
    },
  },
  {
    key: "manutencoes",
    label: "Manutenções",
    description: "Manutenções do exercício, com peças, mão de obra, fornecedor e nota fiscal.",
    columns: [
      { key: "codigo", label: "Código" },
      { key: "placa", label: "Placa" },
      { key: "tipo", label: "Tipo" },
      { key: "entrada", label: "Entrada" },
      { key: "saida", label: "Saída" },
      { key: "servicos", label: "Serviços" },
      { key: "pecas", label: "Peças" },
      { key: "mao_de_obra", label: "Mão de obra" },
      { key: "outros", label: "Outros" },
      { key: "valor_total", label: "Valor total" },
      { key: "nota_fiscal", label: "Nota fiscal" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "contrato", label: "Contrato" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async (year) => {
      const { from, to } = ts(year);
      const { data, error } = await supabase
        .from("maintenance_records")
        .select(
          "code, kind, entry_at, exit_at, services, parts_value, labor_value, other_value, total_value, invoice_number, status, vehicle:vehicles(plate), supplier:suppliers(legal_name), contract:contracts(number)",
        )
        .neq("status", "cancelada")
        .gte("entry_at", from)
        .lte("entry_at", to)
        .order("entry_at")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((m) => ({
        codigo: m.code ?? "",
        placa: m.vehicle?.plate ?? "",
        tipo: m.kind ?? "",
        entrada: d(m.entry_at),
        saida: d(m.exit_at),
        servicos: m.services,
        pecas: n(m.parts_value),
        mao_de_obra: n(m.labor_value),
        outros: n(m.other_value),
        valor_total: n(m.total_value),
        nota_fiscal: m.invoice_number ?? "",
        fornecedor: m.supplier?.legal_name ?? "",
        contrato: m.contract?.number ?? "",
        situacao: m.status,
      }));
    },
  },
  {
    key: "contratos",
    label: "Contratos",
    description: "Contratos com vigência no exercício e seus valores.",
    columns: [
      { key: "numero", label: "Número" },
      { key: "processo", label: "Processo" },
      { key: "modalidade", label: "Modalidade" },
      { key: "objeto", label: "Objeto" },
      { key: "cnpj", label: "CNPJ do contratado" },
      { key: "assinatura", label: "Data de assinatura" },
      { key: "inicio", label: "Início da vigência" },
      { key: "fim", label: "Fim da vigência" },
      { key: "valor_inicial", label: "Valor inicial" },
      { key: "valor_atual", label: "Valor atual" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async (year) => {
      const { from, to } = range(year);
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .lte("valid_from", to)
        .or(`valid_to.is.null,valid_to.gte.${from}`)
        .order("number")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((c) => ({
        numero: c.number,
        processo: c.process_number ?? "",
        modalidade: c.modality,
        objeto: c.object,
        cnpj: c.cnpj ?? "",
        assinatura: d(c.signed_at),
        inicio: d(c.valid_from),
        fim: d(c.valid_to),
        valor_inicial: n(c.initial_value),
        valor_atual: n(c.current_value),
        situacao: c.status,
      }));
    },
  },
  {
    key: "empenhos",
    label: "Empenhos",
    description: "Empenhos do exercício: valores empenhados, consumidos e saldo.",
    columns: [
      { key: "numero", label: "Número" },
      { key: "exercicio", label: "Exercício" },
      { key: "emissao", label: "Data de emissão" },
      { key: "dotacao", label: "Dotação orçamentária" },
      { key: "elemento", label: "Elemento de despesa" },
      { key: "fonte", label: "Fonte de recurso" },
      { key: "empenhado", label: "Valor empenhado" },
      { key: "consumido", label: "Valor consumido" },
      { key: "anulado", label: "Valor anulado" },
      { key: "disponivel", label: "Saldo disponível" },
      { key: "contrato", label: "Contrato" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async (year) => {
      const { data, error } = await supabase
        .from("commitments")
        .select("*, contract:contracts(number)")
        .eq("exercise", year)
        .order("number")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((c) => ({
        numero: c.number,
        exercicio: c.exercise,
        emissao: d(c.issued_at),
        dotacao: c.budget_allocation ?? "",
        elemento: c.expense_element ?? "",
        fonte: c.resource_source ?? "",
        empenhado: n(c.committed_value),
        consumido: n(c.consumed_value),
        anulado: n(c.cancelled_value),
        disponivel: n(c.available_value),
        contrato: c.contract?.number ?? "",
        situacao: c.status,
      }));
    },
  },
  {
    key: "multas",
    label: "Multas de trânsito",
    description: "Autos de infração do exercício, responsável e situação de pagamento.",
    columns: [
      { key: "auto", label: "Número do auto" },
      { key: "data", label: "Data da infração" },
      { key: "placa", label: "Placa" },
      { key: "orgao_autuador", label: "Órgão autuador" },
      { key: "codigo_infracao", label: "Código da infração" },
      { key: "descricao", label: "Descrição" },
      { key: "pontos", label: "Pontos" },
      { key: "valor", label: "Valor" },
      { key: "vencimento", label: "Vencimento" },
      { key: "pago_em", label: "Pago em" },
      { key: "valor_pago", label: "Valor pago" },
      { key: "responsavel", label: "Responsável" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async (year) => {
      const { from, to } = ts(year);
      const { data, error } = await supabase
        .from("traffic_fines")
        .select("*, vehicle:vehicles(plate)")
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((f) => ({
        auto: f.notice_number,
        data: d(f.occurred_at),
        placa: f.vehicle?.plate ?? "",
        orgao_autuador: f.issuing_authority,
        codigo_infracao: f.infraction_code ?? "",
        descricao: f.description,
        pontos: n(f.points),
        valor: n(f.amount),
        vencimento: d(f.due_date),
        pago_em: d(f.paid_at),
        valor_pago: n(f.paid_amount),
        responsavel: f.responsible_name ?? "",
        situacao: f.status,
      }));
    },
  },
  {
    key: "sinistros",
    label: "Acidentes e sinistros",
    description: "Ocorrências do exercício, com boletim de ocorrência e valores.",
    columns: [
      { key: "codigo", label: "Código" },
      { key: "data", label: "Data" },
      { key: "placa", label: "Placa" },
      { key: "tipo", label: "Tipo" },
      { key: "local", label: "Local" },
      { key: "descricao", label: "Descrição" },
      { key: "boletim", label: "Boletim de ocorrência" },
      { key: "vitimas", label: "Com vítimas" },
      { key: "despesas", label: "Despesas" },
      { key: "situacao", label: "Situação" },
    ],
    fetch: async (year) => {
      const { from, to } = ts(year);
      const { data, error } = await supabase
        .from("accidents")
        .select("*, vehicle:vehicles(plate)")
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at")
        .limit(LIMIT);
      fail(error);
      return (data ?? []).map((a) => ({
        codigo: a.code ?? "",
        data: d(a.occurred_at),
        placa: a.vehicle?.plate ?? "",
        tipo: a.kind,
        local: a.location ?? "",
        descricao: a.description,
        boletim: a.police_report_number ?? "",
        vitimas: a.has_victims ? "Sim" : "Não",
        despesas: n(a.expenses_value),
        situacao: a.status,
      }));
    },
  },
];
