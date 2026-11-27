import {
  evaluateArcSafety,
  findNearestEmergencyExit,
  findShortestPath,
  type DbArc,
  type DbNode,
  type DbNodeSolid,
  type DbVoxelGridConfig,
  type DbVoxelState,
  type PathResult,
} from "@/lib/dijkstra";
import { fetchResource } from "./loadGeometry";

/** Đồ thị mạng lưới đường đi (node + arc) và liên kết node ↔ phòng. */
export type RoutingGraph = {
  nodes: DbNode[];
  arcs: DbArc[];
  nodeById: Map<string, DbNode>;
  /** nodeid → solidid của phòng chứa node đó */
  roomOfNode: Map<string, string>;
  /** solidid → danh sách nodeid nằm trong phòng */
  nodesOfRoom: Map<string, string[]>;
};

/** Thông tin hiển thị của phòng dùng để đặt tên mốc chỉ đường. */
/** Thông tin hiển thị của phòng; `spacetype` dùng để nhận biết thang máy. */
export type RoomLabel = { name: string; level: number | null; spacetype?: string };

export type RoutePoint = { x: number; y: number; z: number; level: number };

/** Dữ liệu khói/nhiệt của kịch bản cháy đang chọn (null = bình thường). */
export type FireContext = {
  scenarioName: string;
  voxels: DbVoxelState[];
  config: DbVoxelGridConfig;
} | null;

export type RouteMode = "room" | "exit";

export type StepKind =
  | "start"
  | "straight"
  | "slight-left"
  | "slight-right"
  | "left"
  | "right"
  | "uturn"
  | "up"
  | "down"
  | "end";

export type RouteStep = {
  kind: StepKind;
  title: string;
  detail?: string;
  /** Quãng đường (m) đi từ mốc trước đến mốc này */
  distance: number;
  level: number;
  nodeId: string;
  /** Đoạn đường dẫn tới mốc này có đi qua vùng khói/nhiệt (đã bị phạt chi phí) */
  hazard?: boolean;
};

export type RouteResult =
  | {
      ok: true;
      mode: RouteMode;
      startId: string;
      endId: string | null;
      distance: number;
      steps: RouteStep[];
      points: RoutePoint[];
      /** Cờ nguy hiểm cho từng đoạn points[i] → points[i + 1] */
      hazards: boolean[];
      levels: number[];
      scenarioName: string | null;
    }
  | { ok: false; message: string };

const floorHeight = 4;
const verticalThreshold = 0.5;

export async function loadRoutingGraph(): Promise<RoutingGraph> {
  const [nodes, arcs, nodeSolids] = await Promise.all([
    fetchResource<DbNode>("nodes"),
    fetchResource<DbArc>("arcs"),
    fetchResource<DbNodeSolid>("node_solid"),
  ]);
  return buildRoutingGraph(nodes, arcs, nodeSolids);
}

/** Dựng đồ thị tìm đường từ dữ liệu thô của bảng node, arc, node_solid. */
export function buildRoutingGraph(nodes: DbNode[], arcs: DbArc[], nodeSolids: DbNodeSolid[]): RoutingGraph {
  const roomOfNode = new Map<string, string>();
  const nodesOfRoom = new Map<string, string[]>();
  for (const { nodeid, solidid } of nodeSolids) {
    roomOfNode.set(nodeid, solidid);
    nodesOfRoom.set(solidid, [...(nodesOfRoom.get(solidid) ?? []), nodeid]);
  }

  return {
    nodes,
    arcs,
    nodeById: new Map(nodes.map((node) => [node.nodeid, node])),
    roomOfNode,
    nodesOfRoom,
  };
}

function levelOf(
  node: DbNode,
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
) {
  const solidId = graph.roomOfNode.get(node.nodeid);
  const roomLevel = solidId ? labels.get(solidId)?.level : null;
  return roomLevel ?? Math.round(node.z / floorHeight) + 1;
}

/** Tên mốc tại một node: tên phòng chứa node, hoặc phòng gần nhất cùng tầng. */
function landmarkOf(
  nodeId: string,
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
) {
  const solidId = graph.roomOfNode.get(nodeId);
  if (solidId) return labels.get(solidId)?.name ?? solidId;

  const node = graph.nodeById.get(nodeId);
  if (!node) return nodeId;

  let nearest: { name: string; distance: number } | null = null;
  for (const [otherId, otherSolid] of graph.roomOfNode) {
    const other = graph.nodeById.get(otherId);
    if (!other || Math.abs(other.z - node.z) > verticalThreshold) continue;
    const distance = Math.hypot(other.x - node.x, other.y - node.y);
    if (distance <= 3.5 && (!nearest || distance < nearest.distance)) {
      nearest = { name: labels.get(otherSolid)?.name ?? otherSolid, distance };
    }
  }
  return nearest ? `ngã rẽ gần ${nearest.name}` : "ngã rẽ hành lang";
}

