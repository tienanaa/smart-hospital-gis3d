import { getGridConfig, getVoxels } from "@/lib/repositories/fire.repository";

/**
 * GET /api/v1/fire-scenarios/:scenarioId/voxels?step=3[&all=1]
 * Các ô voxel khói/nhiệt của kịch bản tại một bước thời gian.
 * Mặc định chỉ trả ô vượt ngưỡng cảnh báo; `all=1` trả toàn bộ.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ scenarioId: string }> },
) {
  const { scenarioId } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const step = searchParams.get("step") ?? "1";
  const includeAll = searchParams.get("all") === "1";

  if (!/^[A-Za-z0-9_-]{1,50}$/.test(scenarioId)) {
    return Response.json({ error: "Mã kịch bản không hợp lệ." }, { status: 400 });
  }
  if (!/^\d{1,6}$/.test(step)) {
    return Response.json({ error: "Tham số step phải là số nguyên không âm." }, { status: 400 });
  }

  try {
    const config = await getGridConfig();
    if (!config) {
      return Response.json({ error: "Chưa cấu hình lưới voxel." }, { status: 404 });
    }
    const timeStep = Number(step);
    const data = await getVoxels(scenarioId, timeStep, config, includeAll);
    return Response.json({ data, scenarioId, timeStep, count: data.length });
  } catch (error) {
    console.error(`Failed to load voxels for scenario "${scenarioId}":`, error);
    return Response.json(
      { error: "Không thể tải dữ liệu voxel của kịch bản cháy." },
      { status: 500 },
    );
  }
}
