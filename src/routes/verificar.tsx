import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verificar")({
  head: () => ({
    meta: [
      { title: "Conferir assinatura — Dibai Fleet" },
      {
        name: "description",
        content:
          "Confira se uma assinatura eletrônica do Dibai Fleet é verdadeira, informando o código impresso no documento.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Verificar,
});

const TYPE_LABEL: Record<string, string> = {
  autorizacao_abastecimento: "Autorização de abastecimento",
  ordem_servico: "Ordem de serviço",
  contrato_ocorrencia: "Registro de gestão do contrato",
  fatura: "Fatura",
};

type Result = {
  doc_type: string;
  doc_label: string;
  signer_name: string;
  signer_role: string | null;
  signed_at: string;
  doc_hash: string;
  organization_name: string;
};

function Verificar() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true);
    const { data } = await supabase.rpc("verify_signature", { _code: code.trim() });
    setBusy(false);
    setResult((data as Result[] | null)?.[0] ?? null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-panel">
        <h1 className="gov-title text-xl">Conferir assinatura eletrônica</h1>
        <p className="text-sm text-muted-foreground">
          Digite o código que aparece junto à assinatura do documento (8 letras e números).
        </p>
        <form onSubmit={check} className="space-y-2">
          <Label htmlFor="code">Código de conferência</Label>
          <Input
            id="code"
            value={code}
            maxLength={12}
            className="font-mono uppercase"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button type="submit" disabled={busy || code.trim().length < 6}>
            Conferir
          </Button>
        </form>

        {result === null && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <ShieldX className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p>Código não encontrado. Confira as letras e os números digitados.</p>
          </div>
        )}
        {result && (
          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 text-primary" /> Assinatura verdadeira
            </p>
            <p>
              <strong>{result.signer_name}</strong> assinou em{" "}
              {new Date(result.signed_at).toLocaleString("pt-BR")}
            </p>
            <p>
              {TYPE_LABEL[result.doc_type] ?? result.doc_type}: {result.doc_label}
            </p>
            <p>Órgão: {result.organization_name}</p>
            <p className="break-all font-mono text-[0.6875rem] text-muted-foreground">
              Resumo do documento: {result.doc_hash}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