const turnNames: Record<Exclude<StepKind, "start" | "end" | "up" | "down" | "straight">, string> = {
  "slight-left": "Chếch sang trái",
  "slight-right": "Chếch sang phải",
  left: "Rẽ trái",
  right: "Rẽ phải",
  uturn: "Quay lại",
};

function classifyTurn(angle: number): StepKind {
  const abs = Math.abs(angle);
  if (abs >= 150) return "uturn";
  if (abs >= 50) return angle > 0 ? "left" : "right";
  if (abs >= 20) return angle > 0 ? "slight-left" : "slight-right";
  return "straight";
}

/**
 * Dựng danh sách chỉ đường gồm các mốc ngã rẽ / lên xuống tầng từ chuỗi node.
 * Trục x sang phải, y hướng lên khi nhìn từ trên xuống (z hướng lên),
 * nên tích có hướng dương nghĩa là rẽ trái.
 */
function buildSteps(
  pathNodes: DbNode[],
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
  startName: string,
  endName: string,
  hazards: boolean[],
): RouteStep[] {
  const level = (node: DbNode) => levelOf(node, graph, labels);
  const first = pathNodes[0];
  const last = pathNodes[pathNodes.length - 1];
  const steps: RouteStep[] = [{
    kind: "start",
    title: `Xuất phát từ ${startName}`,
    detail: `Tầng ${level(first)}`,
    distance: 0,
    level: level(first),
    nodeId: first.nodeid,
  }];

  let run = 0;
  let runHazard = false;
  let heading: { x: number; y: number } | null = null;
  let i = 0;
  while (i < pathNodes.length - 1) {
    const a = pathNodes[i];
    const b = pathNodes[i + 1];
    const dz = b.z - a.z;

    if (Math.abs(dz) > verticalThreshold) {
      let j = i + 1;
      while (
        j < pathNodes.length - 1 &&
        Math.abs(pathNodes[j + 1].z - pathNodes[j].z) > verticalThreshold
      ) j += 1;
      const top = pathNodes[j];
      const up = top.z > a.z;
      steps.push({
        kind: up ? "up" : "down",
        title: `Đi ${up ? "lên" : "xuống"} tầng ${level(top)}`,
        detail: `Dùng ${landmarkOf(a.nodeid, graph, labels)} · từ tầng ${level(a)}`,
        distance: run,
        level: level(a),
        nodeId: a.nodeid,
        hazard: runHazard || hazards.slice(i, j + 1).some(Boolean),
      });
      run = 0;
      runHazard = false;
      heading = null;
      i = j;
      continue;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.05) {
      i += 1;
      continue;
    }
    const direction = { x: dx / length, y: dy / length };

    if (heading) {
      const cross = heading.x * direction.y - heading.y * direction.x;
      const dot = heading.x * direction.x + heading.y * direction.y;
      const kind = classifyTurn((Math.atan2(cross, dot) * 180) / Math.PI);
      if (kind !== "straight") {
        steps.push({
          kind,
          title: `${turnNames[kind as keyof typeof turnNames]} tại ${landmarkOf(a.nodeid, graph, labels)}`,
          distance: run,
          level: level(a),
          nodeId: a.nodeid,
          hazard: runHazard,
        });
        run = 0;
        runHazard = false;
      }
    }

    run += length;
    runHazard ||= hazards[i];
    heading = direction;
    i += 1;
  }

  steps.push({
    kind: "end",
    title: `Đến ${endName}`,
    detail: `Tầng ${level(last)}`,
    distance: run,
    level: level(last),
    nodeId: last.nodeid,
    hazard: runHazard,
  });
  return steps;
}

const isElevator = (graph: RoutingGraph, labels: Map<string, RoomLabel>, nodeId: string) => {
  const solidId = graph.roomOfNode.get(nodeId);
  return solidId !== undefined && labels.get(solidId)?.spacetype?.toLowerCase() === "elevator";
};

/**
 * Các cung được phép đi. Khi có sự cố cháy, bỏ cung nối giữa hai tầng thang máy
 * (trục thang máy): theo quy định PCCC không dùng thang máy để thoát nạn.
 */
function usableArcs(graph: RoutingGraph, labels: Map<string, RoomLabel>, fire: FireContext) {
  if (!fire) return graph.arcs;
  return graph.arcs.filter((arc) =>
    !(isElevator(graph, labels, arc.from_node) && isElevator(graph, labels, arc.to_node)));
}

function fireOptions(fire: FireContext) {
  return fire ? { voxels: fire.voxels, gridConfig: fire.config } : undefined;
}

function shorter(a: PathResult | null, b: PathResult) {
  return b.success && (a === null || (b.totalCost ?? Infinity) < (a.totalCost ?? Infinity)) ? b : a;
}

