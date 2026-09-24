/**
 * Fase 10 — Bloco 5: API pública v1 ampliada (somente leitura).
 *
 * Compatibilidade: o recurso legado /api/public/v1/frota continua ativo.
 * Aqui expomos os demais recursos sob /api/public/v1/recursos/<recurso>.
 *
 * Regras:
 * - Autenticação por chave do órgão (cabeçalho x-api-key); o organization_id
 *   vem SEMPRE da chave, nunca do cliente.
 * - Escopos por recurso; 401 sem chave válida, 403 sem escopo.
 * - Paginação, filtros por período e situação, limite de requisições por
 *   minuto e registro de auditoria em integration_logs.
 * - CPF nunca é devolvido por extenso: apenas com máscara parcial.
 */
import { createFileRoute } from "@tanstack/react-router";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const RATE_LIMIT_PER_MINUTE = 120;

/**
 * Recurso → tabela, escopo, colunas devolvidas,
 * coluna usada para filtro por data e ordenação.
 */
const RESOURCES: Record<
  string,
  {
    table: string;
    scope: string;
    columns: string;
    dateColumn?: string;
    order?: string;
    maskCpf?: string[];
  }
> = {
  veiculos: {
    table: "vehicles",
    scope: "frota:read",
    columns:
      "id, asset_code, plate, renavam, asset_class, vehicle_type, brand, model, year_manufacture, year_model, status, fuel_type, unit_id, cost_center_id, current_km, hour_meter",
    order: "asset_code",
    dateColumn: "updated_at",
  },

  equipamentos: {
    table: "vehicles",
    scope: "frota:read",
    columns:
      "id, asset_code, asset_class, equipment_type, manufacturer, model, serial_number, status, hour_meter, unit_id",
    order: "asset_code",
    dateColumn: "updated_at",
  },

  condutores: {
    table: "drivers",
    scope: "frota:read",
    columns:
      "id, full_name, registration, bond, license_category, license_expires_at, active, unit_id, cpf",
    order: "full_name",
    dateColumn: "updated_at",
    maskCpf: ["cpf"],
  },

  abastecimentos: {
    table: "fuelings",
    scope: "abastecimento:read",
    columns:
      "id, vehicle_id, fuel_type_id, supplier_id, fueled_at, quantity, unit_price, total_value, odometer_km, hour_meter, status, unit_id, cost_center_id, contract_id",
    order: "fueled_at",
    dateColumn: "fueled_at",
  },

  autorizacoes: {
    table: "fuel_authorizations",
    scope: "abastecimento:read",
    columns:
      "id, number, vehicle_id, fuel_type_id, supplier_id, status, authorized_quantity, authorized_value, valid_until, created_at",
    order: "created_at",
    dateColumn: "created_at",
  },

  contratos: {
    table: "contracts",
    scope: "contratos:read",
    columns:
      "id, number, process_number, modality, object, supplier_id, cnpj, signed_at, valid_from, valid_to, initial_value, current_value, status",
    order: "number",
    dateColumn: "updated_at",
  },

  contratos_itens: {
    table: "contract_items",
    scope: "contratos:read",
    columns:
      "id, contract_id, item_code, description, fuel_type_id, material_kind, measure_unit, quantity, unit_price, total_value, reserved_quantity, consumed_quantity, reserved_value, consumed_value, active",
    order: "item_code",
    dateColumn: "updated_at",
  },

  empenhos: {
    table: "commitments",
    scope: "contratos:read",
    columns:
      "id, number, exercise, issued_at, kind, contract_id, supplier_id, cost_center_id, unit_id, budget_allocation, resource_source, expense_element, committed_value, cancelled_value, reserved_value, consumed_value, available_value, status",
    order: "number",
    dateColumn: "updated_at",
  },

  manutencoes: {
    table: "maintenance_records",
    scope: "manutencao:read",
    columns:
      "id, code, vehicle_id, kind, status, workshop_id, entry_at, exit_at, services, total_value",
    order: "entry_at",
    dateColumn: "entry_at",
  },

  ordens_servico: {
    table: "service_orders",
    scope: "manutencao:read",
    columns:
      "id, code, quotation_id, proposal_id, request_id, maintenance_record_id, vehicle_id, unit_id, workshop_id, services, approved_value, executed_value, reserved_value, consumed_value, execution_days, deadline_at, warranty_days, expense_origin, cost_center_id, contract_id, contract_item_id, commitment_id, quota_id, issued_at, started_at, finished_at, odometer_km, hour_meter, status",
    order: "issued_at",
    dateColumn: "issued_at",
  },

  pecas: {
    table: "parts_catalog",
    scope: "manutencao:read",
    columns:
      "id, internal_code, description, brand, reference, measure_unit, category, active",
    order: "internal_code",
    dateColumn: "updated_at",
  },

  pneus: {
    table: "tires",
    scope: "manutencao:read",
    columns:
      "id, code, brand, model, size, status, vehicle_id, position, dot",
    order: "code",
    dateColumn: "updated_at",
  },

  ofp: {
    table: "supply_orders",
    scope: "almoxarifado:read",
    columns:
      "id, number, status, supplier_id, contract_id, requested_at, total_value",
    order: "requested_at",
    dateColumn: "requested_at",
  },

  estoque: {
    table: "stock_balances",
    scope: "almoxarifado:read",
    columns:
      "id, warehouse_id, part_id, quantity, reserved_quantity, minimum_quantity, average_cost",
    order: "part_id",
    dateColumn: "updated_at",
  },

  multas: {
    table: "traffic_fines",
    scope: "legal:read",
    columns:
      "id, code, vehicle_id, unit_id, driver_id, usage_id, notice_number, issuing_authority, infraction_code, description, occurred_at, location, amount, discount_amount, due_date, status, liability, responsible_name, driver_confirmed, paid_at, paid_amount, points",
    order: "occurred_at",
    dateColumn: "occurred_at",
  },

  sinistros: {
    table: "accidents",
    scope: "legal:read",
    columns:
      "id, code, vehicle_id, unit_id, driver_id, usage_id, kind, occurred_at, location, description, third_parties, has_victims, victims_notes, police_report_number, police_report_agency, damages, needs_tow, blocks_use, policy_id, deductible_value, expenses_value, maintenance_record_id, service_order_id, status, reporter_name, investigator_name, closed_at",
    order: "occurred_at",
    dateColumn: "occurred_at",
  },

  seguros: {
    table: "insurance_policies",
    scope: "legal:read",
    columns:
      "id, insurer_name, supplier_id, entity_id, policy_number, contract_id, valid_from, valid_to, premium_value, deductible_value, coverages, status",
    order: "valid_from",
    dateColumn: "valid_from",
  },

  obrigacoes: {
    table: "vehicle_obligations",
    scope: "legal:read",
    columns:
      "id, vehicle_id, obligation_type, exercise, document_number, due_date, amount, status, not_applicable, paid_at, paid_amount",
    order: "due_date",
    dateColumn: "due_date",
  },
};

