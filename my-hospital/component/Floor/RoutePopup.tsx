import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchRooms, type RoomOption } from "@/lib/dijkstra";
import type { RouteMode, RouteResult, StepKind } from "./routing";
import { unitsToMeters } from "./scale";

export type RouteEnd = "start" | "end";

const stepIcons: Record<StepKind, string> = {
  start: "●",
  straight: "↑",
  "slight-left": "↖",
  "slight-right": "↗",
  left: "←",
  right: "→",
  uturn: "↶",
  up: "⇡",
  down: "⇣",
  end: "⚑",
};

const stepTone: Partial<Record<StepKind, string>> = {
  start: "bg-green-100 text-green-800",
  end: "bg-red-100 text-red-800",
  up: "bg-sky-100 text-sky-800",
  down: "bg-sky-100 text-sky-800",
};

function formatMeters(units: number) {
  const value = unitsToMeters(units);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} m`;
}

function RoomField({ label, which, options, value, onChange, picking, onPick }: {
  label: string;
  which: RouteEnd;
  options: RoomOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  picking: boolean;
  onPick: () => void;
}) {
  const id = useId();
  const selected = options.find((option) => option.solidid === value) ?? null;
  const display = selected ? `${selected.name} · Tầng ${selected.floor_level}` : "";
  const [text, setText] = useState(display);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Đồng bộ khi điểm được chọn từ nơi khác (bấm trên mô hình, đổi chiều…)
  const [syncedDisplay, setSyncedDisplay] = useState(display);
  if (syncedDisplay !== display) {
    setSyncedDisplay(display);
    setText(display);
  }

  const matches = useMemo(
    () => (text === display ? options : searchRooms(options, text)).slice(0, 50),
    [options, text, display],
  );

  function choose(option: RoomOption) {
    onChange(option.solidid);
    setText(`${option.name} · Tầng ${option.floor_level}`);
    setOpen(false);
  }

  const dot = which === "start" ? "bg-green-500" : "bg-red-500";

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />
        {label}
      </label>
      <div className="flex gap-1.5">
        <input id={id} type="text" role="combobox" autoComplete="off"
          aria-expanded={open} aria-controls={`${id}-list`}
          aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
          value={text}
          placeholder="Nhập tên, mã phòng hoặc “tầng 2”…"
          onFocus={(event) => { event.target.select(); setOpen(true); setActive(0); }}
          onBlur={() => { setOpen(false); setText(display); }}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(0);
            if (!event.target.value) onChange(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && matches[active]) {
              event.preventDefault();
              choose(matches[active]);
            } else if (event.key === "Escape" && open) {
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              setOpen(false);
              setText(display);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/25" />
        <button type="button" onClick={onPick} aria-pressed={picking}
          title="Chọn bằng cách bấm vào phòng trên mô hình 3D"
          className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 aria-pressed:border-teal-700 aria-pressed:bg-teal-700 aria-pressed:text-white">
          {picking ? "Đang chọn…" : "Trên bản đồ"}
        </button>
      </div>
      {open && (
        <ul id={`${id}-list`} role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">Không tìm thấy phòng phù hợp</li>
          ) : matches.map((option, index) => (
            <li key={option.solidid} id={`${id}-opt-${index}`} role="option"
              aria-selected={index === active}
              onMouseDown={(event) => { event.preventDefault(); choose(option); }}
              onMouseEnter={() => setActive(index)}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm text-slate-800 aria-selected:bg-teal-50">
              <span className="[overflow-wrap:anywhere]">{option.name}</span>
              <span className="shrink-0 text-xs text-slate-500">Tầng {option.floor_level}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RoutePopup({
  mode, onModeChange, fireLabel, fireLoading,
  options, startId, endId, onChange, onSwap, pickTarget, onPickTarget,
  status, error, onRetry, onFind, route, onClear, onClose, onStepSelect,
}: {
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  /** Mô tả kịch bản cháy đang mô phỏng (null = bình thường) */
  fireLabel: string | null;
  fireLoading: boolean;
  options: RoomOption[];
  startId: string | null;
  endId: string | null;
  onChange: (which: RouteEnd, id: string | null) => void;
  onSwap: () => void;
  pickTarget: RouteEnd | null;
  onPickTarget: (which: RouteEnd | null) => void;
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  onFind: () => void;
  route: RouteResult | null;
  onClear: () => void;
  onClose: () => void;
  onStepSelect: (level: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const exitMode = mode === "exit";
  const canFind = status === "ready" && !fireLoading && startId && (exitMode || endId);
  const hazardCount = route?.ok ? route.hazards.filter(Boolean).length : 0;
  const minutes = route?.ok ? Math.max(1, Math.round(unitsToMeters(route.distance) / 1.2 / 60)) : 0;

  return (
    <section id="room-popup" role="dialog" aria-labelledby="route-popup-title"
      className="pointer-events-auto flex max-h-[min(100%,65dvh)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-full sm:w-[24rem]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <h2 id="route-popup-title" className="font-semibold text-slate-900">
          {exitMode ? "Thoát hiểm" : "Tìm đường"}
        </h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng popup"
          className="grid size-9 place-items-center rounded-lg text-xl text-slate-700 hover:bg-slate-100">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <form className="space-y-2 p-4" onSubmit={(event) => { event.preventDefault(); if (canFind) onFind(); }}>
          <div role="group" aria-label="Loại tìm đường" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {([["room", "Đến phòng"], ["exit", "Lối thoát hiểm gần nhất"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white aria-pressed:bg-white aria-pressed:shadow-sm ${value === "exit" ? "aria-pressed:text-red-700" : "aria-pressed:text-teal-800"}`}>
                {label}
              </button>
            ))}
          </div>

          {fireLabel && (
            <p role="status" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <span aria-hidden="true">🔥 </span>
              <span className="font-semibold">Đang mô phỏng sự cố:</span> {fireLabel}.{" "}
              {fireLoading ? "Đang tải dữ liệu khói/nhiệt…" : "Tuyến đường sẽ né vùng khói/lửa."}
            </p>
          )}

          <RoomField label={exitMode ? "Vị trí hiện tại" : "Điểm bắt đầu"} which="start" options={options} value={startId}
            onChange={(id) => onChange("start", id)} picking={pickTarget === "start"}
            onPick={() => onPickTarget(pickTarget === "start" ? null : "start")} />
          {!exitMode && (<>
          <div className="flex justify-center">
            <button type="button" onClick={onSwap} disabled={!startId && !endId}
              title="Đổi chiều điểm đi và điểm đến" aria-label="Đổi chiều điểm đi và điểm đến"
              className="rounded-full border border-slate-300 px-3 py-0.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              ⇅
            </button>
          </div>
          <RoomField label="Điểm kết thúc" which="end" options={options} value={endId}
            onChange={(id) => onChange("end", id)} picking={pickTarget === "end"}
            onPick={() => onPickTarget(pickTarget === "end" ? null : "end")} />
          </>)}

          {pickTarget && (
            <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">
              Bấm vào một phòng trên mô hình 3D để chọn {pickTarget === "start" ? "điểm bắt đầu" : "điểm kết thúc"}.
            </p>
          )}

          {status === "error" && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {error ?? "Không tải được mạng lưới đường đi."}{" "}
              <button type="button" onClick={onRetry} className="font-semibold underline">Thử lại</button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!canFind}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${exitMode ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800"}`}>
              {status === "loading" ? "Đang tải mạng lưới…" : exitMode ? "Tìm lối thoát" : "Tìm đường"}
            </button>
            {route && (
              <button type="button" onClick={onClear}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Xóa tuyến
              </button>
            )}
          </div>
        </form>

        {route && !route.ok && (
          <p role="alert" className="mx-4 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {route.message}
          </p>
        )}

        {route?.ok && (
          <div aria-live="polite" className="border-t border-slate-200 px-4 pb-4 pt-3">
            <p className="text-sm text-slate-900">
              <span className="text-lg font-semibold text-teal-800">{formatMeters(route.distance)}</span>
              <span className="text-slate-500"> · khoảng {minutes} phút đi bộ</span>
              {route.levels.length > 1 && (
                <span className="text-slate-500"> · qua tầng {route.levels.join(", ")}</span>
              )}
            </p>
            {route.scenarioName && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${hazardCount ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
                {hazardCount
                  ? `⚠ Tuyến an toàn nhất vẫn đi qua ${hazardCount} đoạn có khói/nhiệt (tô đỏ). Cúi thấp người, che mũi miệng khi đi qua.`
                  : `✓ Tuyến đã né toàn bộ vùng khói/lửa của kịch bản “${route.scenarioName}”.`}
              </p>
            )}
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Chỉ dẫn ({route.steps.length} mốc)
            </h3>
            <ol className="mt-1 space-y-0.5">
              {route.steps.map((step, index) => (
                <li key={`${step.nodeId}-${index}`}>
                  <button type="button" onClick={() => onStepSelect(step.level)}
                    title={`Xem tầng ${step.level}`}
                    className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <span aria-hidden="true"
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${stepTone[step.kind] ?? "bg-amber-100 text-amber-900"}`}>
                      {stepIcons[step.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      {step.distance > 0.05 && (
                        <span className="block text-xs text-slate-500">Đi thẳng {formatMeters(step.distance)}, rồi</span>
                      )}
                      <span className="block text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{step.title}</span>
                      {step.detail && <span className="block text-xs text-slate-500">{step.detail}</span>}
                      {step.hazard && (
                        <span className="block text-xs font-medium text-red-700">⚠ Đoạn này có khói/nhiệt</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
