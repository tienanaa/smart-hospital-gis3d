/**
 * Unit test (không cần database): khi có sự cố cháy, tuyến đường không được
 * đi bằng thang máy; lúc bình thường thì vẫn được.
 *
 *   Tầng 1:  A ── L1 (thang máy T1) ── S1 (cầu thang T1)
 *                  │                     │
 *   Tầng 2:  B ── L2 (thang máy T2)      S2 (cầu thang T2) ── B
 *
 * Đường thang máy ngắn hơn đường cầu thang.
 */
import { describe, expect, test } from "vitest";
import type { DbArc, DbNode, DbVoxelGridConfig } from "@/lib/dijkstra";
import { buildRoutingGraph, findRoomRoute, type FireContext, type RoomLabel } from "@/component/Floor/routing";

const node = (nodeid: string, x: number, y: number, z: number): DbNode =>
  ({ nodeid, x, y, z, is_emergency_exit: false });
const arc = (arcid: string, from: string, to: string): DbArc =>
  ({ arcid, from_node: from, to_node: to, cost: 0, is_blocked: false });

const nodes = [
  node("A", 0, 0, 0), node("L1", 2, 0, 0), node("S1", 10, 0, 0),
  node("L2", 2, 0, 4), node("S2", 10, 0, 4), node("B", 4, 0, 4),
];
const arcs = [
  arc("a_l1", "A", "L1"), arc("a_s1", "L1", "S1"),
  arc("shaft", "L1", "L2"), arc("stair", "S1", "S2"),
  arc("b_l2", "L2", "B"), arc("b_s2", "S2", "B"),
];
const graph = buildRoutingGraph(nodes, arcs, [
  { nodeid: "A", solidid: "room_a" }, { nodeid: "B", solidid: "room_b" },
  { nodeid: "L1", solidid: "lift_1" }, { nodeid: "L2", solidid: "lift_2" },
  { nodeid: "S1", solidid: "stair_1" }, { nodeid: "S2", solidid: "stair_2" },
]);
const labels = new Map<string, RoomLabel>([
  ["room_a", { name: "Phòng A", level: 1, spacetype: "Room" }],
  ["room_b", { name: "Phòng B", level: 2, spacetype: "Room" }],
  ["lift_1", { name: "Thang máy", level: 1, spacetype: "Elevator" }],
  ["lift_2", { name: "Thang máy", level: 2, spacetype: "Elevator" }],
  ["stair_1", { name: "Cầu thang", level: 1, spacetype: "STAIRCASE" }],
  ["stair_2", { name: "Cầu thang", level: 2, spacetype: "STAIRCASE" }],
]);

const config: DbVoxelGridConfig = {
  configid: "TEST", x_min: 0, y_min: -1, z_min: 0, x_max: 12, y_max: 1, z_max: 8,
  dx: 0.5, dy: 0.5, dz: 0.5, smoke_penalty: 0.3, smoke_block: 0.6,
  temp_penalty: 60, temp_block: 100, penalty_factor: 3,
};
// Kịch bản cháy ở xa tuyến đường: chỉ để bật chế độ "có sự cố".
const fire: FireContext = {
  scenarioName: "Cháy thử",
  config,
  voxels: [{ scenarioid: "T", time_step: 1, i_idx: 0, j_idx: 0, k_idx: 15, smoke_density: 0.4, temperature: 30 }],
};

const nodeIdsOf = (result: ReturnType<typeof findRoomRoute>) =>
  result.ok ? result.steps.map((step) => step.nodeId) : [];

describe("Thang máy khi có sự cố cháy", () => {
  test("bình thường: đi thang máy vì ngắn hơn", () => {
    const result = findRoomRoute(graph, labels, "room_a", "room_b");
    expect(result.ok).toBe(true);
    expect(nodeIdsOf(result)).toContain("L1");
    expect(nodeIdsOf(result)).not.toContain("S1");
  });

  test("có cháy: bỏ trục thang máy, đi cầu thang", () => {
    const result = findRoomRoute(graph, labels, "room_a", "room_b", fire);
    expect(result.ok).toBe(true);
    expect(result.ok && result.points.map(({ x, z }) => `${x},${z}`)).toEqual(
      ["0,0", "2,0", "10,0", "10,4", "4,4"],
    );
  });

  test("có cháy và chỉ có thang máy: báo không có đường an toàn", () => {
    const liftOnly = buildRoutingGraph(nodes, arcs.filter((a) => a.arcid !== "stair"), [
      { nodeid: "A", solidid: "room_a" }, { nodeid: "B", solidid: "room_b" },
      { nodeid: "L1", solidid: "lift_1" }, { nodeid: "L2", solidid: "lift_2" },
    ]);
    const result = findRoomRoute(liftOnly, labels, "room_a", "room_b", fire);
    expect(result.ok).toBe(false);
  });
});
