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
  assert.equal(files.length, 121);
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

test("111 migrations históricas + 6 novas aplicam sem erro", async () => {
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
