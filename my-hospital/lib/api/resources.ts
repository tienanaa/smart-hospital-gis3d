import type { Database } from "@/lib/db/database.types";

type TableName = keyof Database["public"]["Tables"];

export const resources = {
  vertices: "udm_vertex",
  edges: "udm_edge",
  solids: "udm_solid",
  faces: "udm_face",
  complexes: "udm_complex",
  nodes: "node",
  arcs: "arc",
  node_solid: "node_solid",
} as const satisfies Record<string, TableName>;

export type ResourceName = keyof typeof resources;

export function isResourceName(value: string): value is ResourceName {
  return Object.prototype.hasOwnProperty.call(resources, value);
}
