/**
 * FrotaGov — Fornecedores e Postos (operacional).
 *
 * Bloco 3: esta tela não cadastra empresa. Ela lista automaticamente as
 * empresas do cadastro mestre que possuem contrato vigente compatível com
 * combustível, derivados, peças, pneus, acessórios ou outro fornecimento.
 * O cadastro de empresas continua em Pessoas e Empresas Externas.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, FileText, MapPin, Search } from "lucide-react";

import { ListPagination, usePaged } from "@/components/list-pagination";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CONTRACT_MODALITIES,
  CONTRACT_STATUS,
  brl,
  dateBR,
  formatCNPJ,
  label as labelOf,
} from "@/lib/frotagov";
import {
  contractItemBalance,
  networkCategoryLabel,
  useNetworkCompanies,
  type NetworkCategory,
  type NetworkCompany,
} from "@/lib/rede";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores e Postos — FrotaGov" },
      {
        name: "description",
        content:
          "Empresas com contrato vigente de combustível, derivados, peças, pneus e demais fornecimentos da frota do órgão.",
      },
      { property: "og:title", content: "Fornecedores e Postos — FrotaGov" },
      {
        property: "og:description",
        content: "Relação operacional de postos e fornecedores derivada dos contratos vigentes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fornecedores,
});

const CATS: NetworkCategory[] = ["combustivel", "pecas", "pneus", "outro"];

function Fornecedores() {
  const { companies, isLoading } = useNetworkCompanies(CATS);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<NetworkCompany | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return companies;
    return companies.filter((c) =>
      [c.name, c.tradeName, c.document, c.city, ...c.contracts.map((k) => k.number)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [companies, q]);

  const paged = usePaged(filtered);

  return (
    <>
      <PageHeader
        title="Fornecedores / Postos"
        description="Empresas habilitadas pela existência de contrato vigente de combustível, derivados, peças, pneus, acessórios ou outro fornecimento. O cadastro da empresa é feito em Pessoas e Empresas Externas."
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/entidades-externas">
              <Building2 className="size-4" /> Cadastro de empresas
            </Link>
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por empresa, CNPJ, município ou contrato"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>CNPJ / CPF</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Fornece</TableHead>
              <TableHead>Contratos vigentes</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Building2 className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma empresa com contrato vigente de fornecimento. Cadastre o contrato em Contratos e vincule a
                  empresa do cadastro mestre.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="font-medium">
                  {c.name}
                  {c.tradeName ? <span className="block text-xs text-muted-foreground">{c.tradeName}</span> : null}
                </TableCell>
                <TableCell>{formatCNPJ(c.document) || "—"}</TableCell>
                <TableCell>{[c.city, c.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="space-x-1">
                  {c.categories.map((k) => (
                    <Badge key={k} variant="outline">
                      {networkCategoryLabel(k)}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>{c.contracts.length}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="gap-2" onClick={() => setDetail(c)}>
                    <FileText className="size-4" /> Detalhes
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <CompanyDialog company={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export function CompanyDialog({
  company,
  onClose,
}: {
  company: NetworkCompany | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!company} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company?.name}</DialogTitle>
        </DialogHeader>

        {company && (
          <div className="space-y-5">
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Documento: </span>
                {formatCNPJ(company.document) || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Responsável: </span>
                {company.contactName || "—"}
              </p>
              <p className="sm:col-span-2">
                <MapPin className="mr-1 inline size-3 text-muted-foreground" />
                {[company.address, company.district, company.city, company.state].filter(Boolean).join(", ") ||
                  "Endereço não informado"}
              </p>
              <p>
                <span className="text-muted-foreground">Contato: </span>
                {[company.phone, company.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Localização no mapa: </span>
                {company.latitude != null && company.longitude != null ? "definida" : "pendente"}
              </p>
            </div>

            {company.contracts.map((c) => (
              <div key={c.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      Contrato {c.number}
                      {c.process_number ? ` · Processo ${c.process_number}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.object}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{labelOf(CONTRACT_MODALITIES, c.modality)}</Badge>
                    <Badge variant={c.status === "vigente" ? "default" : "secondary"}>
                      {labelOf(CONTRACT_STATUS, c.status)}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Vigência {dateBR(c.valid_from)} a {dateBR(c.valid_to)} · Valor atual {brl(Number(c.current_value ?? 0))}
                </p>

                {(c.items ?? []).filter((i) => i.active).length > 0 && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">N°</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="text-right">Contratado</TableHead>
                          <TableHead className="text-right">Bloqueado</TableHead>
                          <TableHead className="text-right">Consumido</TableHead>
                          <TableHead className="text-right">Disponível</TableHead>
                          <TableHead className="text-right">Valor unitário</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(c.items ?? [])
                          .filter((i) => i.active)
                          .map((i) => {
                            const b = contractItemBalance(i);
                            return (
                              <TableRow key={i.id}>
                                <TableCell>{i.item_number ?? "—"}</TableCell>
                                <TableCell>{i.description}</TableCell>
                                <TableCell>{i.measure_unit}</TableCell>
                                <TableCell className="text-right">{b.quantity.toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-right">{b.reserved.toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-right">{b.consumed.toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {b.available.toLocaleString("pt-BR")}
                                </TableCell>
                                <TableCell className="text-right">{brl(b.unit)}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
