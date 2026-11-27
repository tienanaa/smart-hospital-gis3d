import { connection } from "next/server";
import { getFireScenarios, getGridConfig } from "@/lib/repositories/fire.repository";

/**
 * GET /api/v1/fire-scenarios
 * Danh sách kịch bản cháy (kèm các bước thời gian có dữ liệu) và cấu hình lưới voxel.
 */
export async function GET() {
  await connection();
  try {
    const [scenarios, config] = await Promise.all([getFireScenarios(), getGridConfig()]);
    return Response.json({ data: scenarios, config });
  } catch (error) {
    console.error("Failed to load fire scenarios:", error);
    return Response.json(
      { error: "Không thể tải danh sách kịch bản cháy." },
      { status: 500 },
    );
  }
}