const maskCpf = (v: unknown) => {
  const digits = String(v ?? "").replace(/\D/g, "");

  return digits.length === 11
    ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
    : null;
};

export const Route = createFileRoute(
  "/api/public/v1/recursos/$recurso",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const recurso = String(
          (params as { recurso: string }).recurso ?? "",
        );

        const def = RESOURCES[recurso];

        if (!def) {
          return json(
            {
              error: "Recurso não encontrado.",
              recursos_disponiveis: Object.keys(RESOURCES),
            },
            404,
          );
        }

        /*
         * -------------------------------------------------------
         * AUTENTICAÇÃO DA API
         * -------------------------------------------------------
         */

        const apiKey = request.headers.get("x-api-key");

        if (!apiKey) {
          return json(
            {
              error: "Chave de API ausente.",
            },
            401,
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const prefix = apiKey.split(".")[0] ?? "";

        const { data: key } = await supabaseAdmin
          .from("org_api_keys")
          .select(
            "id, organization_id, key_hash, scopes, expires_at, revoked_at",
          )
          .eq("prefix", prefix)
          .maybeSingle();

        if (!key || key.revoked_at) {
          return json(
            {
              error: "Chave inválida ou revogada.",
            },
            401,
          );
        }

        if (
          key.expires_at &&
          new Date(key.expires_at) < new Date()
        ) {
          return json(
            {
              error: "Chave expirada.",
            },
            401,
          );
        }

        if ((await sha256(apiKey)) !== key.key_hash) {
          return json(
            {
              error: "Chave inválida.",
            },
            401,
          );
        }

        /*
         * -------------------------------------------------------
         * VERIFICAÇÃO DE ESCOPO
         * -------------------------------------------------------
         */

        const scopes = (key.scopes as string[] | null) ?? [];

        if (
          scopes.length &&
          !scopes.includes(def.scope) &&
          !scopes.includes("*")
        ) {
          return json(
            {
              error: `Chave sem o escopo ${def.scope}.`,
            },
            403,
          );
        }

        /*
         * -------------------------------------------------------
         * RATE LIMIT
         * -------------------------------------------------------
         */

        const since = new Date(
          Date.now() - 60_000,
        ).toISOString();

        const { count: recent } = await supabaseAdmin
          .from("integration_logs")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("organization_id", key.organization_id)
          .eq("kind", "api")
          .gte("created_at", since);

        if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
          return json(
            {
              error:
                "Limite de requisições por minuto excedido.",
            },
            429,
          );
        }

        /*
         * -------------------------------------------------------
         * PARÂMETROS
         * -------------------------------------------------------
         */

        const url = new URL(request.url);

        const page = Math.max(
          1,
          Number(
            url.searchParams.get("pagina") ??
              url.searchParams.get("page") ??
              1,
          ) || 1,
        );

        const requested = Number(
          url.searchParams.get("por_pagina") ??
            url.searchParams.get("page_size") ??
            DEFAULT_PAGE_SIZE,
        );

        const pageSize = Math.min(
          MAX_PAGE_SIZE,
          Math.max(
            1,
            requested || DEFAULT_PAGE_SIZE,
          ),
        );

        const fromIndex = (page - 1) * pageSize;

        const status =
          url.searchParams.get("situacao");

        const de =
          url.searchParams.get("de");

        const ate =
          url.searchParams.get("ate");

        const alteradosDesde =
          url.searchParams.get("alterados_desde");

        /*
         * -------------------------------------------------------
         * CONSULTA
         * -------------------------------------------------------
         */

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        let q = db
          .from(def.table)
          .select(def.columns, {
            count: "exact",
          })
          .eq(
            "organization_id",
            key.organization_id,
          )
          .range(
            fromIndex,
            fromIndex + pageSize - 1,
          );

        if (def.order) {
          q = q.order(def.order);
        }

        if (status) {
          q = q.eq(
            "status",
            status as never,
          );
        }

        /*
         * vehicles contém veículos e equipamentos.
         * Aqui garantimos que cada endpoint devolva apenas
         * a classe correspondente.
         */

        if (recurso === "equipamentos") {
          q = q.eq(
            "asset_class",
            "equipamento",
          );
        }

        if (recurso === "veiculos") {
          q = q.eq(
            "asset_class",
            "veiculo",
          );
        }

        /*
         * Filtros por período.
         */

        if (de && def.dateColumn) {
          q = q.gte(
            def.dateColumn,
            de,
          );
        }

        if (ate && def.dateColumn) {
          q = q.lte(
            def.dateColumn,
            `${ate}T23:59:59`,
          );
        }

        /*
         * Filtro incremental.
         * As tabelas expostas nesta API utilizam updated_at.
         */

        if (alteradosDesde) {
          q = q.gte(
            "updated_at",
            alteradosDesde,
          );
        }

        const {
          data,
          count,
          error,
        } = await q;

        if (error) {
          console.error(
            `[public-api] recurso=${recurso}:`,
            error.message,
          );

          return json(
            {
              error:
                "Não foi possível consultar o recurso.",
            },
            500,
          );
        }

        /*
         * -------------------------------------------------------
         * TRATAMENTO DOS DADOS
         * -------------------------------------------------------
         */

        const rows =
          (data ?? []) as unknown as Record<
            string,
            unknown
          >[];

        for (const row of rows) {
          for (
            const col of def.maskCpf ?? []
          ) {
            if (col in row) {
              row[col] = maskCpf(
                row[col],
              );
            }
          }
        }

        /*
         * -------------------------------------------------------
         * AUDITORIA
         * -------------------------------------------------------
         */

        await supabaseAdmin
          .from("org_api_keys")
          .update({
            last_used_at:
              new Date().toISOString(),
          })
          .eq("id", key.id);

        await supabaseAdmin
          .from("integration_logs")
          .insert({
            organization_id:
              key.organization_id,
            kind: "api",
            operation:
              `GET /v1/recursos/${recurso}`,
            direction: "saida",
            status: "sucesso",
            message:
              `Consulta autenticada pela chave ${prefix}.`,
            records_total:
              rows.length,
            records_ok:
              rows.length,
          });

        /*
         * -------------------------------------------------------
         * RESPOSTA
         * -------------------------------------------------------
         */

        const total =
          count ?? rows.length;

        return json({
          version: "v1",
          resource: recurso,
          generated_at:
            new Date().toISOString(),

          pagination: {
            page,
            page_size:
              pageSize,
            total,
            total_pages:
              Math.max(
                1,
                Math.ceil(
                  total /
                    pageSize,
                ),
              ),
            has_next:
              fromIndex +
                rows.length <
              total,
          },

          count:
            rows.length,

          data:
            rows,
        });
      },
    },
  },
});