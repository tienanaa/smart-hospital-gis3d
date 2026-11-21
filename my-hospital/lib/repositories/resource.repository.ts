import { resources, type ResourceName } from "@/lib/api/resources";
import { getSupabaseClient } from "@/lib/db/supabase";

export type Pagination = {
  page: number;
  limit: number;
};

const resourceIds = {
  vertices: ["vertexid"],
  edges: ["edgeid"],
  solids: ["solidid"],
  faces: ["faceid"],
  complexes: ["complexid"],
  nodes: ["nodeid"],
  arcs: ["arcid"],
  node_solid: ["nodeid", "solidid"],
} satisfies Record<ResourceName, string[]>;

export async function getResourceRows(
  resource: ResourceName,
  { page, limit }: Pagination,
) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const query = getSupabaseClient()
    .from(resources[resource])
    .select("*", { count: "exact" });
  for (const id of resourceIds[resource]) {
    query.order(id);
  }
  const { data, count, error } = await query.range(from, to);

  if (error) {
    throw error;
  }

  if (data === null || count === null) {
    throw new Error("Supabase returned an incomplete query result");
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
    },
  };
}
