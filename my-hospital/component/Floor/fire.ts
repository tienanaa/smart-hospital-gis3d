import type { DbVoxelGridConfig, DbVoxelState } from "@/lib/dijkstra";

export type FireScenario = {
  scenarioid: string;
  scenarioname: string;
  description: string | null;
  timeSteps: number[];
};

export type FireOverview = {
  scenarios: FireScenario[];
  config: DbVoxelGridConfig | null;
};

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? fallback);
  }
  return body as T;
}

export async function loadFireOverview(): Promise<FireOverview> {
  const body = await getJson<{ data: FireScenario[]; config: DbVoxelGridConfig | null }>(
    "/api/v1/fire-scenarios",
    "Không thể tải danh sách kịch bản cháy.",
  );
  return { scenarios: body.data, config: body.config };
}

const voxelCache = new Map<string, Promise<DbVoxelState[]>>();

/** Voxel vượt ngưỡng cảnh báo của một kịch bản tại một bước (có cache phía client). */
export function loadFireVoxels(scenarioId: string, timeStep: number): Promise<DbVoxelState[]> {
  const key = `${scenarioId}:${timeStep}`;
  let request = voxelCache.get(key);
  if (!request) {
    request = getJson<{ data: DbVoxelState[] }>(
      `/api/v1/fire-scenarios/${encodeURIComponent(scenarioId)}/voxels?step=${timeStep}`,
      "Không thể tải dữ liệu khói/nhiệt.",
    ).then((body) => body.data);
    request.catch(() => voxelCache.delete(key));
    voxelCache.set(key, request);
  }
  return request;
}
