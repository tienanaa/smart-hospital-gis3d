"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGeometry } from "./loadGeometry";
import { buildFloorModel } from "./roomGeometry";
import { RoomPopup } from "./RoomPopup";
import { updateFloorScene, useFloorScene } from "./useFloorScene";
import type { FloorModel } from "./types";

export default function Floor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const [model, setModel] = useState<FloorModel | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const selectRoom = useCallback((id: string) => {
    setListOpen(false);
    setRoomId(id);
  }, []);

  const closePopup = useCallback(() => {
    setListOpen(false);
    setRoomId(null);
    listButtonRef.current?.focus();
  }, []);

  useFloorScene(hostRef, model, selectRoom, setSceneError);

  useEffect(() => {
    let active = true;
    loadGeometry().then((data) => {
      if (active) setModel(buildFloorModel(data));
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Không thể tải dữ liệu bệnh viện.");
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (model) updateFloorScene(model, level, roomId);
  }, [model, level, roomId]);

  const rooms = model?.rooms ?? [];
  const visibleRooms = rooms.filter((room) => level === null || room.level === level);
  const selectedRoom = visibleRooms.find((room) => room.solid.solidid === roomId);
  const levels = [...new Set(rooms.flatMap((room) => room.level === null ? [] : [room.level]))]
    .sort((a, b) => a - b);
  const hasGeometry = visibleRooms.some((room) => room.mesh);

  function selectFloor(nextLevel: number | null) {
    if (nextLevel !== null && selectedRoom?.level !== nextLevel) setRoomId(null);
    setLevel(nextLevel);
  }

  const showList = listOpen && visibleRooms.length > 0;
  const popupOpen = Boolean(selectedRoom || showList);

  useEffect(() => {
    if (!popupOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [popupOpen, closePopup]);

  return (
    <section aria-label="Mô hình không gian bệnh viện" className="relative h-full overflow-hidden">
      <div ref={hostRef} className={hasGeometry ? "absolute inset-0" : "absolute inset-0 invisible"} aria-label="Mô hình bệnh viện 3D" />
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex max-h-[45dvh] w-fit max-w-full shrink-0 flex-wrap items-center gap-2 overflow-y-auto rounded-xl border border-white/15 bg-neutral-950/90 p-2 text-white shadow-lg">
          <h1 className="sr-only">Mô hình không gian bệnh viện</h1>
          <div role="group" aria-label="Chọn tầng" className="flex flex-wrap gap-1">
            {[null, ...levels].map((option) => (
              <button key={option ?? "all"} type="button" aria-pressed={level === option}
                onClick={() => selectFloor(option)}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/15 aria-pressed:bg-teal-700">
                {option === null ? "Toàn bệnh viện" : `Tầng ${option}`}
              </button>
            ))}
          </div>
          <button ref={listButtonRef} type="button" disabled={!visibleRooms.length}
            aria-expanded={showList} aria-controls={showList ? "room-popup" : undefined}
            onClick={() => {
              setRoomId(null);
              setListOpen(!showList);
            }}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-50 disabled:opacity-50">
            Danh sách phòng{model ? ` (${visibleRooms.length})` : ""}
          </button>
        </div>

        {loadError ? (
          <div role="alert" className="pointer-events-auto w-fit rounded-xl bg-red-50 p-3 text-sm text-red-800">
            <p>{loadError}</p>
            <button type="button" className="mt-2 rounded-lg bg-red-800 px-3 py-2 text-white" onClick={() => {
              setLoadError(null);
              setAttempt((value) => value + 1);
            }}>Thử lại</button>
          </div>
        ) : (!model || sceneError || !hasGeometry) && (
          <p role="status" className="w-fit rounded-lg bg-black/80 px-3 py-2 text-sm text-slate-200">
            {sceneError ?? (!model ? "Đang tải dữ liệu…" : rooms.length
              ? "Chưa có dữ liệu hình học cho chế độ xem này." : "Chưa có phòng trong cơ sở dữ liệu.")}
          </p>
        )}

        <div className="flex min-h-0 flex-1 items-end justify-end sm:items-start">
          {popupOpen && (
            <RoomPopup room={selectedRoom} rooms={visibleRooms} onSelect={selectRoom} onClose={closePopup} />
          )}
        </div>
        {hasGeometry && !sceneError && !popupOpen && (
          <p className="hidden w-fit shrink-0 rounded-lg bg-black/80 px-3 py-2 text-sm text-slate-200 sm:block">
            Kéo để xoay · Cuộn để thu phóng · Kéo chuột phải để dịch chuyển · Bấm để chọn phòng
          </p>
        )}
      </div>
    </section>
  );
}
