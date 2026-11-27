import "server-only";

import { getSupabaseClient } from "./db/supabase";
import { getVoxels } from "./repositories/fire.repository";
import {
  buildRoomOptions,
  type DbArc,
  type DbFireScenario,
  type DbNode,
  type DbNodeSolid,
  type DbUdmSolid,
  type DbVoxelGridConfig,
  type DbVoxelState,
} from "./dijkstra";

// ==========================================
// 2. HÀM TẢI DỮ LIỆU TỪ SUPABASE
// ==========================================

/**
 * Gọi 1 lần khi mở web để lấy toàn bộ node, arc, danh sách phòng và kịch bản cháy
 */
export async function loadHospitalRoutingData() {
  const supabase = getSupabaseClient();

  const [nodesRes, arcsRes, nodeSolidRes, udmSolidRes, configRes, scenarioRes] =
    await Promise.all([
      supabase.from("node").select("nodeid, x, y, z, is_emergency_exit"),
      supabase
        .from("arc")
        .select("arcid, from_node, to_node, cost, is_blocked"),
      supabase.from("node_solid").select("nodeid, solidid"),
      supabase
        .from("udm_solid")
        .select("solidid, spacetype, face_list, metadata, floor_level"),
      supabase
        .from("voxel_grid_config")
        .select("*")
        .eq("configid", "MAIN_BUILDING")
        .single(),
      supabase
        .from("fire_scenarios")
        .select("scenarioid, scenarioname, description")
        .order("scenarioid", { ascending: true }),
    ]);

  if (nodesRes.error) throw nodesRes.error;
  if (arcsRes.error) throw arcsRes.error;
  if (nodeSolidRes.error) throw nodeSolidRes.error;
  if (udmSolidRes.error) throw udmSolidRes.error;

  const nodes = (nodesRes.data ?? []) as DbNode[];
  const arcs = (arcsRes.data ?? []) as DbArc[];
  const nodeSolids = (nodeSolidRes.data ?? []) as DbNodeSolid[];
  const udmSolids = (udmSolidRes.data ?? []) as DbUdmSolid[];
  const scenarios = (scenarioRes.data ?? []) as DbFireScenario[];

  const gridConfig: DbVoxelGridConfig =
    (configRes.data as DbVoxelGridConfig) ?? {
      configid: "MAIN_BUILDING",
      x_min: 0,
      y_min: 0,
      z_min: 0,
      x_max: 30,
      y_max: 14,
      z_max: 12,
      dx: 0.5,
      dy: 0.5,
      dz: 0.5,
      smoke_penalty: 0.3,
      smoke_block: 0.6,
      temp_penalty: 60,
      temp_block: 100,
      penalty_factor: 3,
    };

  const rooms = buildRoomOptions(udmSolids, nodeSolids);

  return { nodes, arcs, rooms, gridConfig, scenarios };
}

/**
 * Chỉ tải các ô Voxel có khói/nhiệt vượt ngưỡng cảnh báo để không làm nặng máy
 * (đọc theo trang để không bị Supabase cắt ở 1000 dòng).
 */
export async function loadFireVoxels(
  scenarioId: string,
  timeStep: number,
  config: DbVoxelGridConfig,
): Promise<DbVoxelState[]> {
  if (!scenarioId || scenarioId === "S1") {
    return [];
  }
  return getVoxels(scenarioId, timeStep, config);
}
