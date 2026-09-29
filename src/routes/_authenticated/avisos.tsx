import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { sendDigestNow } from "@/lib/avisos.functions";
import { dateBR, dateTimeBR, dbMessage, useInvalidate, usePerms } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos de vencimento — Dibai Fleet" },
      {
        name: "description",
        content:
          "Lista do que está vencido ou perto de vencer (CNH, seguro, contrato, revisão, obrigações) e envio automático por e-mail.",
      },
    ],
  }),
  component: Avisos,
});

const KIND: Record<string, string> = {
  cnh: "CNH",
  seguro: "Seguro",
  contrato: "Contrato",
  obrigacao: "Obrigação legal",
  garantia: "Garantia",
  revisao: "Revisão",
};

type Item = {
  kind: string;
  title: string;
  detail: string;
  due_date: string;
  days: number;
  phone: string | null;
};

const whenText = (d: number) =>
  d < 0 ? `venceu há ${Math.abs(d)} dia(s)` : d === 0 ? "vence hoje" : `vence em ${d} dia(s)`;

const waText = (i: Item) =>
  `Dibai Fleet: ${i.title} — ${i.detail}, ${whenText(i.days)} (${dateBR(i.due_date)}). Por favor, regularize.`;

function Avisos() {
  const { orgId, canManageFinance, userId } = usePerms();
  const invalidate = useInvalidate();
  const send = useServerFn(sendDigestNow);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freq, setFreq] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const items = useQuery({
    queryKey: ["notification-items", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notification_items", { _org: orgId as string });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const log = useQuery({
    queryKey: ["notification-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const s = settings.data;
  const list = [...(items.data ?? [])].sort((a, b) => a.days - b.days);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const fd = new FormData(e.currentTarget);
    const recipients = String(fd.get("recipients") ?? "")
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const bad = recipients.find((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r));
    if (bad) {
      toast.error(`E-mail inválido: ${bad}`);
      return;
    }
    const num = (k: string, min: number, max: number) =>
      Math.min(
        max,
        Math.max(min, Math.round(Number(String(fd.get(k) ?? "").replace(",", ".")) || min)),
      );
    setSaving(true);
    const { error } = await supabase.from("notification_settings").upsert(
      {
        organization_id: orgId,
        email_enabled: enabled ?? s?.email_enabled ?? false,
        recipients,
        frequency: freq ?? s?.frequency ?? "semanal",
        cnh_days: num("cnh_days", 1, 365),
        insurance_days: num("insurance_days", 1, 365),
        contract_days: num("contract_days", 1, 365),
        obligation_days: num("obligation_days", 1, 365),
        warranty_days: num("warranty_days", 1, 365),
        preventive_days: num("preventive_days", 1, 365),
        preventive_km: num("preventive_km", 0, 100000),
        updated_by: userId,
      },
      { onConflict: "organization_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Configuração salva.");
    invalidate(["notification-settings", "notification-items"]);
  }

  async function sendNow() {
    setSending(true);
    try {
      const r = await send();
      if (r.status === "enviado") toast.success(r.message);
      else if (r.status === "sem_itens") toast.info("Nada vencendo: nenhum e-mail foi enviado.");
      else toast.error(r.message);
      invalidate(["notification-log", "notification-settings"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setSending(false);
    }
  }

  const summary = list.length
    ? `Dibai Fleet — ${list.length} aviso(s):\n` +
      list.map((i) => `• ${waText(i).replace("Dibai Fleet: ", "")}`).join("\n")
    : "";

  const field = (id: string, label: string, value: number, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        inputMode="numeric"
        defaultValue={String(value)}
        disabled={!canManageFinance}
      />
      {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avisos de vencimento"
        description="Veja o que está vencido ou perto de vencer e receba um resumo por e-mail, sem precisar abrir o sistema."
      />

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BellRing className="size-5" /> O que precisa de atenção agora ({list.length})
          </h2>
          {list.length > 0 && (
            <Button asChild variant="outline" className="gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(summary)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" /> Compartilhar resumo no WhatsApp
              </a>
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!items.isLoading && list.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nada vencendo dentro dos prazos configurados.
                </TableCell>
              </TableRow>
            )}
            {list.map((i, k) => (
              <TableRow key={`${i.kind}-${k}`}>
                <TableCell>{KIND[i.kind] ?? i.kind}</TableCell>
                <TableCell className="font-medium">{i.title}</TableCell>
                <TableCell>{dateBR(i.due_date)}</TableCell>
                <TableCell>
                  <Badge variant={i.days < 0 ? "destructive" : "outline"}>
                    {i.detail}, {whenText(i.days)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {i.phone && (
                    <Button asChild size="sm" variant="ghost" className="gap-1">
                      <a
                        href={`https://wa.me/55${i.phone.replace(/\D/g, "")}?text=${encodeURIComponent(waText(i))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4" /> Avisar
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-[0.75rem] text-muted-foreground">
          O botão do WhatsApp abre o seu WhatsApp com a mensagem pronta; você confirma o envio. O
          envio automático pelo WhatsApp exige um serviço pago de mensagens e não está ligado.
        </p>
      </div>

      <form
        key={s?.id ?? "novo"}
        onSubmit={save}
        className="space-y-4 rounded-lg border bg-card p-4 shadow-card"
      >
        <h2 className="text-base font-semibold">Aviso automático por e-mail</h2>
        <p className="max-w-3xl text-[0.8125rem] text-muted-foreground">
          O sistema envia um resumo para os e-mails abaixo quando houver algo vencendo. Para o envio
          funcionar, o e-mail do órgão precisa estar configurado (provedor, remetente e senha) pelo
          administrador.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={s?.email_enabled ?? false}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canManageFinance}
          />
          Enviar avisos por e-mail
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="recipients">
            E-mails que recebem o resumo (separe por vírgula ou linha)
          </Label>
          <Textarea
            id="recipients"
            name="recipients"
            rows={2}
            defaultValue={(s?.recipients ?? []).join("\n")}
            disabled={!canManageFinance}
          />
        </div>
        <div className="max-w-xs space-y-1.5">
          <Label>Com que frequência enviar</Label>
          <Select
            value={freq ?? s?.frequency ?? "semanal"}
            onValueChange={setFreq}
            disabled={!canManageFinance}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semanal">Toda segunda-feira</SelectItem>
              <SelectItem value="diaria">Todos os dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {field("cnh_days", "CNH: avisar com (dias)", s?.cnh_days ?? 30)}
          {field("insurance_days", "Seguro: avisar com (dias)", s?.insurance_days ?? 30)}
          {field("contract_days", "Contrato: avisar com (dias)", s?.contract_days ?? 60)}
          {field(
            "obligation_days",
            "Licenciamento/IPVA: avisar com (dias)",
            s?.obligation_days ?? 30,
          )}
          {field("warranty_days", "Garantia de fábrica: avisar com (dias)", s?.warranty_days ?? 60)}
          {field(
            "preventive_days",
            "Revisão por data: avisar com (dias)",
            s?.preventive_days ?? 15,
          )}
          {field("preventive_km", "Revisão por km: avisar faltando (km)", s?.preventive_km ?? 500)}
        </div>
        {canManageFinance && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              Salvar configuração
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={sendNow}
              disabled={sending}
            >
              <Send className="size-4" /> Enviar resumo agora
            </Button>
          </div>
        )}
      </form>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h2 className="mb-2 text-base font-semibold">Últimos envios</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Destinatários</TableHead>
              <TableHead>Mensagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(log.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhum envio ainda.
                </TableCell>
              </TableRow>
            )}
            {(log.data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{dateTimeBR(l.created_at)}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "erro" ? "destructive" : "secondary"}>
                    {l.status === "enviado"
                      ? "Enviado"
                      : l.status === "erro"
                        ? "Erro"
                        : "Sem itens"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{l.items_count}</TableCell>
                <TableCell className="text-right">{l.recipients_count}</TableCell>
                <TableCell>{l.message ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
