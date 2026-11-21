import type * as THREE from "three";
import type { Database } from "@/lib/db/database.types";

export type Vertex = Database["public"]["Tables"]["udm_vertex"]["Row"];
export type Edge = Database["public"]["Tables"]["udm_edge"]["Row"];
export type Solid = Database["public"]["Tables"]["udm_solid"]["Row"];
export type Face = Database["public"]["Tables"]["udm_face"]["Row"];
export type GeometryData = {
  vertices: Vertex[];
  edges: Edge[];
  solids: Solid[];
  faces: Face[];
};

export type FloorGroup = {
  level: number;
  group: THREE.Group;
};

export type FloorModel = {
  floors: FloorGroup[];
  rooms: Room[];
  skippedCount: number;
};

export type Room = { solid: Solid; level: number | null; mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial> | null };
