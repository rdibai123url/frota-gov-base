/**
 * Fase 8 — funções de servidor da administração da plataforma.
 * Executam com papel de serviço somente após validar o solicitante.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------------------- utilitários ---------------------------- */

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D+/g, "") || null;

/* ------------------------------ bootstrap ---------------------------- */

/**
 * Promove o usuário autenticado a Super Admin — apenas enquanto não existir
 * nenhum Super Admin na plataforma. Fluxo seguro de primeiro acesso.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new Error("A plataforma já possui um Super Admin.");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activity_logs").insert({
      actor_id: context.userId,
      event_type: "seguranca",
      area: "Administração da Plataforma",
      action: "bootstrap_super_admin",
      summary: "Primeiro Super Admin da plataforma criado",
    });
    return { ok: true };
  });

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Ação restrita ao Super Admin da plataforma.");
  return supabaseAdmin;
}

/** Órgão em contexto do solicitante (sessão do Super Admin ou órgão do perfil). */
async function callerOrgId(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sa } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (sa) {
    const { data } = await supabaseAdmin
      .from("platform_sessions")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.organization_id ?? null;
  }
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

async function assertCanManageUsers(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "org_admin"]);
  if (!data || data.length === 0) throw new Error("Ação restrita a administradores.");
  const org = await callerOrgId(userId);
  if (!org) throw new Error("Nenhum órgão em contexto.");
  return { supabaseAdmin, organizationId: org };
}

/* --------------------------- criação de órgão ------------------------ */

type NewOrgInput = {
  legal_name: string;
  short_name?: string | null;
  cnpj?: string | null;
  org_type?: string | null;
  city?: string | null;
  state?: string | null;
  admin: {
    full_name: string;
    email: string;
    cpf?: string | null;
    phone?: string | null;
    job_title?: string | null;
  };
};

export const createOrganizationWithAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: NewOrgInput) => data)
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertSuperAdmin(context.userId);

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        legal_name: data.legal_name.trim(),
        short_name: data.short_name?.trim() || null,
        cnpj: onlyDigits(data.cnpj),
        org_type: (data.org_type as never) ?? null,
        city: data.city?.trim() || null,
        state: data.state || null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, legal_name")
      .single();
    if (orgError) throw new Error(orgError.message);

    const password = tempPassword();
    const email = data.admin.email.trim().toLowerCase();
    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: data.admin.full_name,
        organization_id: org.id,
        must_change_password: true,
      },
    });
    if (userError || !created.user) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      throw new Error(userError?.message ?? "Não foi possível criar o administrador.");
    }

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      organization_id: org.id,
      full_name: data.admin.full_name,
      email,
      cpf: onlyDigits(data.admin.cpf),
      phone: data.admin.phone?.trim() || null,
      job_title: data.admin.job_title?.trim() || null,
      active: true,
      must_change_password: true,
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, organization_id: org.id, role: "org_admin" });

    await supabaseAdmin.from("activity_logs").insert({
      organization_id: org.id,
      actor_id: context.userId,
      as_super_admin: true,
      event_type: "onboarding",
      area: "Administração da Plataforma",
      screen: "Órgãos",
      entity: "organizations",
      record_id: org.id,
      action: "INSERT",
      summary: `Órgão "${org.legal_name}" criado com administrador ${email}`,
    });

    return { organizationId: org.id, email, tempPassword: password };
  });

/* --------------------- criação de usuário do órgão -------------------- */

type NewUserInput = {
  full_name: string;
  email: string;
  cpf?: string | null;
  phone?: string | null;
  job_title?: string | null;
  unit_id?: string | null;
  role: string;
};

export const createOrgUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: NewUserInput) => data)
  .handler(async ({ data, context }) => {
    if (data.role === "super_admin") throw new Error("Perfil não permitido.");
    const { supabaseAdmin, organizationId } = await assertCanManageUsers(context.userId);

    const password = tempPassword();
    const email = data.email.trim().toLowerCase();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        organization_id: organizationId,
        must_change_password: true,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      organization_id: organizationId,
      full_name: data.full_name,
      email,
      cpf: onlyDigits(data.cpf),
      phone: data.phone?.trim() || null,
      job_title: data.job_title?.trim() || null,
      unit_id: data.unit_id || null,
      active: true,
      must_change_password: true,
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, organization_id: organizationId, role: data.role as never });

    await supabaseAdmin.from("activity_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      event_type: "usuarios",
      area: "Cadastros",
      screen: "Usuários e Permissões",
      entity: "profiles",
      record_id: created.user.id,
      action: "INSERT",
      summary: `Usuário ${email} criado com perfil ${data.role}`,
    });

    return { userId: created.user.id, email, tempPassword: password };
  });

/** Redefine o acesso de um usuário do órgão gerando nova senha temporária. */
export const resetOrgUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await assertCanManageUsers(context.userId);
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, email, organization_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target || target.organization_id !== organizationId)
      throw new Error("Usuário não pertence ao órgão em contexto.");

    const password = tempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.userId);

    await supabaseAdmin.from("activity_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      event_type: "usuarios",
      area: "Cadastros",
      screen: "Usuários e Permissões",
      entity: "profiles",
      record_id: data.userId,
      action: "RESET",
      summary: `Acesso redefinido para ${target.email}`,
    });
    return { email: target.email, tempPassword: password };
  });

/** Marca que a senha inicial foi trocada pelo próprio usuário. */
export const confirmPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    const org = await callerOrgId(context.userId);
    await supabaseAdmin.from("activity_logs").insert({
      organization_id: org,
      actor_id: context.userId,
      event_type: "seguranca",
      action: "password_changed",
      summary: "Senha inicial alterada pelo usuário",
    });
    return { ok: true };
  });

/* ---------------------------- chaves de API --------------------------- */

export const issueApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; scopes: string[]; expiresAt?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await assertCanManageUsers(context.userId);
    const raw = tempPassword() + tempPassword();
    const prefix = `fg_${crypto.randomUUID().slice(0, 8)}`;
    const key = `${prefix}.${raw}`;
    const { error } = await supabaseAdmin.from("org_api_keys").insert({
      organization_id: organizationId,
      name: data.name,
      prefix,
      key_hash: await sha256(key),
      scopes: data.scopes.length ? data.scopes : ["read"],
      expires_at: data.expiresAt || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { key };
  });
