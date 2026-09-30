/**
 * Consulta de CNPJ na base pública da Receita Federal (via BrasilAPI) para preencher o cadastro
 * de empresas sem digitação. Só recebe o CNPJ e devolve dados cadastrais públicos da empresa.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCNPJ } from "@/lib/format";

export type CnpjData = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  situacao: string;
  atividade: string;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export const consultarCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cnpj: string }) => {
    const digits = String(input?.cnpj ?? "").replace(/\D/g, "");
    if (!isValidCNPJ(digits)) throw new Error("CNPJ inválido. Confira os números digitados.");
    return { cnpj: digits };
  })
  .handler(async ({ data, context }): Promise<CnpjData> => {
    const { userId } = context;
    const { rateLimited } = await import("@/lib/rate-limit.server");
    if (rateLimited(`cnpj:${userId}`, 20)) throw new Error("Muitas consultas. Aguarde um minuto.");

    const { safeFetch } = await import("@/lib/safe-fetch.server");
    const res = await safeFetch(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`, {
      headers: { Accept: "application/json", "User-Agent": "DibaiFleet/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
    if (!res.ok) throw new Error("A consulta de CNPJ está indisponível agora. Tente novamente.");
    const j = (await res.json()) as Record<string, unknown>;

    const ddd = str(j["ddd_telefone_1"]);
    return {
      cnpj: data.cnpj,
      razao_social: str(j["razao_social"]),
      nome_fantasia: str(j["nome_fantasia"]),
      logradouro: [str(j["descricao_tipo_de_logradouro"]), str(j["logradouro"])]
        .filter(Boolean)
        .join(" "),
      numero: str(j["numero"]),
      complemento: str(j["complemento"]),
      bairro: str(j["bairro"]),
      municipio: str(j["municipio"]),
      uf: str(j["uf"]),
      cep: str(j["cep"]),
      telefone: ddd,
      email: str(j["email"]).toLowerCase(),
      situacao: str(j["descricao_situacao_cadastral"]),
      atividade: str(j["cnae_fiscal_descricao"]),
    };
  });
