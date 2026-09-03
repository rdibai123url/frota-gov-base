/* =====================================================================
 * FASE 10 — Bloco 4: compatibilidade de peças, Ordem de Fornecimento
 * (OFP) e almoxarifado.
 * ===================================================================== */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

export type PartCompatibility = Database["public"]["Tables"]["part_compatibilities"]["Row"];
export type CompatibilityOverride = Database["public"]["Tables"]["compatibility_overrides"]["Row"];
export type SupplyOrder = Database["public"]["Tables"]["supply_orders"]["Row"];
export type SupplyOrderItem = Database["public"]["Tables"]["supply_order_items"]["Row"];
export type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
export type StockBalance = Database["public"]["Tables"]["stock_balances"]["Row"];
export type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type StockReservation = Database["public"]["Tables"]["stock_reservations"]["Row"];
export type Inventory = Database["public"]["Tables"]["inventories"]["Row"];
export type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];
export type SupplyOrderStatus = Database["public"]["Enums"]["supply_order_status"];
export type StockMovementKind = Database["public"]["Enums"]["stock_movement_kind"];
export type ExpenseOrigin = Database["public"]["Enums"]["expense_origin"];

export const SUPPLY_STATUS: { value: SupplyOrderStatus; label: string; tone: string }[] = [
  { value: "rascunho", label: "Rascunho", tone: "secondary" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação", tone: "outline" },
  { value: "aprovada", label: "Aprovada / emitida", tone: "default" },
  { value: "parcialmente_atendida", label: "Parcialmente atendida", tone: "outline" },
  { value: "atendida", label: "Atendida", tone: "default" },
  { value: "rejeitada", label: "Rejeitada", tone: "destructive" },
  { value: "cancelada", label: "Cancelada", tone: "destructive" },
];

export const MOVEMENT_KINDS: { value: StockMovementKind; label: string; direction: "in" | "out" }[] = [
  { value: "saldo_inicial", label: "Saldo inicial / importação", direction: "in" },
  { value: "entrada_compra", label: "Entrada — compra/contrato", direction: "in" },
  { value: "entrada_ofp", label: "Entrada — OFP", direction: "in" },
  { value: "entrada_devolucao", label: "Entrada — devolução", direction: "in" },
  { value: "entrada_doacao", label: "Entrada — doação", direction: "in" },
  { value: "entrada_transferencia", label: "Entrada — transferência", direction: "in" },
  { value: "saida_aplicacao", label: "Saída — aplicação em ativo", direction: "out" },
  { value: "saida_manutencao", label: "Saída — manutenção / OS", direction: "out" },
  { value: "saida_consumo", label: "Saída — consumo interno", direction: "out" },
  { value: "saida_transferencia", label: "Saída — transferência", direction: "out" },
  { value: "saida_baixa", label: "Saída — baixa / perda", direction: "out" },
  { value: "saida_devolucao", label: "Saída — devolução ao fornecedor", direction: "out" },
  { value: "ajuste_positivo", label: "Ajuste positivo (inventário)", direction: "in" },
  { value: "ajuste_negativo", label: "Ajuste negativo (inventário)", direction: "out" },
  { value: "estorno", label: "Estorno", direction: "out" },
];

export const EXPENSE_ORIGINS: { value: ExpenseOrigin; label: string; budget: boolean }[] = [
  { value: "contrato", label: "Contrato administrativo", budget: true },
  { value: "compra_direta", label: "Compra direta", budget: false },
  { value: "suprimento_fundos", label: "Pronto pagamento / suprimento de fundos", budget: false },
  { value: "almoxarifado", label: "Almoxarifado", budget: false },
  { value: "convenio", label: "Convênio", budget: false },
  { value: "doacao", label: "Doação", budget: false },
  { value: "terceiro", label: "Terceiro", budget: false },
  { value: "recurso_proprio", label: "Recurso próprio", budget: false },
];

export function supplyStatusLabel(s: SupplyOrderStatus | null | undefined) {
  return SUPPLY_STATUS.find((i) => i.value === s)?.label ?? s ?? "—";
}
export function supplyStatusTone(s: SupplyOrderStatus | null | undefined) {
  return (SUPPLY_STATUS.find((i) => i.value === s)?.tone ?? "secondary") as
    | "default"
    | "secondary"
    | "outline"
    | "destructive";
}
export function movementLabel(k: StockMovementKind | null | undefined) {
  return MOVEMENT_KINDS.find((i) => i.value === k)?.label ?? k ?? "—";
}
export function movementDirection(k: StockMovementKind | null | undefined) {
  return MOVEMENT_KINDS.find((i) => i.value === k)?.direction ?? "out";
}
export function expenseOriginLabel(o: ExpenseOrigin | null | undefined) {
  return EXPENSE_ORIGINS.find((i) => i.value === o)?.label ?? o ?? "—";
}

/* ------------------------------- dados -------------------------------- */

export function usePartCompatibilities(partId?: string | null) {
  return useQuery({
    queryKey: ["part-compatibilities", partId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("part_compatibilities").select("*").order("created_at", { ascending: false });
      if (partId) q = q.eq("part_id", partId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartCompatibility[];
    },
  });
}

export function useCompatibilityOverrides() {
  return useQuery({
    queryKey: ["compatibility-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compatibility_overrides")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as CompatibilityOverride[];
    },
  });
}

export function useSupplyOrders() {
  return useQuery({
    queryKey: ["supply-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupplyOrder[];
    },
  });
}

export function useSupplyOrderItems(orderId?: string | null) {
  return useQuery({
    queryKey: ["supply-order-items", orderId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("supply_order_items").select("*").order("created_at");
      if (orderId) q = q.eq("supply_order_id", orderId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SupplyOrderItem[];
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });
}

export function useStockBalances() {
  return useQuery({
    queryKey: ["stock-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_balances").select("*");
      if (error) throw error;
      return (data ?? []) as StockBalance[];
    },
  });
}

export function useStockMovements() {
  return useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as StockMovement[];
    },
  });
}

export function useStockReservations() {
  return useQuery({
    queryKey: ["stock-reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_reservations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StockReservation[];
    },
  });
}

export function useInventories() {
  return useQuery({
    queryKey: ["inventories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventories")
        .select("*")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Inventory[];
    },
  });
}

export function useInventoryItems(inventoryId?: string | null) {
  return useQuery({
    queryKey: ["inventory-items", inventoryId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("inventory_items").select("*").order("created_at");
      if (inventoryId) q = q.eq("inventory_id", inventoryId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });
}

/** Verifica compatibilidade peça × ativo no banco (mesma regra da baixa). */
export async function checkCompatibility(partId: string, vehicleId: string | null) {
  if (!vehicleId) return true;
  const { data, error } = await supabase.rpc("part_is_compatible", { _part: partId, _vehicle: vehicleId });
  if (error) throw error;
  return Boolean(data);
}

/** Remove chaves indefinidas antes de enviar os parâmetros ao banco. */
export const rpcArgs = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
