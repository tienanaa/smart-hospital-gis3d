// Thuật toán thuần (không phụ thuộc Supabase) để dùng được cả ở client.
// Các hàm tải dữ liệu trực tiếp từ Supabase nằm ở lib/routingData.server.ts

// ==========================================
// 1. KIỂU DỮ LIỆU KHỚP VỚI SUPABASE
// ==========================================

export interface DbNode {
  nodeid: string;
  x: number;
  y: number;
  z: number;
  is_emergency_exit: boolean;
}

export interface DbArc {
  arcid: string;
  from_node: string;
  to_node: string;
  cost: number;
  is_blocked: boolean;
}

export interface DbNodeSolid {
  nodeid: string;
  solidid: string;
}

export interface DbUdmSolid {
  solidid: string;
  spacetype: string;
  face_list: string[];
  metadata: { name?: string; [key: string]: unknown } | string | null;
  floor_level: number;
}

export interface DbFireScenario {
  scenarioid: string;
  scenarioname: string;
  description: string;
}

export interface DbVoxelGridConfig {
  configid: string;
  x_min: number;
  y_min: number;
  z_min: number;
  x_max: number;
  y_max: number;
  z_max: number;
  dx: number;
  dy: number;
  dz: number;
  smoke_penalty: number;
  smoke_block: number;
  temp_penalty: number;
  temp_block: number;
  penalty_factor: number;
}

export interface DbVoxelState {
  scenarioid: string;
  time_step: number;
  i_idx: number;
  j_idx: number;
  k_idx: number;
  smoke_density: number;
  temperature: number;
}

export interface RoomOption {
  solidid: string;
  name: string;
  spacetype: string;
  floor_level: number;
  nodeid: string;
}

export interface PathResult {
  success: boolean;
  message: string;
  destinationNode?: string;
  totalCost: number | null;
  pathNodes: string[];
  pathArcs: string[];
  pathCoords: Array<{ x: number; y: number; z: number }>;
}

interface AdjacencyEdge {
  to: string;
  cost: number;
  arcid: string;
}

// ==========================================
// 3. TÌM KIẾM PHÒNG (GHÉP UDM_SOLID + NODE_SOLID)
// ==========================================

export function buildRoomOptions(
  udmSolids: DbUdmSolid[],
  nodeSolids: DbNodeSolid[],
): RoomOption[] {
  const solidToNode = new Map<string, string>();
  for (const ns of nodeSolids) {
    solidToNode.set(ns.solidid, ns.nodeid);
  }

  const rooms: RoomOption[] = [];

  for (const solid of udmSolids) {
    const nodeid = solidToNode.get(solid.solidid);
    if (!nodeid) continue;

    let parsedName = solid.solidid;
    if (solid.metadata) {
      if (typeof solid.metadata === "string") {
        try {
          const obj = JSON.parse(solid.metadata);
          if (obj?.name) parsedName = String(obj.name);
        } catch {
          parsedName = solid.solidid;
        }
      } else if (typeof solid.metadata.name === "string") {
        parsedName = solid.metadata.name;
      }
    }

    rooms.push({
      solidid: solid.solidid,
      name: parsedName,
      spacetype: solid.spacetype,
      floor_level: solid.floor_level,
      nodeid,
    });
  }

  return rooms.sort(
    (a, b) =>
      a.floor_level - b.floor_level || a.name.localeCompare(b.name, "vi"),
  );
}

function normalizeVietnamese(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function searchRooms(
  rooms: RoomOption[],
  keyword: string,
): RoomOption[] {
  const q = normalizeVietnamese(keyword);
  if (!q) return rooms;

  return rooms.filter(
    (room) =>
      normalizeVietnamese(room.name).includes(q) ||
      normalizeVietnamese(room.solidid).includes(q) ||
      `tang ${room.floor_level}`.includes(q),
  );
}

// ==========================================
// 4. ĐÁNH GIÁ ĐỘ AN TOÀN CUNG ĐƯỜNG QUA VOXEL
// ==========================================

function calcDistance3D(a: DbNode, b: DbNode): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function evaluateArcSafety(
  fromNode: DbNode,
  toNode: DbNode,
  voxelMap: Map<string, DbVoxelState>,
  config: DbVoxelGridConfig,
): { blocked: boolean; multiplier: number } {
  if (voxelMap.size === 0) {
    return { blocked: false, multiplier: 1 };
  }

  const dist = calcDistance3D(fromNode, toNode);
  const stepSize = Math.min(config.dx, config.dy, config.dz) * 0.5;
  const steps = Math.max(1, Math.ceil(dist / stepSize));

  let maxMultiplier = 1;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = fromNode.x + (toNode.x - fromNode.x) * t;
    const y = fromNode.y + (toNode.y - fromNode.y) * t;
    const z = fromNode.z + (toNode.z - fromNode.z) * t;

    const i = Math.floor((x - config.x_min) / config.dx);
    const j = Math.floor((y - config.y_min) / config.dy);
    const k = Math.floor((z - config.z_min) / config.dz);

    const voxel = voxelMap.get(`${i}_${j}_${k}`);
    if (!voxel) continue;

    if (
      voxel.smoke_density >= config.smoke_block ||
      voxel.temperature >= config.temp_block
    ) {
      return { blocked: true, multiplier: Infinity };
    }

    if (
      voxel.smoke_density >= config.smoke_penalty ||
      voxel.temperature >= config.temp_penalty
    ) {
      maxMultiplier = Math.max(maxMultiplier, config.penalty_factor);
    }
  }

  return { blocked: false, multiplier: maxMultiplier };
}

