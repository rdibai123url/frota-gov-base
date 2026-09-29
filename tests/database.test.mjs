import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Banco em memória, sem URL/conexão externa. Auth/Storage/cron são contratos mínimos de teste,
// não implementações do serviço HTTP ou do agendador Supabase.
const db = new PGlite({ extensions: { pgcrypto } });
const root = new URL("../", import.meta.url);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1),
  B = id(2),
  user = id(10),
  auditor = id(11),
  vehicle = id(20),
  otherVehicle = id(21),
  usage = id(30);
let historicalTriggers;

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_auth_admin; CREATE ROLE supabase_storage_admin;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE SCHEMA cron;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner_id text, metadata jsonb, UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text,schedule text,command text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    GRANT USAGE ON SCHEMA public,auth,storage,extensions TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
    GRANT SELECT ON storage.buckets TO authenticated,service_role;
  `);
  const files = (await readdir(new URL("supabase/migrations/", root)))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.equal(files.length, 128);
  for (const file of files) {
    if (file.startsWith("20260925") && !historicalTriggers) {
      historicalTriggers = (
        await db.query(
          "SELECT tgname, pg_get_triggerdef(oid) def FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='public.fuelings'::regclass ORDER BY tgname",
        )
      ).rows;
    }
    let sql = await readFile(new URL(`supabase/migrations/${file}`, root), "utf8");
    // Única extensão indisponível: os jobs são registrados, jamais executados.
    sql = sql.replace(
      "CREATE EXTENSION IF NOT EXISTS pg_cron;",
      "-- pg_cron: API de agendamento simulada acima.",
    );
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${file}: ${e.message}`, { cause: e });
    }
  }
});
after(async () => {
  await db.close();
});

test("111 migrations históricas + 12 novas aplicam sem erro", async () => {
  const { rows } = await db.query(
    "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'",
  );
  assert.ok(rows[0].n > 100);
});

test("triggers de abastecimento existentes são preservados", async () => {
  const now = (
    await db.query(
      "SELECT tgname, pg_get_triggerdef(oid) def FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='public.fuelings'::regclass ORDER BY tgname",
    )
  ).rows;
  for (const old of historicalTriggers)
    assert.deepEqual(
      now.find((t) => t.tgname === old.tgname),
      old,
    );
});

test("caches sem privilégios de escrita para authenticated; bucket privado", async () => {
  const { rows } = await db.query(
    "SELECT has_table_privilege('authenticated','public.route_cache','INSERT') route,has_table_privilege('authenticated','public.geocode_cache','UPDATE') geocode,(SELECT public FROM storage.buckets WHERE id='checklist-frota') bucket",
  );
  assert.deepEqual(rows[0], { route: false, geocode: false, bucket: false });
});

test("RPCs novas não são executáveis por anon", async () => {
  for (const fn of [
    "dismiss_alert(uuid,text)",
    "resolve_stale_alerts()",
    "reserve_checklist_photo(uuid,text,bigint)",
    "confirm_checklist_photo(uuid)",
    "cancel_checklist_photo_upload(uuid)",
  ]) {
    const { rows } = await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed", [
      `public.${fn}`,
    ]);
    assert.equal(rows[0].allowed, false, fn);
  }
});

test("regras de validação de 29/09 existem no banco", async () => {
  const constraints = (
    await db.query("SELECT conname FROM pg_constraint WHERE conname = ANY($1) ORDER BY conname", [
      [
        "commitments_cancelled_within_committed",
        "commitments_exercise_range",
        "vehicles_year_order_chk",
        "maintenance_records_exit_after_entry_chk",
        "traffic_fines_discount_within_amount_chk",
        "vehicle_obligations_paid_requires_data_chk",
      ],
    ])
  ).rows.map((r) => r.conname);
  assert.equal(constraints.length, 6);

  const triggers = (
    await db.query(
      "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1) ORDER BY tgname",
      [
        [
          "trg_usages_zz_driver_overlap",
          "trg_fuelings_not_future",
          "trg_traffic_fines_not_future",
          "trg_accidents_not_future",
        ],
      ],
    )
  ).rows;
  assert.equal(triggers.length, 4);
});

