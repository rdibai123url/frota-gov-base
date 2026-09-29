import { useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { CircleAlert, CircleCheck, FileSearch } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Line = { ok: boolean; text: string };

/**
 * Teste de integridade de uma cópia completa baixada: confere se o arquivo abre, se tem tudo o
 * que o manifesto promete e se a soma de verificação (SHA-256) é a mesma da hora do download.
 */
export function ConferirCopia() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [checksum, setChecksum] = useState("");

  async function check(file: File) {
    setBusy(true);
    const out: Line[] = [];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      out.push({ ok: true, text: `Soma de verificação (SHA-256): ${hex}` });
      if (checksum.trim()) {
        const same = checksum.trim().toLowerCase() === hex;
        out.push({
          ok: same,
          text: same
            ? "A soma confere com a informada: o arquivo não foi alterado."
            : "A soma NÃO confere com a informada: o arquivo foi alterado ou está corrompido.",
        });
      }

      const files = unzipSync(bytes);
      out.push({
        ok: true,
        text: `O arquivo abriu normalmente (${Object.keys(files).length} itens).`,
      });

      const manifestRaw = files["manifesto_exportacao.json"];
      if (!manifestRaw) {
        out.push({
          ok: false,
          text: "Não há manifesto (manifesto_exportacao.json): não é uma cópia completa do FrotaGov.",
        });
      } else {
        const manifest = JSON.parse(strFromU8(manifestRaw)) as {
          arquivos?: { arquivo: string; registros: number; erro?: string }[];
          exportacao?: { total_de_registros?: number; gerada_em_br?: string };
        };
        const list = manifest.arquivos ?? [];
        let missing = 0;
        let mismatch = 0;
        let withError = 0;
        for (const a of list) {
          const content = files[a.arquivo];
          if (!content) {
            missing++;
            continue;
          }
          if (a.erro) withError++;
          if (a.arquivo.endsWith(".json")) {
            try {
              const rows = JSON.parse(strFromU8(content)) as unknown[];
              if (!Array.isArray(rows) || rows.length !== a.registros) mismatch++;
            } catch {
              mismatch++;
            }
          }
        }
        out.push({
          ok: missing === 0,
          text:
            missing === 0
              ? `Todos os ${list.length} arquivos previstos no manifesto estão presentes.`
              : `${missing} arquivo(s) previstos no manifesto estão faltando.`,
        });
        out.push({
          ok: mismatch === 0,
          text:
            mismatch === 0
              ? "As contagens de registros dos arquivos JSON conferem com o manifesto."
              : `${mismatch} arquivo(s) JSON com contagem diferente do manifesto.`,
        });
        if (withError > 0)
          out.push({
            ok: false,
            text: `${withError} conjunto(s) foram exportados com erro (veja o manifesto).`,
          });
        out.push({
          ok: true,
          text: `Total de registros no manifesto: ${(manifest.exportacao?.total_de_registros ?? 0).toLocaleString("pt-BR")} — gerada em ${manifest.exportacao?.gerada_em_br ?? "data não informada"}.`,
        });
      }
    } catch {
      out.push({
        ok: false,
        text: "Não foi possível abrir o arquivo. Ele não é um .zip válido ou está corrompido.",
      });
    }
    setLines(out);
    setBusy(false);
  }

  return (
    <div className="rounded-lg border bg-card p-5 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <FileSearch className="size-5" /> Conferir uma cópia já baixada
        </h2>
        <InfoTip
          help={{
            what: "Teste para saber se a cópia de segurança que você guardou está inteira e pode ser usada numa emergência.",
            calc: "Abre o arquivo no seu computador (nada é enviado), confere se todos os arquivos previstos estão lá e se a soma de verificação é a mesma da hora do download.",
            action:
              "Faça esta conferência depois de baixar e a cada vez que copiar o arquivo para outro lugar.",
          }}
        />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Escolha o arquivo .zip da cópia completa. A conferência acontece no seu computador; nenhum
        dado é enviado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="copia-arquivo">Arquivo da cópia (.zip)</Label>
          <Input
            id="copia-arquivo"
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void check(f);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="copia-soma">Soma de verificação anotada (opcional)</Label>
          <Input
            id="copia-soma"
            value={checksum}
            onChange={(e) => setChecksum(e.target.value)}
            placeholder="cole aqui a soma mostrada no download"
            className="font-mono text-xs"
          />
        </div>
      </div>
      {lines && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start gap-2">
              {l.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span className="break-all">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => setLines(null)} disabled={!lines}>
          Limpar resultado
        </Button>
      </div>
    </div>
  );
}
