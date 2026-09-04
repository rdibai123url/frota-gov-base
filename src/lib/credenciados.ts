/* =====================================================================
 * FASE 10 — Bloco 3: Portal do Credenciado, Cartão Virtual e Captura
 * ---------------------------------------------------------------------
 * O Cartão Virtual do Ativo é um instrumento de IDENTIFICAÇÃO e
 * AUTORIZAÇÃO OPERACIONAL. Não é meio de pagamento: o FrotaGov não
 * realiza adquirência, liquidação financeira nem processamento bancário.
 * ===================================================================== */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

export type Partner = Database["public"]["Tables"]["accredited_partners"]["Row"];
export type PartnerUser = Database["public"]["Tables"]["partner_users"]["Row"];
export type AssetCard = Database["public"]["Tables"]["asset_cards"]["Row"];
export type AssetCardUse = Database["public"]["Tables"]["asset_card_uses"]["Row"];
export type PartnerCapture = Database["public"]["Tables"]["partner_captures"]["Row"];

export const PARTNER_KINDS = [
  { value: "abastecimento", label: "Abastecimento" },
  { value: "manutencao", label: "Manutenção" },
  { value: "pecas", label: "Peças" },
  { value: "pneus", label: "Pneus" },
  { value: "higienizacao", label: "Higienização" },
] as const;

export const PARTNER_STATUS = [
  { value: "ativo", label: "Ativo" },
  { value: "suspenso", label: "Suspenso" },
  { value: "inativo", label: "Inativo" },
] as const;

export const PARTNER_USER_ROLES = [
  { value: "responsavel", label: "Responsável" },
  { value: "operador", label: "Operador" },
] as const;

export const PARTNER_USER_STATUS = [
  { value: "ativo", label: "Ativo" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "inativo", label: "Inativo" },
] as const;

export const CAPTURE_KINDS = [
  { value: "abastecimento", label: "Abastecimento" },
  { value: "manutencao", label: "Manutenção" },
  { value: "fornecimento", label: "Fornecimento de peças" },
] as const;

export function labelFrom(list: readonly { value: string; label: string }[], v: string | null | undefined) {
  return list.find((i) => i.value === v)?.label ?? v ?? "—";
}

export function kindsLabel(kinds: string[] | null | undefined) {
  if (!kinds?.length) return "—";
  return kinds.map((k) => labelFrom(PARTNER_KINDS, k)).join(", ");
}

/* ------------------------------- dados -------------------------------- */

export function usePartners() {
  return useQuery({
    queryKey: ["accredited-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accredited_partners")
        .select("*")
        .order("legal_name");
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });
}

export function usePartnerUsers(partnerId?: string | null) {
  return useQuery({
    queryKey: ["partner-users", partnerId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("partner_users").select("*").order("full_name");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartnerUser[];
    },
  });
}

/** Credenciado do usuário logado (portal externo). */
export function useMyPartner() {
  return useQuery({
    queryKey: ["my-partner"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      // Vincula o usuário ao cadastro do credenciado pelo e-mail e registra o acesso.
      await supabase.rpc("partner_session_touch");
      const { data: link, error } = await supabase
        .from("partner_users")
        .select("*")
        .eq("user_id", uid)
        .eq("status", "ativo")
        .maybeSingle();
      if (error) throw error;
      if (!link) return null;
      const { data: partner } = await supabase
        .from("accredited_partners")
        .select("*")
        .eq("id", link.partner_id)
        .maybeSingle();
      return { link: link as PartnerUser, partner: (partner ?? null) as Partner | null };
    },
  });
}

export function useAssetCards() {
  return useQuery({
    queryKey: ["asset-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_cards")
        .select("*")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssetCard[];
    },
  });
}

export function useCardUses(cardId?: string | null) {
  return useQuery({
    queryKey: ["asset-card-uses", cardId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("asset_card_uses").select("*").order("created_at", { ascending: false }).limit(300);
      if (cardId) q = q.eq("card_id", cardId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AssetCardUse[];
    },
  });
}

export function useCaptures(partnerId?: string | null) {
  return useQuery({
    queryKey: ["partner-captures", partnerId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("partner_captures")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(500);
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartnerCapture[];
    },
  });
}

/** URL pública de leitura do QR Code (imagem gerada por serviço aberto). */
export function qrImageUrl(token: string, size = 220) {
  const payload = `frotagov:card:${token}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

/** Extrai o token de um conteúdo lido do QR (aceita token puro). */
export function parseQrToken(raw: string) {
  const value = raw.trim();
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}
