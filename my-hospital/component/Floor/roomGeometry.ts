import * as THREE from "three";
import type { Json } from "@/lib/db/database.types";
import type { Vertex, Edge, Solid, Face, GeometryData, FloorModel, Room } from "./types";

const roomHeight = 3;
const spaceColors: Record<string, number> = {
  consultationroom: 0x60a5fa,
  inpatientward: 0xe74c3c,
  operatingroom: 0x3498db,
  recoveryroom: 0x9b59b6,
  dutyroom: 0xf1c40f,
  elevator: 0x1abc9c,
  restroom: 0x95a5a6,
  staircase: 0xe67e22,
  emergencyroom: 0xe74c3c,
  pharmacy: 0x2ecc71,
  reception: 0x3498db,
  cafeteria: 0xf1c40f,
  department: 0x9b59b6,
  servicearea: 0x16a085,
};

const namedSpaceTypes = [
  ["phòng bệnh nội trú", "inpatientward"],
  ["phòng phẫu thuật", "operatingroom"],
  ["phòng hồi sức", "recoveryroom"],
  ["phòng trực", "dutyroom"],
  ["phòng vệ sinh", "restroom"],
] as const;

function getRoomColor({ spacetype, metadata }: Solid) {
  const type = spacetype.trim().toLowerCase();
  const name = metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof metadata.name === "string" ? metadata.name.trim().toLowerCase() : "";
  const namedType = namedSpaceTypes.find(([prefix]) => name.startsWith(prefix))?.[1];
  return spaceColors[type] ?? (namedType ? spaceColors[namedType] : 0x95a5a6);
}

function stringList(value: Json): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function getFaceVertices(
  face: Face,
  edgesById: Map<string, Edge>,
  verticesById: Map<string, Vertex>,
): Vertex[] | null {
  const edgeIds = stringList(face.edge_list);
  if (edgeIds.length < 3) {
    return null;
  }

  const firstEdge = edgesById.get(edgeIds[0]);
  if (!firstEdge) {
    return null;
  }

  const startId = firstEdge.start_vertex;
  let currentId = firstEdge.end_vertex;
  const orderedIds = [startId, currentId];
  const usedEdges = new Set([edgeIds[0]]);

  while (usedEdges.size < edgeIds.length) {
    const nextEdgeId = edgeIds.find((edgeId) => {
      if (usedEdges.has(edgeId)) {
        return false;
      }

      const edge = edgesById.get(edgeId);
      return (
        edge !== undefined &&
        (edge.start_vertex === currentId || edge.end_vertex === currentId)
      );
    });

    if (!nextEdgeId) {
      return null;
    }

    const nextEdge = edgesById.get(nextEdgeId);
    if (!nextEdge) {
      return null;
    }

    currentId =
      nextEdge.start_vertex === currentId
        ? nextEdge.end_vertex
        : nextEdge.start_vertex;
    orderedIds.push(currentId);
    usedEdges.add(nextEdgeId);
  }

  if (currentId !== startId) {
    return null;
  }

  const polygon = orderedIds
    .slice(0, -1)
    .map((vertexId) => verticesById.get(vertexId));

  return polygon.length >= 3 && polygon.every(Boolean)
    ? (polygon as Vertex[])
    : null;
}

function getFallbackVertices(
  solid: Solid,
  vertices: Vertex[],
): Vertex[] | null {
  const prefix = `v_${solid.solidid.replace(/^s_/, "")}_`;
  const polygon = vertices
    .filter((vertex) => vertex.vertexid.startsWith(prefix))
    .sort((a, b) =>
      a.vertexid.localeCompare(b.vertexid, undefined, { numeric: true }),
    );

  return polygon.length >= 3 ? polygon : null;
}

function makeRoomGeometry(polygon: Vertex[]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].y);
  for (const vertex of polygon.slice(1)) {
    shape.lineTo(vertex.x, vertex.y);
  }
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: roomHeight,
    bevelEnabled: false,
    curveSegments: 1,
  });
}

export function buildFloorModel(data: GeometryData): FloorModel {
  const verticesById = new Map(
    data.vertices.map((vertex) => [vertex.vertexid, vertex]),
  );
  const edgesById = new Map(data.edges.map((edge) => [edge.edgeid, edge]));
  const facesById = new Map(data.faces.map((face) => [face.faceid, face]));
  const floorFacesBySolid = new Map<string, Face[]>();
  for (const face of data.faces) {
    if (face.surfacetype.toLowerCase() !== "floor") continue;
    const faces = floorFacesBySolid.get(face.solidid) ?? [];
    faces.push(face);
    floorFacesBySolid.set(face.solidid, faces);
  }
  const groups = new Map<number, THREE.Group>();
  const rooms: Room[] = [];
  let skippedCount = 0;

  for (const solid of data.solids) {
    const faces = stringList(solid.face_list)
      .map((faceId) => facesById.get(faceId))
      .filter((face): face is Face => face !== undefined);
    const polygon =
      [...new Set([...(floorFacesBySolid.get(solid.solidid) ?? []), ...faces])]
        .map((face) => getFaceVertices(face, edgesById, verticesById))
        .find((points) => points !== null) ??
      getFallbackVertices(solid, data.vertices);

    const level = Number.isFinite(solid.floor_level)
      ? solid.floor_level
      : polygon ? Math.round(polygon.reduce((sum, vertex) => sum + vertex.z, 0) /
          polygon.length /
          4) + 1 : null;
    if (!polygon || level === null) {
      rooms.push({ solid, level, mesh: null });
      skippedCount += 1;
      continue;
    }
    let group = groups.get(level);
    if (!group) {
      group = new THREE.Group();
      group.name = `floor-${level}`;
      groups.set(level, group);
    }

    const geometry = makeRoomGeometry(polygon);
    const baseZ = polygon.reduce((sum, vertex) => sum + vertex.z, 0) /
      polygon.length;
    const material = new THREE.MeshStandardMaterial({
      color: getRoomColor(solid),
      transparent: true,
      opacity: 1,
      roughness: 0.3,
    });
    const room = new THREE.Mesh(geometry, material);
    room.position.z = baseZ;
    room.userData.roomId = solid.solidid;

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    room.add(outline);
    group.add(room);
    rooms.push({ solid, level, mesh: room });
  }

  for (const group of groups.values()) {
    group.add(makeFloorSlab(group));
  }

  return {
    floors: [...groups.entries()]
      .sort(([levelA], [levelB]) => levelA - levelB)
      .map(([level, group]) => ({ level, group })),
    rooms,
    skippedCount,
  };
}

function makeFloorSlab(rooms: THREE.Group) {
  const bounds = new THREE.Box3().setFromObject(rooms);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const thickness = 0.24;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(size.x+3, size.y+3, thickness),
    new THREE.MeshStandardMaterial({ color: 0x596579, roughness: 0.9 }),
  );
  slab.name = "floor-slab";
  slab.position.set(center.x, center.y, bounds.min.z - thickness / 2 - 0.001);
  return slab;
}