test("guard_not_future recusa data futura e aceita data atual", async () => {
  await db.exec(`
    CREATE TEMP TABLE t_futuro(d timestamptz);
    CREATE TRIGGER t_guard BEFORE INSERT ON t_futuro
    FOR EACH ROW EXECUTE FUNCTION public.guard_not_future('d');
  `);
  await db.exec("INSERT INTO t_futuro VALUES (now())");
  await assert.rejects(
    db.exec("INSERT INTO t_futuro VALUES (now() + interval '2 days')"),
    /futuro/,
  );
});

test("checks de valores recusam dados inconsistentes", async () => {
  // Réplica: ignora FKs e gatilhos para exercitar só as restrições CHECK.
  await db.exec("SET session_replication_role = replica");
  try {
    await assert.rejects(
      db.exec(`INSERT INTO public.commitments (organization_id, number, exercise, issued_at, committed_value, cancelled_value)
               VALUES ('${A}', 'T-1', 2026, current_date, 1000, 5000)`),
      /commitments_cancelled_within_committed/,
    );
    await assert.rejects(
      db.exec(`INSERT INTO public.commitments (organization_id, number, exercise, issued_at, committed_value)
               VALUES ('${A}', 'T-2', 1900, current_date, 1000)`),
      /commitments_exercise_range/,
    );
  } finally {
    await db.exec("SET session_replication_role = DEFAULT");
  }
});

test("fase 2: tabelas, colunas e gatilhos de manutenção avançada existem", async () => {
  const tables = (
    await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)",
      [["approval_limits", "labor_time_standards", "maintenance_deadlines", "cleaning_rules"]],
    )
  ).rows;
  assert.equal(tables.length, 4);
  const cols = (
    await db.query(
      "SELECT table_name||'.'||column_name c FROM information_schema.columns WHERE table_schema='public' AND (table_name||'.'||column_name) = ANY($1)",
      [
        [
          "maintenance_records.entry_inspection",
          "maintenance_records.pickup_person",
          "maintenance_parts.part_origin",
          "quotation_proposals.parts_origin",
          "vehicles.factory_warranty_until",
          "external_entities.environmental_compliant",
          "maintenance_settings.max_labor_hour_value",
        ],
      ],
    )
  ).rows;
  assert.equal(cols.length, 7);
});

test("peça paralela ou recondicionada exige justificativa", async () => {
  await db.exec(`
    CREATE TEMP TABLE t_peca(origem text, nota text);
    CREATE TRIGGER t_guard BEFORE INSERT ON t_peca
    FOR EACH ROW EXECUTE FUNCTION public.guard_part_origin('origem', 'nota');
  `);
  await db.exec("INSERT INTO t_peca VALUES ('genuina', NULL), ('original', NULL)");
  await db.exec("INSERT INTO t_peca VALUES ('paralela', 'Aprovada pelo gestor: mais barata')");
  await assert.rejects(db.exec("INSERT INTO t_peca VALUES ('paralela', NULL)"), /paralela/);
  await assert.rejects(
    db.exec("INSERT INTO t_peca VALUES ('recondicionada', '  ')"),
    /recondicionada/,
  );
});

test("alçada: sem limite cadastrado não restringe; com limite aplica ao perfil", async () => {
  const org = id(900);
  const gestor = id(901);
  const admin = id(902);
  await db.exec("SET session_replication_role = replica");
  try {
    await db.exec(`INSERT INTO public.user_roles (user_id, role, organization_id) VALUES
      ('${gestor}', 'fleet_manager', '${org}'), ('${admin}', 'org_admin', '${org}')`);
    const semLimite = await db.query(
      `SELECT public.approval_limit_for('${gestor}', '${org}', NULL) v`,
    );
    assert.equal(semLimite.rows[0].v, null);

    await db.exec(`INSERT INTO public.approval_limits (organization_id, role, scope, max_value)
      VALUES ('${org}', 'fleet_manager', 'manutencao', 5000)`);
    const comLimite = await db.query(
      `SELECT public.approval_limit_for('${gestor}', '${org}', NULL) v`,
    );
    assert.equal(Number(comLimite.rows[0].v), 5000);
    const adminLivre = await db.query(
      `SELECT public.approval_limit_for('${admin}', '${org}', NULL) v`,
    );
    assert.equal(adminLivre.rows[0].v, null);
  } finally {
    await db.exec("SET session_replication_role = DEFAULT");
  }
});