// ==========================================
// 5. THUẬT TOÁN DIJKSTRA 3D (THƯỜNG & THOÁT HIỂM)
// ==========================================

export function findShortestPath(
  startNodeId: string,
  targetNodeIds: string[],
  nodes: DbNode[],
  arcs: DbArc[],
  options?: {
    voxels?: DbVoxelState[];
    gridConfig?: DbVoxelGridConfig;
    isDirected?: boolean;
  },
): PathResult {
  const isDirected = options?.isDirected ?? false;
  const voxels = options?.voxels ?? [];
  const config = options?.gridConfig;

  const nodeMap = new Map<string, DbNode>();
  const adjList = new Map<string, AdjacencyEdge[]>();

  for (const n of nodes) {
    nodeMap.set(n.nodeid, n);
    adjList.set(n.nodeid, []);
  }

  if (!nodeMap.has(startNodeId)) {
    return {
      success: false,
      message: "Điểm xuất phát không tồn tại trong mạng lưới!",
      totalCost: null,
      pathNodes: [],
      pathArcs: [],
      pathCoords: [],
    };
  }

  const voxelMap = new Map<string, DbVoxelState>();
  for (const v of voxels) {
    voxelMap.set(`${v.i_idx}_${v.j_idx}_${v.k_idx}`, v);
  }

  for (const arc of arcs) {
    if (arc.is_blocked) continue;

    const fromNode = nodeMap.get(arc.from_node);
    const toNode = nodeMap.get(arc.to_node);
    if (!fromNode || !toNode) continue;

    let multiplier = 1;
    if (config && voxelMap.size > 0) {
      const safety = evaluateArcSafety(fromNode, toNode, voxelMap, config);
      if (safety.blocked) continue;
      multiplier = safety.multiplier;
    }

    const baseCost =
      arc.cost && Number(arc.cost) > 0
        ? Number(arc.cost)
        : calcDistance3D(fromNode, toNode);
    const finalCost = baseCost * multiplier;

    adjList.get(arc.from_node)?.push({
      to: arc.to_node,
      cost: finalCost,
      arcid: arc.arcid,
    });

    if (!isDirected) {
      adjList.get(arc.to_node)?.push({
        to: arc.from_node,
        cost: finalCost,
        arcid: arc.arcid,
      });
    }
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, { from: string; arcid: string } | null>();
  const unvisited = new Set<string>();

  for (const n of nodes) {
    distances.set(n.nodeid, Infinity);
    previous.set(n.nodeid, null);
    unvisited.add(n.nodeid);
  }

  distances.set(startNodeId, 0);
  const targetSet = new Set(targetNodeIds);
  let reachedTargetId: string | null = null;

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let minDistance = Infinity;

    for (const id of unvisited) {
      const dist = distances.get(id) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentId = id;
      }
    }

    if (currentId === null || minDistance === Infinity) break;

    if (targetSet.has(currentId)) {
      reachedTargetId = currentId;
      break;
    }

    unvisited.delete(currentId);

    const neighbors = adjList.get(currentId) ?? [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.to)) continue;
      const newDist = (distances.get(currentId) ?? Infinity) + edge.cost;
      if (newDist < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, newDist);
        previous.set(edge.to, { from: currentId, arcid: edge.arcid });
      }
    }
  }

  if (!reachedTargetId) {
    return {
      success: false,
      message:
        "Không có đường thoát an toàn (tất cả lối đi đã bị lửa/khói chặn)!",
      totalCost: null,
      pathNodes: [],
      pathArcs: [],
      pathCoords: [],
    };
  }

  const pathNodes: string[] = [];
  const pathArcs: string[] = [];
  const pathCoords: Array<{ x: number; y: number; z: number }> = [];
  let curr: string | null = reachedTargetId;

  while (curr !== null) {
    const nodeObj = nodeMap.get(curr);
    if (nodeObj) {
      pathNodes.unshift(curr);
      pathCoords.unshift({ x: nodeObj.x, y: nodeObj.y, z: nodeObj.z });
    }
    const prevStep: { from: string; arcid: string } | null =
      previous.get(curr) ?? null;
    if (prevStep) {
      pathArcs.unshift(prevStep.arcid);
      curr = prevStep.from;
    } else {
      curr = null;
    }
  }

  return {
    success: true,
    message: "Tìm thấy đường đi an toàn",
    destinationNode: reachedTargetId,
    totalCost: Number((distances.get(reachedTargetId) ?? 0).toFixed(2)),
    pathNodes,
    pathArcs,
    pathCoords,
  };
}

/**
 * Tìm lối thoát hiểm gần nhất (tự động lọc các nút có is_emergency_exit = true)
 */
export function findNearestEmergencyExit(
  startNodeId: string,
  nodes: DbNode[],
  arcs: DbArc[],
  options?: {
    voxels?: DbVoxelState[];
    gridConfig?: DbVoxelGridConfig;
    isDirected?: boolean;
  },
): PathResult {
  const exitNodeIds = nodes
    .filter((n) => n.is_emergency_exit === true)
    .map((n) => n.nodeid);

  if (exitNodeIds.length === 0) {
    return {
      success: false,
      message:
        "Chưa có nút nào được đánh dấu lối thoát hiểm (is_emergency_exit)!",
      totalCost: null,
      pathNodes: [],
      pathArcs: [],
      pathCoords: [],
    };
  }

  return findShortestPath(startNodeId, exitNodeIds, nodes, arcs, options);
}