/** Chuyển kết quả Dijkstra thành tuyến hiển thị: toạ độ, đoạn nguy hiểm, mốc chỉ đường. */
function toRoute(
  best: PathResult,
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
  fire: FireContext,
  mode: RouteMode,
  startId: string,
  startName: string,
  endOf: (lastNodeId: string) => { id: string | null; name: string },
): RouteResult {
  const pathNodes = best.pathNodes
    .map((id) => graph.nodeById.get(id))
    .filter((node): node is DbNode => node !== undefined);
  const points = pathNodes.map((node) => ({
    x: node.x,
    y: node.y,
    z: node.z,
    level: levelOf(node, graph, labels),
  }));

  const voxelMap = new Map((fire?.voxels ?? []).map((v) => [`${v.i_idx}_${v.j_idx}_${v.k_idx}`, v]));
  const hazards = pathNodes.slice(1).map((node, index) => fire !== null &&
    evaluateArcSafety(pathNodes[index], node, voxelMap, fire.config).multiplier > 1);

  const end = endOf(pathNodes[pathNodes.length - 1].nodeid);
  return {
    ok: true,
    mode,
    startId,
    endId: end.id,
    distance: best.totalCost ?? 0,
    steps: buildSteps(pathNodes, graph, labels, startName, end.name, hazards),
    points,
    hazards,
    levels: [...new Set(points.map((point) => point.level))].sort((a, b) => a - b),
    scenarioName: fire?.scenarioName ?? null,
  };
}

/** Tìm đường ngắn nhất giữa hai phòng (thử mọi node của phòng xuất phát), né vùng cháy nếu có. */
export function findRoomRoute(
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
  startId: string,
  endId: string,
  fire: FireContext = null,
): RouteResult {
  const startName = labels.get(startId)?.name ?? startId;
  const endName = labels.get(endId)?.name ?? endId;
  if (startId === endId) {
    return { ok: false, message: "Điểm đi và điểm đến đang là cùng một phòng." };
  }

  const startNodes = graph.nodesOfRoom.get(startId) ?? [];
  const endNodes = graph.nodesOfRoom.get(endId) ?? [];
  const missing = !startNodes.length ? startName : !endNodes.length ? endName : null;
  if (missing) {
    return { ok: false, message: `${missing} chưa được nối vào mạng lưới đường đi.` };
  }

  const arcs = usableArcs(graph, labels, fire);
  let best: PathResult | null = null;
  for (const nodeId of startNodes) {
    best = shorter(best, findShortestPath(nodeId, endNodes, graph.nodes, arcs, fireOptions(fire)));
  }

  if (!best) {
    return {
      ok: false,
      message: fire
        ? `Không có đường an toàn từ ${startName} đến ${endName}: các lối đi đã bị khói/lửa chặn (${fire.scenarioName}).`
        : `Không tìm thấy đường đi từ ${startName} đến ${endName} (có thể lối đi đang bị chặn).`,
    };
  }

  return toRoute(best, graph, labels, fire, "room", startId, startName, () => ({ id: endId, name: endName }));
}

/** Tìm lối thoát hiểm gần nhất (node is_emergency_exit) từ một phòng, né vùng cháy nếu có. */
export function findExitRoute(
  graph: RoutingGraph,
  labels: Map<string, RoomLabel>,
  startId: string,
  fire: FireContext = null,
): RouteResult {
  const startName = labels.get(startId)?.name ?? startId;
  const startNodes = graph.nodesOfRoom.get(startId) ?? [];
  if (!startNodes.length) {
    return { ok: false, message: `${startName} chưa được nối vào mạng lưới đường đi.` };
  }
  if (!graph.nodes.some((node) => node.is_emergency_exit)) {
    return { ok: false, message: "Chưa có nút nào được đánh dấu là lối thoát hiểm." };
  }

  const arcs = usableArcs(graph, labels, fire);
  let best: PathResult | null = null;
  for (const nodeId of startNodes) {
    best = shorter(best, findNearestEmergencyExit(nodeId, graph.nodes, arcs, fireOptions(fire)));
  }

  if (!best) {
    return {
      ok: false,
      message: fire
        ? "Không có đường thoát an toàn: mọi lối thoát đã bị khói/lửa chặn. Ở lại trong phòng, đóng kín cửa, chèn khăn ướt vào khe cửa, ra cửa sổ báo hiệu và gọi 114."
        : `Không tìm thấy đường từ ${startName} đến lối thoát hiểm nào.`,
    };
  }

  return toRoute(best, graph, labels, fire, "exit", startId, startName, (nodeId) => {
    const solidId = graph.roomOfNode.get(nodeId) ?? null;
    const landmark = landmarkOf(nodeId, graph, labels);
    const name = solidId ? `lối thoát hiểm (${landmark})`
      : landmark.startsWith("ngã rẽ gần ") ? `lối thoát hiểm gần ${landmark.slice("ngã rẽ gần ".length)}`
      : "lối thoát hiểm";
    return { id: solidId, name };
  });
}
