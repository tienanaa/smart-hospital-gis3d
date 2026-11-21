import { useEffect, useRef } from "react";
import { RoomDetails, roomName } from "./RoomDetails";
import type { Room } from "./types";

export function RoomPopup({ room, rooms, onSelect, onClose }: {
  room?: Room;
  rooms: Room[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = room ? "Thông tin phòng" : "Danh sách phòng";

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <section id="room-popup" role="dialog" aria-labelledby="room-popup-title"
      className="pointer-events-auto flex max-h-[min(100%,55dvh)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-full sm:w-[22rem]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <h2 id="room-popup-title" className="font-semibold text-slate-900">{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng popup"
          className="grid size-9 place-items-center rounded-lg text-xl text-slate-700 hover:bg-slate-100">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div key={room?.solid.solidid ?? "list"} className="min-h-0 overflow-y-auto overscroll-contain">
        {room ? <RoomDetails room={room} /> : (
          <ul className="space-y-1 p-2">
            {rooms.map((item) => (
              <li key={item.solid.solidid}>
                <button type="button" onClick={() => onSelect(item.solid.solidid)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-teal-50">
                  <span className="[overflow-wrap:anywhere]">{roomName(item)}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {item.level === null ? "Chưa rõ tầng" : `Tầng ${item.level}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
