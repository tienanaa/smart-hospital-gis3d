import { getSupabaseClient } from "@/lib/db/supabase";
import type { Database } from "@/lib/db/database.types";

type Tables = Database["public"]["Tables"];
export type FireScenario = Tables["fire_scenarios"]["Row"];
export type VoxelGridConfig = Tables["voxel_grid_config"]["Row"];
export type VoxelState = Tables["voxel_state"]["Row"];

export type FireScenarioSummary = FireScenario & {
  /** Các bước thời gian có dữ liệu voxel (rỗng với kịch bản bình thường) */
  timeSteps: number[];
};

export const defaultGridConfigId = "MAIN_BUILDING";

// Supabase giới hạn số dòng mỗi lần truy vấn (mặc định 1000) nên phải đọc theo trang.
const pageSize = 1000;

export async function getGridConfig(configId = defaultGridConfigId): Promise<VoxelGridConfig | null> {
  const { data, error } = await getSupabaseClient()
    .from("voxel_grid_config")
    .select("*")
    .eq("configid", configId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getTimeSteps(scenarioId: string): Promise<number[]> {
  const supabase = getSupabaseClient();
  const steps: number[] = [];
  // Lấy lần lượt bước kế tiếp lớn hơn bước trước: chỉ vài truy vấn nhỏ thay vì quét cả bảng.
  for (let last = -Infinity; ;) {
    let query = supabase
      .from("voxel_state")
      .select("time_step")
      .eq("scenarioid", scenarioId);
    if (Number.isFinite(last)) query = query.gt("time_step", last);
    const { data, error } = await query.order("time_step").limit(1);
    if (error) throw error;
    if (!data?.length) return steps;
    last = data[0].time_step;
    steps.push(last);
  }
}

export async function getFireScenarios(): Promise<FireScenarioSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from("fire_scenarios")
    .select("*")
    .order("scenarioid");
  if (error) throw error;

  return Promise.all((data ?? []).map(async (scenario) => ({
    ...scenario,
    timeSteps: await getTimeSteps(scenario.scenarioid),
  })));
}

/**
 * Voxel khói/nhiệt của một kịch bản tại một bước thời gian.
 * Mặc định chỉ trả các ô vượt ngưỡng cảnh báo (ảnh hưởng tới tìm đường);
 * `includeAll` trả toàn bộ ô có dữ liệu.
 */
export async function getVoxels(
  scenarioId: string,
  timeStep: number,
  config: VoxelGridConfig,
  includeAll = false,
): Promise<VoxelState[]> {
  const supabase = getSupabaseClient();
  const rows: VoxelState[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("voxel_state")
      .select("scenarioid, time_step, i_idx, j_idx, k_idx, smoke_density, temperature")
      .eq("scenarioid", scenarioId)
      .eq("time_step", timeStep);
    if (!includeAll) {
      query = query.or(
        `smoke_density.gte.${config.smoke_penalty},temperature.gte.${config.temp_penalty}`,
      );
    }
    const { data, error } = await query
      .order("i_idx")
      .order("j_idx")
      .order("k_idx")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