test("fase 3: fatura calcula taxa de administração, glosa, líquido e respeita a situação", async () => {
  const org = id(950);
  const inv = id(951);
  for (const t of ["billing_invoices", "billing_invoice_items"])
    await db.exec(`ALTER TABLE public.${t} DISABLE TRIGGER ALL`);
  for (const [t, g] of [
    ["billing_invoices", "trg_billing_invoice_totals"],
    ["billing_invoices", "trg_billing_invoice_delete_guard"],
    ["billing_invoice_items", "trg_billing_item_guard"],
    ["billing_invoice_items", "trg_billing_item_after"],
  ])
    await db.exec(`ALTER TABLE public.${t} ENABLE TRIGGER ${g}`);

  await db.exec(`INSERT INTO public.billing_invoices
    (id, organization_id, code, reference_month, period_start, period_end, admin_fee_percent, withholding_value)
    VALUES ('${inv}', '${org}', 'FAT-T-1', '2026-09-01', '2026-09-01', '2026-09-30', 2.5, 30)`);
  await db.exec(`INSERT INTO public.billing_invoice_items
    (organization_id, invoice_id, source_type, description, amount, glosa_value, glosa_reason) VALUES
    ('${org}', '${inv}', 'manutencao', 'Troca de pastilhas', 1000, 100, 'Preço acima da tabela'),
    ('${org}', '${inv}', 'abastecimento', 'Diesel S10', 500, 0, NULL)`);
  let r = (await db.query(`SELECT * FROM public.billing_invoices WHERE id='${inv}'`)).rows[0];
  assert.equal(Number(r.items_total), 1500);
  assert.equal(Number(r.glosa_total), 100);
  assert.equal(Number(r.admin_fee_value), 35); // (1500-100) x 2,5%
  assert.equal(Number(r.net_total), 1405); // 1400 + 35 - 30

  // taxa negativa (desconto)
  await db.exec(`UPDATE public.billing_invoices SET admin_fee_percent = -2 WHERE id='${inv}'`);
  r = (await db.query(`SELECT * FROM public.billing_invoices WHERE id='${inv}'`)).rows[0];
  assert.equal(Number(r.admin_fee_value), -28);
  assert.equal(Number(r.net_total), 1342);

  // glosa exige motivo e não pode passar do valor do item
  await assert.rejects(
    db.exec(`INSERT INTO public.billing_invoice_items (organization_id, invoice_id, source_type, description, amount, glosa_value)
             VALUES ('${org}', '${inv}', 'outro', 'x', 100, 10)`),
    /billing_items_glosa_reason_chk/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.billing_invoice_items (organization_id, invoice_id, source_type, description, amount, glosa_value, glosa_reason)
             VALUES ('${org}', '${inv}', 'outro', 'x', 100, 200, 'motivo')`),
    /billing_items_glosa_within_chk/,
  );

  // situação: conferir exige NF; pagar exige conferida e data
  await assert.rejects(
    db.exec(`UPDATE public.billing_invoices SET status='conferida' WHERE id='${inv}'`),
    /nota fiscal/,
  );
  await db.exec(
    `UPDATE public.billing_invoices SET status='conferida', nf_number='123', nf_value=1342 WHERE id='${inv}'`,
  );
  await assert.rejects(
    db.exec(`UPDATE public.billing_invoices SET status='paga' WHERE id='${inv}'`),
    /data do pagamento/,
  );
  await db.exec(
    `UPDATE public.billing_invoices SET status='paga', paid_at='2026-10-05' WHERE id='${inv}'`,
  );
  await assert.rejects(
    db.exec(`UPDATE public.billing_invoices SET withholding_value = 1 WHERE id='${inv}'`),
    /paga ou cancelada/,
  );
  await assert.rejects(
    db.exec(`DELETE FROM public.billing_invoice_items WHERE invoice_id='${inv}'`),
    /paga ou cancelada/,
  );
  await assert.rejects(db.exec(`DELETE FROM public.billing_invoices WHERE id='${inv}'`), /paga/);
});

test("fase 3: nota final do IMR segue o exemplo do edital do DNIT", async () => {
  const org = id(960);
  const contract = id(961);
  for (const t of ["service_level_indicators", "service_level_results"])
    await db.exec(`ALTER TABLE public.${t} DISABLE TRIGGER ALL`);
  await db.exec("ALTER TABLE public.service_level_results ENABLE TRIGGER trg_service_level_score");
  const ind = (n) => id(970 + n);
  await db.exec(`INSERT INTO public.service_level_indicators
    (id, organization_id, contract_id, code, name, block, block_weight, weight_in_block, target_value, kind) VALUES
    ('${ind(1)}', '${org}', '${contract}', 'I01', 'Disponibilidade da rede', 'abastecimento', 45, 100, 99, 'percent_min'),
    ('${ind(2)}', '${org}', '${contract}', 'I02', 'Cobertura da manutenção', 'manutencao', 40, 70, 98, 'percent_min'),
    ('${ind(3)}', '${org}', '${contract}', 'I03', 'Prazo de cotação', 'manutencao', 40, 30, 90, 'percent_min'),
    ('${ind(4)}', '${org}', '${contract}', 'I04', 'Conformidade da lavagem', 'lavagem', 15, 100, 0, 'ocorrencias_max')`);
  await db.exec(`INSERT INTO public.service_level_results
    (organization_id, contract_id, indicator_id, reference_month, measured_value) VALUES
    ('${org}', '${contract}', '${ind(1)}', '2026-09-15', 90),
    ('${org}', '${contract}', '${ind(2)}', '2026-09-15', 98),
    ('${org}', '${contract}', '${ind(3)}', '2026-09-15', 81),
    ('${org}', '${contract}', '${ind(4)}', '2026-09-15', 1)`);
  const scores = (
    await db.query(
      `SELECT i.code, r.score FROM public.service_level_results r JOIN public.service_level_indicators i ON i.id=r.indicator_id ORDER BY i.code`,
    )
  ).rows.map((x) => [x.code, Number(x.score)]);
  assert.deepEqual(scores, [
    ["I01", 9.09],
    ["I02", 10],
    ["I03", 9],
    ["I04", 5],
  ]);
  const g = await db.query(`SELECT public.imr_final_grade('${contract}', '2026-09-01') g`);
  assert.equal(Number(g.rows[0].g), 8.72);
});

test("fase 6: rastreador envia posição, gera alertas e recusa token inválido", async () => {
  const org = id(980);
  const veh = id(981);
  const dev = id(982);
  for (const t of [
    "tracking_devices",
    "tracking_positions",
    "tracking_alerts",
    "tracking_geofences",
  ])
    await db.exec(`ALTER TABLE public.${t} DISABLE TRIGGER ALL`);
  const token = "tok_teste_1234567890_abcdefghij";
  await db.exec(`INSERT INTO public.tracking_devices (id, organization_id, vehicle_id, token_hash)
    VALUES ('${dev}', '${org}', '${veh}', encode(sha256(convert_to('${token}', 'UTF8')), 'hex'))`);
  await db.exec(`INSERT INTO public.tracking_geofences (organization_id, name, center_lat, center_lng, radius_m, alert_on)
    VALUES ('${org}', 'Pátio', -23.55, -46.63, 500, 'saida')`);

  await assert.rejects(
    db.query(
      `SELECT public.tracking_ingest('token-errado-com-mais-de-24-caracteres', '{"lat":1,"lng":1}')`,
    ),
    /Token inválido/,
  );
  await assert.rejects(
    db.query(`SELECT public.tracking_ingest('${token}', '{"lat":95,"lng":1}')`),
    /Coordenadas inválidas/,
  );

  // dentro do pátio, velocidade normal: sem alerta
  let r = await db.query(
    `SELECT public.tracking_ingest('${token}', '{"lat":-23.55,"lng":-46.63,"speed_kmh":30,"battery_v":12.6,"ignition":true,"recorded_at":"2026-09-29T10:00:00Z"}') r`,
  );
  assert.equal(r.rows[0].r.alerts, 0);

  // saiu do pátio (~5 km), acima de 110 km/h e bateria baixa: 3 alertas
  r = await db.query(
    `SELECT public.tracking_ingest('${token}', '{"lat":-23.60,"lng":-46.66,"speed_kmh":130,"battery_v":10.9,"recorded_at":"2026-09-29T10:05:00Z"}') r`,
  );
  assert.equal(r.rows[0].r.alerts, 3);
  const kinds = (await db.query("SELECT kind FROM public.tracking_alerts ORDER BY kind")).rows.map(
    (x) => x.kind,
  );
  assert.deepEqual(kinds, ["bateria_baixa", "excesso_velocidade", "saida_geocerca"]);

  // repetir o excesso dentro de 15 min não duplica o alerta
  r = await db.query(
    `SELECT public.tracking_ingest('${token}', '{"lat":-23.61,"lng":-46.67,"speed_kmh":135,"recorded_at":"2026-09-29T10:08:00Z"}') r`,
  );
  assert.equal(r.rows[0].r.alerts, 0);

  const seen = await db.query("SELECT last_seen_at FROM public.tracking_devices WHERE id=$1", [
    dev,
  ]);
  assert.ok(seen.rows[0].last_seen_at);
});

test("avisos de vencimento: lista CNH e seguro vencendo conforme os prazos", async () => {
  const org = id(990);
  for (const t of ["drivers", "insurance_policies", "notification_settings"])
    await db.exec(`ALTER TABLE public.${t} DISABLE TRIGGER ALL`);
  await db.exec(`INSERT INTO public.drivers (organization_id, full_name, active, license_expiry, phone) VALUES
    ('${org}', 'Vencida Silva', true, current_date - 3, '11999990000'),
    ('${org}', 'Vence Logo', true, current_date + 10, NULL),
    ('${org}', 'Longe Ainda', true, current_date + 200, NULL),
    ('${org}', 'Inativo', false, current_date - 5, NULL)`);
  await db.exec(`INSERT INTO public.insurance_policies (organization_id, policy_number, insurer_name, valid_from, valid_to, status)
    VALUES ('${org}', 'AP-1', 'Seguradora X', current_date - 300, current_date + 20, 'ativa')`);
  const r = await db.query(`SELECT kind, title, detail, days FROM public.notification_items('${org}') ORDER BY kind, days`);
  assert.deepEqual(
    r.rows.map((x) => [x.kind, x.title, x.detail]),
    [
      ["cnh", "Vencida Silva", "CNH vencida"],
      ["cnh", "Vence Logo", "CNH vence"],
      ["seguro", "Apólice AP-1 — Seguradora X", "Seguro vence"],
    ],
  );
  // prazo maior passa a incluir a CNH distante
  await db.exec(`INSERT INTO public.notification_settings (organization_id, cnh_days) VALUES ('${org}', 250)`);
  const r2 = await db.query(`SELECT count(*)::int n FROM public.notification_items('${org}') WHERE kind='cnh'`);
  assert.equal(r2.rows[0].n, 3);
});

test("assinatura eletrônica: imutável, código único e conferência pública", async () => {
  const org = id(995);
  await db.exec("ALTER TABLE public.electronic_signatures DISABLE TRIGGER USER");
  await db.exec("ALTER TABLE public.electronic_signatures DISABLE TRIGGER ALL");
  await db.exec("ALTER TABLE public.electronic_signatures ENABLE TRIGGER electronic_signatures_no_change");
  await db.exec(`INSERT INTO public.electronic_signatures
    (organization_id, doc_type, doc_id, doc_label, doc_hash, signer_id, signer_name, verification_code)
    VALUES ('${org}', 'ordem_servico', '${id(996)}', 'OS-2026-0001', '${"a".repeat(64)}', '${id(997)}', 'Fulano', 'ABCD1234')`);
  await assert.rejects(
    db.exec(`UPDATE public.electronic_signatures SET signer_name='X' WHERE verification_code='ABCD1234'`),
    /não podem ser alteradas/,
  );
  await assert.rejects(
    db.exec(`DELETE FROM public.electronic_signatures WHERE verification_code='ABCD1234'`),
    /não podem ser alteradas/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.electronic_signatures
      (organization_id, doc_type, doc_id, doc_label, doc_hash, signer_id, signer_name, verification_code)
      VALUES ('${org}', 'ordem_servico', '${id(996)}', 'OS', '${"b".repeat(64)}', '${id(997)}', 'Fulano', 'ZZZZ0000')`),
    /duplicate key/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.electronic_signatures
      (organization_id, doc_type, doc_id, doc_label, doc_hash, signer_id, signer_name, verification_code)
      VALUES ('${org}', 'ordem_servico', '${id(998)}', 'OS', 'curto', '${id(997)}', 'Fulano', 'QQQQ0000')`),
    /doc_hash/,
  );
});

test("perfis de acesso: administrador nunca é bloqueado e cada tela/perfil é único", async () => {
  await db.exec("ALTER TABLE public.org_role_access DISABLE TRIGGER ALL");
  const org = id(1001);
  await db.exec(`INSERT INTO public.org_role_access (organization_id, module_key, role, allowed)
    VALUES ('${org}', 'faturamento', 'operator', false)`);
  await assert.rejects(
    db.exec(`INSERT INTO public.org_role_access (organization_id, module_key, role, allowed)
      VALUES ('${org}', 'faturamento', 'operator', true)`),
    /duplicate key/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.org_role_access (organization_id, module_key, role, allowed)
      VALUES ('${org}', 'usuarios', 'org_admin', false)`),
    /org_role_access_admin_chk/,
  );
});


