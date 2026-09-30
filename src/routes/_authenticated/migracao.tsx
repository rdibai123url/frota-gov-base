import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { ImportMigrationTab } from "@/components/import-migration";

export const Route = createFileRoute("/_authenticated/migracao")({
  head: () => ({
    meta: [
      { title: "Migração de dados — Dibai Fleet" },
      {
        name: "description",
        content:
          "Importação de dados legados por tipo individual: cadastros básicos, contratos e orçamento, operação e registros legais e patrimoniais.",
      },
      { property: "og:title", content: "Migração de dados — Dibai Fleet" },
      {
        property: "og:description",
        content: "Implantação e migração de dados por tipo individual no Dibai Fleet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Migracao,
});

function Migracao() {
  return (
    <div>
      <PageHeader
        title="Migração de dados"
        description="Selecione um tipo de dado por vez, baixe o modelo, envie o arquivo (CSV, XLSX ou JSON), valide, simule e importe. Registros migrados ficam identificados como dados legados, com o sistema de origem informado."
      />
      <ImportMigrationTab />
    </div>
  );
}
