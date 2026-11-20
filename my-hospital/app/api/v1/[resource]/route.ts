import { isResourceName } from "@/lib/api/resources";
import { getResourceRows } from "@/lib/repositories/resource.repository";

const defaultPage = 1;
const defaultLimit = 50;
const maxLimit = 100;

function parsePositiveInteger(value: string | null, fallback: number) {
  if (value === null) {
    return { value: fallback };
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return { error: "Tham số phân trang phải là số nguyên dương." };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { error: "Tham số phân trang vượt quá giới hạn." };
  }

  return { value: parsed };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;

  if (!isResourceName(resource)) {
    return Response.json({ error: "Không tìm thấy tài nguyên." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const pageResult = parsePositiveInteger(
    searchParams.get("page"),
    defaultPage,
  );
  const limitResult = parsePositiveInteger(
    searchParams.get("limit"),
    defaultLimit,
  );

  if ("error" in pageResult) {
    return Response.json({ error: pageResult.error }, { status: 400 });
  }

  if ("error" in limitResult) {
    return Response.json({ error: limitResult.error }, { status: 400 });
  }

  if (limitResult.value > maxLimit) {
    return Response.json(
      { error: `Tham số limit không được vượt quá ${maxLimit}.` },
      { status: 400 },
    );
  }

  try {
    const result = await getResourceRows(resource, {
      page: pageResult.value,
      limit: limitResult.value,
    });

    return Response.json({
      ...result,
      pagination: {
        ...result.pagination,
        totalPages: Math.ceil(result.pagination.total / limitResult.value),
      },
    });
  } catch (error) {
    console.error(`Failed to load API resource "${resource}":`, error);
    return Response.json(
      { error: "Không thể tải dữ liệu từ cơ sở dữ liệu." },
      { status: 500 },
    );
  }
}
