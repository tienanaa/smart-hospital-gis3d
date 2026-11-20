import { resources, type ResourceName } from "@/lib/api/resources";
import { getSupabaseClient } from "@/lib/db/supabase";

export type Pagination = {
  page: number;
  limit: number;
};

export async function getResourceRows(
  resource: ResourceName,
  { page, limit }: Pagination,
) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, count, error } = await getSupabaseClient()
    .from(resources[resource])
    .select("*", { count: "exact" })
    .range(from, to);

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
