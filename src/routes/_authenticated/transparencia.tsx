import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase, useActiveOrgId, useInvalidate, usePerms } from "@/lib/frotagov";
import { useTransparencySettings } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/transparencia")({
  head: () => ({
    meta: [
      { title: "Portal da Transparência — FrotaGov" },
      {
        name: "description",
        content:
          "Configure a publicação de dados agregados da frota no portal público do órgão, sem expor dados pessoais.",
      },
      { property: "og:title", content: "Portal da Transparência — FrotaGov" },
      { property: "og:description", content: "Publicação opcional de indicadores agregados da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Transparencia,
});

const DATASETS = [
  { key: "frota", label: "Frota (quantidade de veículos por situação)" },
  { key: "abastecimento", label: "Abastecimento (litros e valores agregados)" },
  { key: "manutencao", label: "Manutenção (quantidade e valores agregados)" },
  { key: "contratos", label: "Contratos (número, objeto e vigência)" },
];

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function Transparencia() {
  const { data: settings } = useTransparencySettings();
  const { data: orgId } = useActiveOrgId();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const canManage = perms.roles.includes("org_admin") || perms.roles.includes("super_admin");
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [datasets, setDatasets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setSlug(settings.slug ?? "");
    setHeadline(settings.headline ?? "");
    setDatasets((settings.datasets as Record<string, boolean>) ?? {});
  }, [settings]);

  async function save() {
    if (!orgId) return;
    if (enabled && !slug) {
      toast.error("Informe o endereço público (slug) para publicar o portal.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("transparency_settings").upsert({
      organization_id: orgId,
      enabled,
      slug: slug || null,
      headline: headline || null,
      datasets,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações do portal.");
      return;
    }
    toast.success("Portal da Transparência atualizado.");
    invalidate(["transparency-settings"]);
  }

  return (
    <>
      <PageHeader
        title="Portal da Transparência"
        description="Publicação opcional de dados agregados da frota. Desabilitado por padrão e sem dados pessoais."
      />

      {!canManage && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>Somente o Administrador do Órgão pode alterar a publicação de dados abertos.</p>
        </div>
      )}

      <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Publicação ativa</Label>
            <p className="text-xs text-muted-foreground">
              Enquanto desativada, nenhuma informação do órgão fica acessível publicamente.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Endereço público</Label>
          <div className="flex gap-2">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="prefeitura-exemplo"
              disabled={!canManage}
            />
            {slug && (
              <Button asChild variant="outline" size="icon">
                <a href={`/transparencia/${slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">/transparencia/{slug || "seu-endereco"}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="headline">Texto de apresentação</Label>
          <Textarea
            id="headline"
            rows={3}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            disabled={!canManage}
          />
        </div>

        <div className="space-y-2">
          <Label>Conjuntos de dados publicados</Label>
          {DATASETS.map((d) => (
            <div key={d.key} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{d.label}</span>
              <Switch
                checked={!!datasets[d.key]}
                onCheckedChange={(v) => setDatasets((prev) => ({ ...prev, [d.key]: v }))}
                disabled={!canManage}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Apenas números agregados são publicados. Placas, nomes de condutores, CPF, CNH e demais
            dados pessoais nunca são expostos.
          </p>
        </div>

        <Button onClick={save} disabled={!canManage || saving}>
          Salvar configurações
        </Button>
      </div>
    </>
  );
}
