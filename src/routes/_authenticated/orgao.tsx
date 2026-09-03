import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Landmark, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { CnpjInput, CpfInput } from "@/components/form-fields";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUTHORITY_ROLES,
  ORG_TYPES,
  UF_LIST,
  supabase,
  useBrasaoUrl,
  useInvalidate,
  useOrganization,
  useProfile,
  WRITE_ROLES,
  type OrgType,
  onlyDigits,
  isValidCNPJ,
  isValidCPF,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/orgao")({
  head: () => ({
    meta: [
      { title: "Dados do Órgão — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro institucional do órgão: identificação, endereço, contatos, brasão e autoridade responsável.",
      },
      { property: "og:title", content: "Dados do Órgão — FrotaGov" },
      { property: "og:description", content: "Mantenha atualizados os dados institucionais do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Orgao,
});

const NONE = "__none__";

const schema = z.object({
  legal_name: z.string().trim().min(3, "Informe o nome oficial do órgão").max(200),
  short_name: z.string().trim().max(40).optional(),
  cnpj: z.string().trim().max(20).optional(),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(255).optional(),
  zip_code: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(255).optional(),
  website: z.string().trim().max(255).optional(),
  authority_name: z.string().trim().max(150).optional(),
  authority_cpf: z.string().trim().max(20).optional(),
  term_start: z.string().trim().optional(),
  term_end: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function Orgao() {
  const { data: org, isLoading } = useOrganization();
  const { data: me } = useProfile();
  const { data: brasao } = useBrasaoUrl(org?.logo_url);
  const invalidate = useInvalidate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [authorityRole, setAuthorityRole] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canWrite = (me?.roles ?? []).some((r) => WRITE_ROLES.includes(r));
  const type = orgType ?? org?.org_type ?? "prefeitura";
  const uf = state ?? org?.state ?? NONE;
  const authRole = authorityRole ?? org?.authority_role ?? NONE;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (PNG, JPG ou SVG).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!org) return;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    setSaving(true);

    let logoPath = org.logo_url;
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${org.id}/brasao-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("brasoes")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setSaving(false);
        toast.error("Não foi possível enviar o brasão. Tente novamente.");
        return;
      }
      logoPath = path;
    }

    const cnpjDigits = onlyDigits(d.cnpj);
    if (cnpjDigits && !isValidCNPJ(cnpjDigits)) {
      setSaving(false);
      toast.error("CNPJ inválido.");
      return;
    }
    const cpfDigits = onlyDigits(d.authority_cpf);
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      setSaving(false);
      toast.error("CPF da autoridade inválido.");
      return;
    }

    const { error } = await supabase
      .from("organizations")
      .update({
        legal_name: d.legal_name,
        short_name: d.short_name || null,
        org_type: type,
        cnpj: cnpjDigits || null,
        city: d.city || null,
        state: uf === NONE ? null : uf,
        address: d.address || null,
        zip_code: d.zip_code || null,
        phone: d.phone || null,
        email: d.email || null,
        website: d.website || null,
        logo_url: logoPath,
        authority_name: d.authority_name || null,
        authority_role: authRole === NONE ? null : authRole,
        authority_cpf: cpfDigits || null,
        term_start: d.term_start || null,
        term_end: d.term_end || null,
        notes: d.notes || null,
      })
      .eq("id", org.id);

    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar os dados do órgão.");
      return;
    }
    setFile(null);
    setPreview(null);
    toast.success("Dados do órgão atualizados.");
    invalidate(["organization", "brasao"]);
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando dados do órgão...</p>;
  }

  if (!org) {
    return (
      <>
        <PageHeader title="Dados do Órgão" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
          Nenhum órgão vinculado ao seu usuário. Solicite ao administrador da plataforma a vinculação
          da sua conta a um órgão.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dados do Órgão"
        description="Informações institucionais utilizadas no sistema e em documentos futuros."
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title mb-4 text-lg">Identificação</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="legal_name">Nome oficial *</Label>
              <Input id="legal_name" name="legal_name" defaultValue={org.legal_name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="short_name">Sigla</Label>
              <Input id="short_name" name="short_name" defaultValue={org.short_name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo do órgão</Label>
              <Select value={type} onValueChange={(v) => setOrgType(v as OrgType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <CnpjInput id="cnpj" name="cnpj" defaultValue={org.cnpj ?? ""} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title mb-4 text-lg">Endereço e contato</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="address">Endereço completo</Label>
              <Input id="address" name="address" defaultValue={org.address ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zip_code">CEP</Label>
              <Input id="zip_code" name="zip_code" defaultValue={org.zip_code ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Município</Label>
              <Input id="city" name="city" defaultValue={org.city ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Select value={uf} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {UF_LIST.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" defaultValue={org.phone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail institucional</Label>
              <Input id="email" name="email" type="email" defaultValue={org.email ?? ""} />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="website">Site institucional</Label>
              <Input id="website" name="website" defaultValue={org.website ?? ""} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title mb-4 text-lg">Brasão / logomarca</h2>
          <div className="flex flex-wrap items-center gap-5">
            {preview || brasao ? (
              <img
                src={preview ?? brasao ?? ""}
                alt="Prévia do brasão do órgão"
                className="size-24 rounded-md border bg-background object-contain p-2"
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <Landmark className="size-8" />
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!canWrite}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                {brasao ? "Trocar brasão" : "Enviar brasão"}
              </Button>
              <p className="max-w-xs text-xs text-muted-foreground">
                PNG, JPG ou SVG de até 5 MB. O arquivo fica em armazenamento privado e é exibido no
                cabeçalho do sistema.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title mb-4 text-lg">Autoridade e gestão</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="authority_name">Nome da autoridade atual</Label>
              <Input
                id="authority_name"
                name="authority_name"
                defaultValue={org.authority_name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo da autoridade</Label>
              <Select value={authRole} onValueChange={setAuthorityRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {AUTHORITY_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="authority_cpf">CPF da autoridade (opcional)</Label>
              <CpfInput id="authority_cpf" name="authority_cpf" defaultValue={org.authority_cpf ?? ""} />
              <p className="text-xs text-muted-foreground">
                Dado restrito (LGPD): não é exibido em telas públicas nem em relatórios comuns.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="term_start">Início da gestão</Label>
              <Input id="term_start" name="term_start" type="date" defaultValue={org.term_start ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="term_end">Término previsto</Label>
              <Input id="term_end" name="term_end" type="date" defaultValue={org.term_end ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={org.notes ?? ""} />
            </div>
          </div>
        </section>

        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar dados do órgão"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Seu perfil possui acesso somente para consulta destes dados.
          </p>
        )}
      </form>
    </>
  );
}
