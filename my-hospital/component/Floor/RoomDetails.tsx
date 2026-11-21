import type { Room } from "./types";

export function roomName({ solid }: Room) {
  const { metadata, solidid } = solid;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof metadata.name === "string" && metadata.name.trim()
    ? metadata.name.trim()
    : solidid;
}

export function RoomDetails({ room }: { room: Room }) {
  const metadata = room.solid.metadata;
  const fields = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? Object.entries(metadata).filter(([key, value]) => key !== "name" && value != null)
    : metadata != null ? [["Dữ liệu bổ sung", metadata] as const] : [];

  return (
    <div aria-live="polite" className="p-4">
      <p className="text-lg font-semibold text-teal-800 [overflow-wrap:anywhere]">{roomName(room)}</p>
      <dl className="mt-3 divide-y divide-slate-100 text-sm">
        {[
          ["Mã phòng", room.solid.solidid],
          ["Tầng", room.level ?? "Chưa xác định"],
          ["Loại không gian", room.solid.spacetype],
          ...fields,
        ].map(([label, value], index) => (
          <div key={index} className="py-2 [overflow-wrap:anywhere]">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-900">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