test("viagem: custos extras não podem ser negativos", async () => {
  await db.exec("ALTER TABLE public.vehicle_usages DISABLE TRIGGER ALL");
  await assert.rejects(
    db.exec(`INSERT INTO public.vehicle_usages (organization_id, vehicle_id, planned_departure, toll_value)
      VALUES ('${id(1020)}', '${id(1021)}', now(), -5)`),
    /vehicle_usages_trip_costs_chk/,
  );
});

test("licença: plano limita a quantidade de veículos por órgão", async () => {
  const org = id(1030);
  await db.exec("ALTER TABLE public.vehicles DISABLE TRIGGER ALL");
  await db.exec("ALTER TABLE public.vehicles ENABLE TRIGGER vehicle_license_limit");
  await db.exec("ALTER TABLE public.organization_license DISABLE TRIGGER ALL");
  await db.exec(`INSERT INTO public.organization_license (organization_id, plan_name, max_vehicles)
    VALUES ('${org}', 'Teste', 2)`);
  await db.exec(`INSERT INTO public.vehicles (organization_id, plate) VALUES ('${org}', 'AAA1A11'), ('${org}', 'BBB2B22')`);
  await assert.rejects(
    db.exec(`INSERT INTO public.vehicles (organization_id, plate) VALUES ('${org}', 'CCC3C33')`),
    /Limite de 2 veículo/,
  );
  // outro órgão, sem plano cadastrado, não tem limite
  await db.exec(`INSERT INTO public.vehicles (organization_id, plate) VALUES ('${id(1031)}', 'DDD4D44'), ('${id(1031)}', 'EEE5E55'), ('${id(1031)}', 'FFF6F66')`);
});
