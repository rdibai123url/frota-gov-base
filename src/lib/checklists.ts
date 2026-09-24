import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ChecklistStage = "saida" | "retorno";
export type ChecklistAnswer = "ok" | "problema" | "nao_aplica";
export type ChecklistResponses = Record<string, ChecklistAnswer>;
export type VehicleChecklist = Database["public"]["Tables"]["vehicle_checklists"]["Row"];
export type VehicleChecklistPhoto = Database["public"]["Tables"]["vehicle_checklist_photos"]["Row"];
export type ChecklistWithPhotos = VehicleChecklist & { photos: VehicleChecklistPhoto[] };

export const CHECKLIST_ITEMS = [
  { key: "combustivel", label: "Nível/condição geral de combustível" },
  { key: "pneus", label: "Pneus" },
  { key: "estepe", label: "Estepe" },
  { key: "farois", label: "Faróis" },
  { key: "lanternas", label: "Lanternas" },
  { key: "setas", label: "Setas" },
  { key: "luz_freio", label: "Luz de freio" },
  { key: "limpador", label: "Limpador de para-brisa" },
  { key: "buzina", label: "Buzina" },
  { key: "retrovisores", label: "Retrovisores" },
  { key: "vidros", label: "Vidros" },
  { key: "cintos", label: "Cintos de segurança" },
  { key: "documentos", label: "Documentos do veículo" },
  { key: "limpeza_interna", label: "Limpeza interna" },
  { key: "limpeza_externa", label: "Limpeza externa" },
  { key: "avarias", label: "Avarias aparentes" },
] as const;

export const CHECKLIST_ANSWER_LABEL: Record<ChecklistAnswer, string> = {
  ok: "OK",
  problema: "Com problema",
  nao_aplica: "Não se aplica",
};

export function parseChecklistResponses(value: unknown): ChecklistResponses {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, ChecklistAnswer] =>
      ["ok", "problema", "nao_aplica"].includes(String(entry[1])),
    ),
  );
}

export function checklistProblems(checklist?: Pick<VehicleChecklist, "responses"> | null) {
  const responses = parseChecklistResponses(checklist?.responses);
  return CHECKLIST_ITEMS.filter((item) => responses[item.key] === "problema");
}

export function newReturnProblems(
  departure?: Pick<VehicleChecklist, "responses"> | null,
  returned?: Pick<VehicleChecklist, "responses"> | null,
) {
  const out = parseChecklistResponses(departure?.responses);
  const back = parseChecklistResponses(returned?.responses);
  return CHECKLIST_ITEMS.filter(
    (item) => back[item.key] === "problema" && out[item.key] !== "problema",
  );
}

export function useUsageChecklists(usageId: string | null) {
  return useQuery({
    queryKey: ["vehicle-checklists", usageId],
    enabled: Boolean(usageId),
    queryFn: async () => {
      if (!usageId) return [];
      const { data, error } = await supabase
        .from("vehicle_checklists")
        .select("*, photos:vehicle_checklist_photos(*)")
        .eq("usage_id", usageId)
        .eq("active", true)
        .order("completed_at");
      if (error) throw error;
      return (data ?? []) as ChecklistWithPhotos[];
    },
  });
}

export function useVehicleChecklists(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle-checklists-by-vehicle", vehicleId],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      if (!vehicleId) return [];
      const { data, error } = await supabase
        .from("vehicle_checklists")
        .select("*, photos:vehicle_checklist_photos(*)")
        .eq("vehicle_id", vehicleId)
        .eq("active", true)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChecklistWithPhotos[];
    },
  });
}

export async function uploadChecklistPhoto(
  orgId: string,
  usageId: string,
  stage: ChecklistStage,
  file: File,
) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione somente arquivos de imagem.");
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${orgId}/${usageId}/${stage}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from("checklist-frota")
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function openChecklistPhoto(path: string) {
  const { data, error } = await supabase.storage
    .from("checklist-frota")
    .createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir a foto.");
  window.open(data.signedUrl, "_blank", "noopener");
}
