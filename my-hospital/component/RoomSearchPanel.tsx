"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DbArc,
  DbNode,
  DbVoxelGridConfig,
  PathResult,
  RoomOption,
  findNearestEmergencyExit,
  findShortestPath,
  searchRooms,
} from "../lib/dijkstra";
import { loadFireVoxels, loadHospitalRoutingData } from "../lib/routingData.server";

interface RoomSearchPanelProps {
  /** Kịch bản cháy đang chọn trên giao diện chính (mặc định S1: Bình thường) */
  scenarioId?: string;
  /** Mốc thời gian mô phỏng cháy (mặc định 1) */
  timeStep?: number;
  /** Nhận nodeid nếu người dùng click chọn điểm xuất phát trực tiếp trên mô hình 3D */
  externalStartNodeId?: string;
  /** Callback gửi kết quả lộ trình (chứa pathCoords) sang component 3D để vẽ đường */
  onPathFound?: (result: PathResult | null) => void;
  /** Callback khi người dùng chọn 1 phòng (dùng để focus camera 3D vào phòng đó) */
  onSelectRoom?: (room: RoomOption) => void;
}

export default function RoomSearchPanel({
  scenarioId = "S1",
  timeStep = 1,
  externalStartNodeId,
  onPathFound,
  onSelectRoom,
}: RoomSearchPanelProps) {
  // Dữ liệu mạng lưới từ Supabase
  const [nodes, setNodes] = useState<DbNode[]>([]);
  const [arcs, setArcs] = useState<DbArc[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [gridConfig, setGridConfig] = useState<DbVoxelGridConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Trạng thái thanh tìm kiếm & chọn điểm đi/đến
  const [startNodeId, setStartNodeId] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [selectedRoom, setSelectedRoom] = useState<RoomOption | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Kết quả tìm đường
  const [calculating, setCalculating] = useState<boolean>(false);
  const [pathResult, setPathResult] = useState<PathResult | null>(null);

  // 1. Tải dữ liệu phòng và đồ thị khi mở trang
  useEffect(() => {
    let isMounted = true;

    async function initData() {
      try {
        setLoading(true);
        const data = await loadHospitalRoutingData();
        if (!isMounted) return;

        setNodes(data.nodes);
        setArcs(data.arcs);
        setRooms(data.rooms);
        setGridConfig(data.gridConfig);

        if (data.rooms.length > 0 && !externalStartNodeId) {
          setStartNodeId(data.rooms[0].nodeid);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Lỗi tải dữ liệu bản đồ từ Supabase";
        setLoadError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initData();
    return () => {
      isMounted = false;
    };
  }, [externalStartNodeId]);

  // Đồng bộ nếu người dùng click chọn phòng xuất phát từ mô hình 3D
  useEffect(() => {
    if (externalStartNodeId) {
      setStartNodeId(externalStartNodeId);
    }
  }, [externalStartNodeId]);

  // 2. Lọc danh sách phòng theo từ khóa nhập vào
  const filteredRooms = useMemo(() => {
    return searchRooms(rooms, keyword);
  }, [rooms, keyword]);

  // 3. Xử lý khi người dùng chọn 1 phòng trong danh sách gợi ý
  const handlePickRoom = async (room: RoomOption) => {
    setSelectedRoom(room);
    setKeyword(`${room.name} (Tầng ${room.floor_level})`);
    setIsDropdownOpen(false);
    onSelectRoom?.(room);

    if (!startNodeId) return;
    await runPathfinding("ROOM", room.nodeid);
  };

  // 4. Chạy thuật toán tìm đường (tới phòng đích hoặc tới lối thoát hiểm gần nhất)
  const runPathfinding = async (
    mode: "ROOM" | "EXIT",
    targetNodeId?: string,
  ) => {
    if (!startNodeId || nodes.length === 0) return;

    try {
      setCalculating(true);
      const voxels =
        gridConfig && scenarioId !== "S1"
          ? await loadFireVoxels(scenarioId, timeStep, gridConfig)
          : [];

      const result =
        mode === "EXIT"
          ? findNearestEmergencyExit(startNodeId, nodes, arcs, {
              voxels,
              gridConfig: gridConfig ?? undefined,
            })
          : findShortestPath(startNodeId, [targetNodeId!], nodes, arcs, {
              voxels,
              gridConfig: gridConfig ?? undefined,
            });

      setPathResult(result);
      onPathFound?.(result);
    } catch (err: unknown) {
      const errorResult: PathResult = {
        success: false,
        message:
          err instanceof Error ? err.message : "Lỗi khi tính toán tuyến đường",
        totalCost: null,
        pathNodes: [],
        pathArcs: [],
        pathCoords: [],
      };
      setPathResult(errorResult);
      onPathFound?.(errorResult);
    } finally {
      setCalculating(false);
    }
  };

  const handleClearSearch = () => {
    setKeyword("");
    setSelectedRoom(null);
    setPathResult(null);
    setIsDropdownOpen(false);
    onPathFound?.(null);
  };

  if (loading) {
    return (
      <div className="w-80 rounded-xl bg-white/95 p-4 text-sm text-gray-600 shadow-lg backdrop-blur">
        Đang tải danh sách phòng bệnh viện...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-80 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-lg">
        {loadError}
      </div>
    );
  }

  return (
    <div className="w-80 rounded-xl border border-gray-200 bg-white/95 p-4 text-gray-800 shadow-xl backdrop-blur">
      <h2 className="mb-3 text-base font-bold text-gray-900">
        Tìm phòng & Chỉ đường 3D
      </h2>

      {/* Chọn vị trí xuất phát */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-gray-600">
          Vị trí hiện tại (Điểm đi)
        </label>
        <select
          value={startNodeId}
          onChange={(e) => setStartNodeId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {rooms.map((r) => (
            <option key={`${r.solidid}-${r.nodeid}`} value={r.nodeid}>
              Tầng {r.floor_level} - {r.name} ({r.solidid})
            </option>
          ))}
        </select>
      </div>

      {/* Ô tìm kiếm phòng đích */}
      <div className="relative mb-3">
        <label className="mb-1 block text-xs font-semibold text-gray-600">
          Tìm phòng cần đến (Điểm đến)
        </label>
        <div className="relative">
          <input
            type="text"
            value={keyword}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setKeyword(e.target.value);
              setSelectedRoom(null);
              setIsDropdownOpen(true);
            }}
            placeholder="Nhập tên phòng hoặc mã (VD: mắt, s_cc)..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none"
          />
          {keyword && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-700"
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Danh sách gợi ý kết quả */}
        {isDropdownOpen && (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filteredRooms.length === 0 ? (
              <li className="px-3 py-2.5 text-xs text-gray-500">
                Không tìm thấy phòng phù hợp
              </li>
            ) : (
              filteredRooms.map((room) => (
                <li
                  key={`${room.solidid}-${room.nodeid}`}
                  onClick={() => handlePickRoom(room)}
                  className="cursor-pointer border-b border-gray-100 px-3 py-2 text-sm last:border-none hover:bg-blue-50"
                >
                  <div className="font-medium text-gray-900">{room.name}</div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Mã: {room.solidid}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                      Tầng {room.floor_level}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Các nút thao tác */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!selectedRoom || calculating}
          onClick={() =>
            selectedRoom && runPathfinding("ROOM", selectedRoom.nodeid)
          }
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {calculating ? "Đang tính..." : "Chỉ đường"}
        </button>

        <button
          type="button"
          disabled={!startNodeId || calculating}
          onClick={() => runPathfinding("EXIT")}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          Thoát hiểm
        </button>
      </div>

      {/* Hiển thị kết quả lộ trình */}
      {pathResult && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs ${
            pathResult.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-semibold">{pathResult.message}</p>
          {pathResult.success && (
            <div className="mt-1.5 space-y-1 text-emerald-800">
              <p>
                Tổng chi phí / quãng đường:{" "}
                <span className="font-bold">{pathResult.totalCost} m</span>
              </p>
              <p className="break-words text-[11px] text-emerald-700">
                Lộ trình: {pathResult.pathNodes.join(" → ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
