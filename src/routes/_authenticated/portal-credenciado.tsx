import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Fuel, PackageCheck, QrCode, Search, Wrench } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";

/** Remove chaves indefinidas antes de enviar os parâmetros ao banco. */
const rpcArgs = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
import { kindsLabel, parseQrToken, useCaptures, useMyPartner } from "@/lib/credenciados";
import { supplyStatusLabel, supplyStatusTone, useSupplyOrderItems, useSupplyOrders } from "@/lib/almoxarifado";
import { brl, dateBR, dateTimeBR, dbMessage, num, supabase, useInvalidate } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/portal-credenciado")({
  head: () => ({
    meta: [
      { title: "Portal do credenciado — FrotaGov" },
      {
        name: "description",
        content:
          "Área externa da rede credenciada para localizar o ativo pelo cartão virtual, capturar abastecimento e manutenção autorizados e confirmar ordens de fornecimento de peças.",
      },
      { property: "og:title", content: "Portal do credenciado — FrotaGov" },
      {
        property: "og:description",
        content: "Captura eletrônica de abastecimento, manutenção e fornecimento pela rede credenciada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalCredenciado,
});

type Resolved = {
  card_id: string;
  organization_id: string;
  org_name: string;
  vehicle_id: string;
  asset_label: string;
  asset_class: string;
  vehicle_status: string;
  fuel_type: string;
  meter_kind: string;
  open_authorizations: number;
};

type AuthRow = {
  id: string;
  code: string;
  asset_label: string;
  unit_name: string;
  driver_name: string;
  fuel_name: string;
  contract_code: string;
  status: string;
  max_quantity: number;
  remaining_quantity: number;
  max_unit_price: number;
  max_value: number;
  meter_kind: string;
  valid_from: string;
  valid_until: string;
  vehicle_id: string;
};

function PortalCredenciado() {
  const { data: me, isLoading } = useMyPartner();
  const partnerId = me?.partner?.id ?? null;
  const { data: captures = [] } = useCaptures(partnerId);
  const [tab, setTab] = useState("abastecimento");

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;

  if (!me?.partner) {
    return (
      <div>
        <PageHeader title="Portal do credenciado" description="Área exclusiva da rede credenciada." />
        <div className="gov-card p-6 text-sm text-muted-foreground">
          Seu usuário não está vinculado a um credenciado ativo. Solicite ao órgão o cadastro do seu e-mail em
          Credenciados → Usuários do credenciado.
        </div>
      </div>
    );
  }

  const partner = me.partner;
  const today = new Date().toISOString().slice(0, 10);
  const todayCaptures = captures.filter((c) => (c.captured_at ?? "").slice(0, 10) === today);

  return (
    <div>
      <PageHeader
        title={partner.trade_name || partner.legal_name}
        description={`Portal do credenciado — habilitado para: ${kindsLabel(partner.kinds)}. O cartão virtual do ativo é identificação e autorização operacional, não é meio de pagamento.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Operações de hoje</div>
          <div className="text-2xl font-semibold">{todayCaptures.length}</div>
        </div>
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Capturas registradas</div>
          <div className="text-2xl font-semibold">{captures.length}</div>
        </div>
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Situação do credenciamento</div>
          <div className="text-2xl font-semibold capitalize">{partner.status}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="abastecimento">
            <Fuel className="mr-2 h-4 w-4" /> Abastecimento
          </TabsTrigger>
          <TabsTrigger value="manutencao">
            <Wrench className="mr-2 h-4 w-4" /> Manutenção
          </TabsTrigger>
          <TabsTrigger value="ofp">
            <PackageCheck className="mr-2 h-4 w-4" /> Ordens de fornecimento
          </TabsTrigger>
          <TabsTrigger value="operacoes">
            <QrCode className="mr-2 h-4 w-4" /> Minhas operações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abastecimento">
          <FuelCapture />
        </TabsContent>
        <TabsContent value="manutencao">
          <ServiceCapture />
        </TabsContent>
        <TabsContent value="ofp">
          <PartnerSupplyOrders partnerId={partner.id} />
        </TabsContent>
        <TabsContent value="operacoes">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Autorizado</TableHead>
                  <TableHead className="text-right">Capturado</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {captures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Nenhuma operação registrada.
                    </TableCell>
                  </TableRow>
                )}
                {captures.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{dateTimeBR(c.captured_at)}</TableCell>
                    <TableCell>{c.kind}</TableCell>
                    <TableCell className="text-right">
                      {c.authorized_quantity != null ? num(c.authorized_quantity, 4) : brl(c.authorized_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.captured_quantity != null ? num(c.captured_quantity, 4) : brl(c.captured_value)}
                    </TableCell>
                    <TableCell>{c.document_number ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "rejeitada" ? "destructive" : "secondary"}>{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------- captura de abastecimento --------------------------- */

function FuelCapture() {
  const invalidate = useInvalidate();
  const [qr, setQr] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [security, setSecurity] = useState("");
  const [asset, setAsset] = useState<Resolved | null>(null);
  const [auths, setAuths] = useState<AuthRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [form, setForm] = useState({
    quantity: "",
    unit_price: "",
    odometer: "",
    hour_meter: "",
    document: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const auth = auths.find((a) => a.id === selected) ?? null;

  async function locate() {
    setAsset(null);
    setAuths([]);
    setSelected("");
    const token = qr ? parseQrToken(qr) : null;
    if (!token && !identifier.trim()) {
      toast.error("Leia o QR Code ou informe placa/patrimônio e código de segurança");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("asset_card_resolve", rpcArgs({
      _qr: token ?? undefined,
      _identifier: identifier.trim() || undefined,
      _security: security.trim() || undefined,
    }));
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    const found = (data ?? [])[0] as Resolved | undefined;
    if (!found) {
      toast.error("Cartão virtual não localizado ou código de segurança inválido");
      return;
    }
    setAsset(found);
    const { data: list, error: e2 } = await supabase.rpc("partner_authorizations", { _vehicle: found.vehicle_id });
    if (e2) {
      toast.error(dbMessage(e2));
      return;
    }
    const rows = (list ?? []) as AuthRow[];
    setAuths(rows);
    if (rows.length === 1 && rows[0]) setSelected(rows[0].id);
    if (!rows.length) toast.warning("Nenhuma autorização válida disponível para este ativo.");
  }

  async function capture() {
    if (!auth) {
      toast.error("Selecione a autorização");
      return;
    }
    const quantity = parseBRNumber(form.quantity);
    const price = parseBRNumber(form.unit_price);
    if (!quantity || quantity <= 0) {
      toast.error("Informe os litros efetivamente abastecidos");
      return;
    }
    if (!price || price <= 0) {
      toast.error("Informe o preço unitário");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("partner_capture_fueling", rpcArgs({
      _authorization: auth.id,
      _quantity: quantity,
      _unit_price: price,
      _odometer: parseBRNumber(form.odometer) ?? undefined,
      _hour_meter: parseBRNumber(form.hour_meter) ?? undefined,
      _document: form.document.trim() || undefined,
      _notes: form.notes.trim() || undefined,
      _user_agent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
    }));
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Abastecimento capturado. A diferença entre o reservado e o realizado foi devolvida ao saldo.");
    setForm({ quantity: "", unit_price: "", odometer: "", hour_meter: "", document: "", notes: "" });
    invalidate(["partner-captures", "fuelings", "authorizations"]);
    void locate();
  }

  return (
    <div className="space-y-4">
      <div className="gov-card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>QR Code do cartão virtual</Label>
            <Input value={qr} onChange={(e) => setQr(e.target.value)} placeholder="Conteúdo lido do QR" />
          </div>
          <div>
            <Label>Ou placa / patrimônio</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="ABC1D23" />
          </div>
          <div>
            <Label>Código de segurança</Label>
            <Input value={security} onChange={(e) => setSecurity(e.target.value)} placeholder="6 caracteres" />
          </div>
        </div>
        <Button onClick={locate} disabled={busy}>
          <Search className="mr-2 h-4 w-4" /> Localizar ativo
        </Button>
      </div>

      {asset && (
        <div className="gov-card grid gap-2 p-4 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Órgão:</span> {asset.org_name}
          </div>
          <div>
            <span className="text-muted-foreground">Ativo:</span> {asset.asset_label} ({asset.asset_class})
          </div>
          <div>
            <span className="text-muted-foreground">Situação:</span> {asset.vehicle_status}
          </div>
          <div>
            <span className="text-muted-foreground">Combustível:</span> {asset.fuel_type || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Medidor:</span> {asset.meter_kind}
          </div>
          <div>
            <span className="text-muted-foreground">Autorizações abertas:</span> {asset.open_authorizations}
          </div>
        </div>
      )}

      {auths.length > 0 && (
        <div className="gov-card space-y-3 p-4">
          <div>
            <Label>Autorização</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a autorização" />
              </SelectTrigger>
              <SelectContent>
                {auths.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.fuel_name} — saldo {num(a.remaining_quantity, 4)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {auth && (
            <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3">
              <div>Unidade: {auth.unit_name || "—"}</div>
              <div>Condutor: {auth.driver_name || "—"}</div>
              <div>Combustível autorizado: {auth.fuel_name}</div>
              <div>Limite: {num(auth.max_quantity, 4)}</div>
              <div>Saldo: {num(auth.remaining_quantity, 4)}</div>
              <div>
                Vigência: {dateBR(auth.valid_from)} a {dateBR(auth.valid_until)}
              </div>
              <div>Preço máximo: {brl(auth.max_unit_price)}</div>
              <div>Valor máximo: {brl(auth.max_value)}</div>
              <div>Contrato: {auth.contract_code || "—"}</div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Litros efetivos *</Label>
              <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <Label>Preço unitário *</Label>
              <Input value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
            </div>
            <div>
              <Label>Valor total</Label>
              <Input
                readOnly
                value={brl((parseBRNumber(form.quantity) ?? 0) * (parseBRNumber(form.unit_price) ?? 0))}
              />
            </div>
            <div>
              <Label>Hodômetro (km)</Label>
              <Input
                value={form.odometer}
                onChange={(e) => setForm({ ...form, odometer: e.target.value })}
                disabled={auth?.meter_kind === "horimetro"}
              />
            </div>
            <div>
              <Label>Horímetro (h)</Label>
              <Input
                value={form.hour_meter}
                onChange={(e) => setForm({ ...form, hour_meter: e.target.value })}
                disabled={auth?.meter_kind !== "horimetro"}
              />
            </div>
            <div>
              <Label>Nº do cupom / nota fiscal</Label>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <Button onClick={capture} disabled={busy || !auth}>
            Finalizar captura
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- captura de manutenção ---------------------------- */

function ServiceCapture() {
  const invalidate = useInvalidate();
  const { data: orders = [] } = useQuery({
    queryKey: ["partner-service-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, code, status, approved_value, executed_value, vehicle_id, issued_at")
        .in("status", ["emitida", "veiculo_recebido", "em_execucao", "aguardando_peca"])
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    executed_value: "",
    odometer: "",
    hour_meter: "",
    document: "",
    notes: "",
    finish: "parcial",
  });
  const [busy, setBusy] = useState(false);
  const order = orders.find((o) => o.id === selected);

  async function send() {
    if (!selected) {
      toast.error("Selecione a ordem de serviço");
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.rpc("partner_capture_service", rpcArgs({
      _service_order: selected,
      _started_at: now,
      _finished_at: form.finish === "final" ? now : undefined,
      _executed_value: parseBRNumber(form.executed_value) ?? undefined,
      _odometer: parseBRNumber(form.odometer) ?? undefined,
      _hour_meter: parseBRNumber(form.hour_meter) ?? undefined,
      _document: form.document.trim() || undefined,
      _notes: form.notes.trim() || undefined,
      _finish: form.finish === "final",
      _user_agent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
    }));
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(form.finish === "final" ? "Execução finalizada e enviada para conferência" : "Execução parcial registrada");
    invalidate(["partner-captures", "partner-service-orders", "service-orders"]);
  }

  return (
    <div className="gov-card space-y-3 p-4">
      <div>
        <Label>Ordem de serviço autorizada</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {orders.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.code} — {o.status} — autorizado {brl(o.approved_value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {orders.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma ordem de serviço disponível para o seu cadastro.</p>
        )}
      </div>
      {order && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Valor executado</Label>
            <Input value={form.executed_value} onChange={(e) => setForm({ ...form, executed_value: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Autorizado: {brl(order.approved_value)}</p>
          </div>
          <div>
            <Label>Hodômetro (km)</Label>
            <Input value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
          </div>
          <div>
            <Label>Horímetro (h)</Label>
            <Input value={form.hour_meter} onChange={(e) => setForm({ ...form, hour_meter: e.target.value })} />
          </div>
          <div>
            <Label>Nº / data da NF</Label>
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.finish} onValueChange={(v) => setForm({ ...form, finish: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parcial">Execução parcial</SelectItem>
                <SelectItem value="final">Conclusão (envia para conferência)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Label>Serviços executados / peças aplicadas</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      )}
      <Button onClick={send} disabled={busy || !selected}>
        Registrar execução
      </Button>
    </div>
  );
}

/* ------------------------------ OFPs do credenciado ------------------------------ */

function PartnerSupplyOrders({ partnerId }: { partnerId: string }) {
  const invalidate = useInvalidate();
  const { data: orders = [] } = useSupplyOrders();
  const mine = useMemo(() => orders.filter((o) => o.partner_id === partnerId), [orders, partnerId]);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: items = [] } = useSupplyOrderItems(selected);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState("");

  async function deliver(itemId: string) {
    const q = parseBRNumber(qty[itemId] ?? "");
    if (!q || q <= 0) {
      toast.error("Informe a quantidade entregue");
      return;
    }
    const { error } = await supabase.rpc("supply_order_deliver", rpcArgs({
      _item: itemId,
      _quantity: q,
      _document: doc.trim() || undefined,
    }));
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Entrega registrada. Sujeita à conferência do órgão.");
    setQty({ ...qty, [itemId]: "" });
    invalidate(["supply-orders", "supply-order-items"]);
  }

  return (
    <div className="space-y-4">
      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OFP</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Valor máximo</TableHead>
              <TableHead className="text-right">Atendido</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mine.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Nenhuma ordem de fornecimento emitida para o seu cadastro.
                </TableCell>
              </TableRow>
            )}
            {mine.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono">{o.code}</TableCell>
                <TableCell>{dateBR(o.deadline_at)}</TableCell>
                <TableCell className="text-right">{brl(o.max_value)}</TableCell>
                <TableCell className="text-right">{brl(o.consumed_value)}</TableCell>
                <TableCell>
                  <Badge variant={supplyStatusTone(o.status)}>{supplyStatusLabel(o.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setSelected(o.id)}>
                    Atender
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <div className="gov-card space-y-3 p-4">
          <div className="w-64">
            <Label>Nº da nota fiscal</Label>
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Autorizado</TableHead>
                <TableHead className="text-right">Entregue</TableHead>
                <TableHead className="text-right">Valor unitário</TableHead>
                <TableHead>Entregar agora</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">{num(it.quantity, 4)}</TableCell>
                  <TableCell className="text-right">{num(it.delivered_quantity, 4)}</TableCell>
                  <TableCell className="text-right">{brl(it.unit_value)}</TableCell>
                  <TableCell>
                    <Input
                      className="w-28"
                      value={qty[it.id] ?? ""}
                      onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => deliver(it.id)}>
                      Confirmar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
