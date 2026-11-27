"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DbVoxelState, RoomOption } from "@/lib/dijkstra";
import { loadFireOverview, loadFireVoxels, type FireOverview } from "./fire";
import { drawFire } from "./fireLayer";
import { loadGeometry } from "./loadGeometry";
import { buildFloorModel } from "./roomGeometry";
import { RoomPopup } from "./RoomPopup";
import { roomName } from "./RoomDetails";
import { RoutePopup, type RouteEnd } from "./RoutePopup";
import { drawRoute } from "./routeLayer";
import {
  findExitRoute,
  findRoomRoute,
  loadRoutingGraph,
  type FireContext,
  type RoomLabel,
  type RouteMode,
  type RouteResult,
  type RoutingGraph,
} from "./routing";
import { updateFloorScene, useFloorScene } from "./useFloorScene";
import type { FloorModel } from "./types";

type RouteQuery = { mode: RouteMode; start: string; end: string | null };
type FireData = { scenarioId: string; timeStep: number; voxels: DbVoxelState[] };

const playbackInterval = 1500;

function computeRoute(graph: RoutingGraph, labels: Map<string, RoomLabel>, query: RouteQuery, fire: FireContext) {
  return query.mode === "exit"
    ? findExitRoute(graph, labels, query.start, fire)
    : findRoomRoute(graph, labels, query.start, query.end ?? "", fire);
}

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

  // Tìm đường
  const [graph, setGraph] = useState<RoutingGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphAttempt, setGraphAttempt] = useState(0);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>("room");
  const [routeStart, setRouteStart] = useState<string | null>(null);
  const [routeEnd, setRouteEnd] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<RouteEnd | null>(null);
  const [routeQuery, setRouteQuery] = useState<RouteQuery | null>(null);

  // Kịch bản cháy
  const [fireOverview, setFireOverview] = useState<FireOverview | null>(null);
  const [fireError, setFireError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState("S1");
  const [timeStep, setTimeStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fireData, setFireData] = useState<FireData | null>(null);

  const setRouteEndpoint = useCallback((which: RouteEnd, id: string | null) => {
    (which === "start" ? setRouteStart : setRouteEnd)(id);
    setRouteQuery(null);
  }, []);

  // Giữ trạng thái tìm đường trong ref để callback bấm phòng (truyền vào scene 3D) luôn ổn định.
  const routeUiRef = useRef({
    open: false, mode: "room" as RouteMode, pick: null as RouteEnd | null, start: null as string | null,
  });
  useEffect(() => {
    routeUiRef.current = { open: routeOpen, mode: routeMode, pick: pickTarget, start: routeStart };
  }, [routeOpen, routeMode, pickTarget, routeStart]);

  const selectRoom = useCallback((id: string) => {
    const ui = routeUiRef.current;
    if (ui.open) {
      // Đang mở popup tìm đường: bấm phòng để gán điểm bắt đầu rồi điểm kết thúc.
      const which = ui.mode === "exit" ? "start" : ui.pick ?? (ui.start ? "end" : "start");
      setRouteEndpoint(which, id);
      setPickTarget(null);
      return;
    }
    setListOpen(false);
    setRoomId(id);
  }, [setRouteEndpoint]);

  const closePopup = useCallback(() => {
    setListOpen(false);
    setRoomId(null);
    setRouteOpen(false);
    setPickTarget(null);
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
    let active = true;
    loadRoutingGraph().then((data) => {
      if (active) setGraph(data);
    }).catch((error: unknown) => {
      if (active) setGraphError(error instanceof Error ? error.message : "Không tải được mạng lưới đường đi.");
    });
    return () => { active = false; };
  }, [graphAttempt]);

  useEffect(() => {
    let active = true;
    loadFireOverview().then((data) => {
      if (active) setFireOverview(data);
    }).catch((error: unknown) => {
      if (active) setFireError(error instanceof Error ? error.message : "Không tải được kịch bản cháy.");
    });
    return () => { active = false; };
  }, []);

  const scenario = fireOverview?.scenarios.find((item) => item.scenarioid === scenarioId) ?? null;
  const timeSteps = useMemo(() => scenario?.timeSteps ?? [], [scenario]);
  const fireConfig = fireOverview?.config ?? null;
  const fireActive = timeSteps.length > 0 && fireConfig !== null;

  useEffect(() => {
    if (!fireActive) return;
    let active = true;
    loadFireVoxels(scenarioId, timeStep).then((voxels) => {
      if (active) {
        setFireError(null);
        setFireData({ scenarioId, timeStep, voxels });
      }
    }).catch((error: unknown) => {
      if (active) {
        setPlaying(false);
        setFireError(error instanceof Error ? error.message : "Không tải được dữ liệu khói/nhiệt.");
      }
    });
    return () => { active = false; };
  }, [fireActive, scenarioId, timeStep]);

  // Phát mô phỏng: tự chuyển lần lượt các bước thời gian.
  useEffect(() => {
    if (!playing || timeSteps.length < 2) return;
    const timer = window.setInterval(() => {
      setTimeStep((current) => timeSteps[(timeSteps.indexOf(current) + 1) % timeSteps.length]);
    }, playbackInterval);
    return () => window.clearInterval(timer);
  }, [playing, timeSteps]);

  // Trong lúc tải bước mới vẫn dùng dữ liệu bước trước của cùng kịch bản để tuyến không bị nháy.
  const shownFire = fireActive && fireData?.scenarioId === scenarioId ? fireData : null;
  const fireLoading = fireActive && !(shownFire && shownFire.timeStep === timeStep);
  const fireContext = useMemo<FireContext>(() => shownFire && scenario && fireConfig
    ? { scenarioName: scenario.scenarioname, voxels: shownFire.voxels, config: fireConfig }
    : null, [shownFire, scenario, fireConfig]);

  const rooms = useMemo(() => model?.rooms ?? [], [model]);
  const labels = useMemo(
    () => new Map<string, RoomLabel>(rooms.map((room) => [room.solid.solidid, { name: roomName(room), level: room.level, spacetype: room.solid.spacetype }])),
    [rooms],
  );

  // Tuyến được tính lại tự động khi đổi kịch bản / bước thời gian.
  const route = useMemo<RouteResult | null>(() => {
    if (!routeQuery || !graph || (fireActive && !fireContext)) return null;
    return computeRoute(graph, labels, routeQuery, fireContext);
  }, [routeQuery, graph, labels, fireActive, fireContext]);

  const showMarks = routeOpen || route?.ok;
  const markEnd = routeMode === "room" ? routeEnd : route?.ok ? route.endId : null;

  useEffect(() => {
    if (model) drawRoute(model.routeLayer, route?.ok ? route.points : null, route?.ok ? route.hazards : []);
  }, [model, route]);

  useEffect(() => {
    if (model) drawFire(model.fireLayer, shownFire?.voxels ?? null, fireConfig);
  }, [model, shownFire, fireConfig]);

  useEffect(() => {
    if (model) {
      updateFloorScene(model, level, roomId, showMarks
        ? { start: routeStart, end: markEnd }
        : { start: null, end: null }, shownFire !== null);
    }
  }, [model, level, roomId, route, showMarks, routeStart, markEnd, shownFire]);

  const visibleRooms = rooms.filter((room) => level === null || room.level === level);
  const selectedRoom = visibleRooms.find((room) => room.solid.solidid === roomId);
  const levels = [...new Set(rooms.flatMap((room) => room.level === null ? [] : [room.level]))]
    .sort((a, b) => a - b);
  const hasGeometry = visibleRooms.some((room) => room.mesh);

  // Giữ cả phòng chưa nối mạng lưới để chọn trên bản đồ vẫn hiện tên (khi tìm sẽ báo rõ lý do).
  const routeOptions = useMemo<RoomOption[]>(() => rooms
    .map((room) => ({
      solidid: room.solid.solidid,
      name: roomName(room),
      spacetype: room.solid.spacetype,
      floor_level: room.level ?? 0,
      nodeid: graph?.nodesOfRoom.get(room.solid.solidid)?.[0] ?? "",
    }))
    .sort((a, b) => a.floor_level - b.floor_level || a.name.localeCompare(b.name, "vi")),
  [rooms, graph]);

  function selectFloor(nextLevel: number | null) {
    if (nextLevel !== null && selectedRoom?.level !== nextLevel) setRoomId(null);
    setLevel(nextLevel);
  }

  function openRoute(mode: RouteMode, which?: RouteEnd, id?: string) {
    setListOpen(false);
    setRoomId(null);
    setRouteOpen(true);
    if (mode !== routeMode) {
      setRouteMode(mode);
      setRouteQuery(null);
    }
    if (which && id) setRouteEndpoint(which, id);
  }

  function changeMode(mode: RouteMode) {
    setRouteMode(mode);
    setPickTarget(null);
    setRouteQuery(null);
  }

  function changeScenario(id: string) {
    setScenarioId(id);
    setPlaying(false);
    setTimeStep(fireOverview?.scenarios.find((item) => item.scenarioid === id)?.timeSteps[0] ?? 1);
  }

  function findRoute() {
    if (!graph || !routeStart || (routeMode === "room" && !routeEnd)) return;
    const query: RouteQuery = { mode: routeMode, start: routeStart, end: routeMode === "room" ? routeEnd : null };
    const result = computeRoute(graph, labels, query, fireContext);
    setPickTarget(null);
    setRouteQuery(query);
    if (result.ok && level !== null && (result.levels.length > 1 || !result.levels.includes(level))) {
      setLevel(result.levels.length === 1 ? result.levels[0] : null);
    }
  }

  const showList = !routeOpen && listOpen && visibleRooms.length > 0;
  const shownRoom = routeOpen ? undefined : selectedRoom;
  const popupOpen = routeOpen || Boolean(shownRoom || showList);
  const routable = (id: string) => !graph || graph.nodesOfRoom.has(id);
  const stepIndex = Math.max(0, timeSteps.indexOf(timeStep));
  const fireLabel = fireActive && scenario
    ? `${scenario.scenarioname} · bước ${timeStep}/${timeSteps[timeSteps.length - 1]}`
    : null;

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
              setRouteOpen(false);
              setPickTarget(null);
              setListOpen(!showList);
            }}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-50 disabled:opacity-50">
            Danh sách phòng{model ? ` (${visibleRooms.length})` : ""}
          </button>
          <button type="button" disabled={!model}
            aria-expanded={routeOpen && routeMode === "room"}
            onClick={() => routeOpen && routeMode === "room" ? closePopup() : openRoute("room")}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50">
            Tìm đường
          </button>
          <button type="button" disabled={!model}
            aria-expanded={routeOpen && routeMode === "exit"}
            onClick={() => routeOpen && routeMode === "exit" ? closePopup() : openRoute("exit")}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            Thoát hiểm
          </button>

          <div role="group" aria-label="Mô phỏng sự cố cháy"
            className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 ${fireActive ? "bg-red-950/80 ring-1 ring-red-500/60" : "bg-white/5"}`}>
            <label className="flex items-center gap-2 text-sm">
              <span aria-hidden="true">🔥</span>
              <span className="sr-only">Kịch bản sự cố</span>
              <select value={scenarioId} disabled={!fireOverview}
                onChange={(event) => changeScenario(event.target.value)}
                className="max-w-[12rem] rounded-md border border-white/20 bg-neutral-900 px-2 py-1.5 text-sm text-white disabled:opacity-50">
                {(fireOverview?.scenarios ?? [{ scenarioid: "S1", scenarioname: "Bình thường" }]).map((item) => (
                  <option key={item.scenarioid} value={item.scenarioid}>{item.scenarioname}</option>
                ))}
              </select>
            </label>
            {fireActive && (
              <>
                <button type="button" onClick={() => setPlaying(!playing)} disabled={timeSteps.length < 2}
                  aria-label={playing ? "Tạm dừng mô phỏng" : "Phát mô phỏng theo thời gian"}
                  className="grid size-8 place-items-center rounded-md bg-white/10 text-sm hover:bg-white/20">
                  <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
                </button>
                <label className="flex items-center gap-2 text-xs">
                  <span className="sr-only">Bước thời gian</span>
                  <input type="range" min={0} max={timeSteps.length - 1} value={stepIndex}
                    onChange={(event) => {
                      setPlaying(false);
                      setTimeStep(timeSteps[Number(event.target.value)]);
                    }}
                    className="w-28 accent-red-500" />
                  <span className="w-20 tabular-nums">
                    Bước {timeStep}/{timeSteps[timeSteps.length - 1]}{fireLoading ? "…" : ""}
                  </span>
                </label>
              </>
            )}
            {fireError && <span role="alert" className="text-xs text-red-300">{fireError}</span>}
          </div>
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
          {routeOpen ? (
            <RoutePopup
              mode={routeMode}
              onModeChange={changeMode}
              fireLabel={fireLabel}
              fireLoading={fireActive && !fireContext}
              options={routeOptions}
              startId={routeStart}
              endId={routeEnd}
              onChange={setRouteEndpoint}
              onSwap={() => {
                setRouteStart(routeEnd);
                setRouteEnd(routeStart);
                setRouteQuery(null);
              }}
              pickTarget={pickTarget}
              onPickTarget={setPickTarget}
              status={graph ? "ready" : graphError ? "error" : "loading"}
              error={graphError}
              onRetry={() => {
                setGraphError(null);
                setGraphAttempt((value) => value + 1);
              }}
              onFind={findRoute}
              route={route}
              onClear={() => setRouteQuery(null)}
              onClose={closePopup}
              onStepSelect={(stepLevel) => selectFloor(stepLevel)}
            />
          ) : popupOpen && (
            <RoomPopup room={shownRoom} rooms={visibleRooms} onSelect={selectRoom} onClose={closePopup}
              onRouteFrom={shownRoom && routable(shownRoom.solid.solidid) ? (id) => openRoute("room", "start", id) : undefined}
              onRouteTo={shownRoom && routable(shownRoom.solid.solidid) ? (id) => openRoute("room", "end", id) : undefined} />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          {shownFire && fireConfig && (
            <ul aria-label="Chú giải khói/nhiệt"
              className="flex w-fit flex-wrap gap-x-3 gap-y-1 rounded-lg bg-black/80 px-3 py-2 text-xs text-slate-200">
              <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#ff3b30]" />
                Không thể đi qua (khói ≥ {fireConfig.smoke_block} hoặc ≥ {fireConfig.temp_block}°C)</li>
              <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#ff9f0a]" />
                Nóng ≥ {fireConfig.temp_penalty}°C</li>
              <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#9ca3af]" />
                Khói ≥ {fireConfig.smoke_penalty}</li>
            </ul>
          )}
          {hasGeometry && !sceneError && !popupOpen && (
            <p className="hidden w-fit rounded-lg bg-black/80 px-3 py-2 text-sm text-slate-200 sm:block">
              Kéo để xoay · Cuộn để thu phóng · Kéo chuột phải để dịch chuyển · Bấm để chọn phòng
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
