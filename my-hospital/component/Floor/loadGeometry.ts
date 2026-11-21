import type { Vertex, Edge, Solid, Face, GeometryData } from "./types";

const pageSize = 100;

type Resource = "vertices" | "edges" | "solids" | "faces";

type ApiResponse<T> = {
  data: T[];
  pagination: {
    totalPages: number;
  };
};

async function fetchResource<T>(resource: Resource): Promise<T[]> {
  const firstResponse = await fetch(
    `/api/v1/${resource}?page=1&limit=${pageSize}`,
    { cache: "no-store" },
  );
  const firstPage = (await firstResponse.json()) as
    | ApiResponse<T>
    | { error?: string };

  if (!firstResponse.ok || !("data" in firstPage)) {
    throw new Error(
      "error" in firstPage && firstPage.error
        ? firstPage.error
        : `Không thể tải dữ liệu ${resource}.`,
    );
  }

  const rows = [...firstPage.data];
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const response = await fetch(
      `/api/v1/${resource}?page=${page}&limit=${pageSize}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as
      | ApiResponse<T>
      | { error?: string };

    if (!response.ok || !("data" in result)) {
      throw new Error(
        "error" in result && result.error
          ? result.error
          : `Không thể tải dữ liệu ${resource}, trang ${page}.`,
      );
    }

    rows.push(...result.data);
  }

  return rows;
}

export async function loadGeometry(): Promise<GeometryData> {
  const [vertices, edges, solids, faces] = await Promise.all([
    fetchResource<Vertex>("vertices"),
    fetchResource<Edge>("edges"),
    fetchResource<Solid>("solids"),
    fetchResource<Face>("faces"),
  ]);
  return { vertices, edges, solids, faces };
}
