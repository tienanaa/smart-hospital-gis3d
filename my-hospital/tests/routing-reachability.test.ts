/**
 * Kiểm tra mạng lưới đường đi ở trạng thái bình thường (không có kịch bản cháy):
 * mọi phòng đều phải được nối vào mạng lưới và đi tới được từ mọi phòng khác.
 *
 * Test đọc dữ liệu thật từ Supabase (cấu hình trong .env), vẫn tôn trọng cột
 * arc.is_blocked giống hệt khi chạy trên giao diện.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import type { Database } from "@/lib/db/database.types";
import type { DbArc, DbNode, DbNodeSolid } from "@/lib/dijkstra";
import { buildRoutingGraph, findRoomRoute, type RoomLabel } from "@/component/Floor/routing";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

type TableName = keyof Database["public"]["Tables"];

async function loadTable<T>(table: TableName): Promise<T[]> {
  const supabase = createClient<Database>(url!.replace(/\/rest\/v1\/?$/, ""), key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`Không đọc được bảng ${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < pageSize) return rows;
  }
}

type Solid = Database["public"]["Tables"]["udm_solid"]["Row"];

function solidName({ solidid, metadata }: Solid) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : solidid;
}

const data = url && key
  ? await Promise.all([
    loadTable<DbNode>("node"),
    loadTable<DbArc>("arc"),
    loadTable<DbNodeSolid>("node_solid"),
    loadTable<Solid>("udm_solid"),
  ])
  : null;

const [nodes, arcs, nodeSolids, solids] = data ?? [[], [], [], []];
const graph = buildRoutingGraph(nodes, arcs, nodeSolids);
const labels = new Map<string, RoomLabel>(
  solids.map((solid) => [solid.solidid, { name: solidName(solid), level: solid.floor_level, spacetype: solid.spacetype }]),
);
const describeRoom = (id: string) => `${labels.get(id)?.name ?? id} [${id}, tầng ${labels.get(id)?.level ?? "?"}]`;
const routableRooms = solids
  .filter((solid) => graph.nodesOfRoom.has(solid.solidid))
  .sort((a, b) => a.floor_level - b.floor_level || a.solidid.localeCompare(b.solidid));

describe.skipIf(!data)("Mạng lưới đường đi – trạng thái bình thường", () => {
  test("có dữ liệu phòng và mạng lưới", () => {
    expect(solids.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThan(0);
    expect(arcs.length).toBeGreaterThan(0);
  });

  test("mọi phòng đều được gắn ít nhất một node trong node_solid", () => {
    const unlinked = solids
      .filter((solid) => !graph.nodesOfRoom.has(solid.solidid))
      .map((solid) => describeRoom(solid.solidid));
    expect(unlinked, "Các phòng chưa gắn node nên không thể tìm đường tới").toEqual([]);
  });

  // Phòng mốc: phòng đi được tới nhiều phòng nhất (nằm trong mạng lưới chính).
  // So từng phòng với phòng mốc để lỗi chỉ báo đúng phòng bị cô lập, không lan ra mọi phòng.
  const reachableCount = (id: string) => routableRooms
    .filter((other) => other.solidid !== id && findRoomRoute(graph, labels, id, other.solidid).ok).length;
  const hub = routableRooms
    .map((solid) => ({ id: solid.solidid, count: reachableCount(solid.solidid) }))
    .sort((a, b) => b.count - a.count)[0]?.id;

  test.each(routableRooms
    .filter((solid) => solid.solidid !== hub)
    .map((solid) => ({ id: solid.solidid, room: describeRoom(solid.solidid) })))(
    "có đường đi giữa $room và mạng lưới chính",
    ({ id }) => {
      const failures = [findRoomRoute(graph, labels, hub!, id), findRoomRoute(graph, labels, id, hub!)]
        .flatMap((result) => result.ok ? [] : [result.message]);
      expect(failures, `${describeRoom(id)} bị tách khỏi mạng lưới (so với ${describeRoom(hub!)})`).toEqual([]);
    },
  );

  test("mọi cặp phòng đều có đường đi qua lại", () => {
    const unreachable = routableRooms.flatMap((start) => routableRooms
      .filter((end) => end.solidid !== start.solidid &&
        !findRoomRoute(graph, labels, start.solidid, end.solidid).ok)
      .map((end) => `${start.solidid} → ${end.solidid}`));
    expect(unreachable.length, `Các cặp không có đường: ${unreachable.slice(0, 20).join(", ")}${unreachable.length > 20 ? ", …" : ""}`)
      .toBe(0);
  });
});
