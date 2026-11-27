-- =====================================================================
-- Sửa dữ liệu mạng lưới đường đi (Node / Arc / Node_Solid / UDM_Solid)
-- Ngày: 2026-11-26
--
-- Phát hiện bởi: my-hospital/tests/routing-reachability.test.ts
--   (chạy: cd my-hospital && npm test)
--
-- !! Nên sao lưu (hoặc export) các bảng node, arc, node_solid, udm_solid,
--    udm_complex trước khi chạy.
--
-- Vấn đề:
--   1. 10 arc bị đặt is_blocked = true cố định -> thang máy 3 tầng (s_tm, s_tm2,
--      s_tm3) và node hành lang n2_17 bị cô lập; hành lang chính tầng 2 bị cắt
--      giữa n2_16 và n2_18. Trạng thái cháy/khói nay đã được mô phỏng bằng voxel
--      theo từng kịch bản (voxel_state), không cần khóa arc cố định nữa.
--   2. node_solid gắn sai: 3N_15 (z = 8, tầng 3) gắn với s_bhyt (tầng 1).
--      3N_15 là node hành lang tầng 3 (nối 3N_16 và 3N_19), cách Phòng trực 0.5 m.
--   3. s_stair3 "Cầu thang" tầng 3 là solid thừa: không có face/vertex nào
--      (face_list trỏ tới f3_stair3_1 không tồn tại), không gắn node; tầng 3 đã có
--      Cầu thang 5 (s_ct5) và Cầu thang 6 (s_ct6).
--   4. (Tùy chọn) n2_23 (1, 8, 4) là node cụt hành lang: chỉ nối với n2_22 qua
--      a2_18, không thuộc phòng nào, không phải lối thoát.
--
-- Không sửa: các node cửa phòng nằm ngoài đa giác phòng ~1 m là thiết kế
-- (node đặt ở hành lang trước cửa), không phải lỗi.
--
-- Script chạy được nhiều lần (idempotent). Chạy trong Supabase SQL Editor.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Đồng bộ schema với database.sql (cột đã có trên Supabase nhưng
--    chưa có trong file schema)
-- ---------------------------------------------------------------------
ALTER TABLE node ADD COLUMN IF NOT EXISTS is_emergency_exit BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE arc  ADD COLUMN IF NOT EXISTS is_blocked        BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 1. Mở các arc bị khóa cố định
-- ---------------------------------------------------------------------
-- 1a. Lối vào thang máy từ hành lang/phòng lân cận
UPDATE arc SET is_blocked = false
WHERE is_blocked
  AND arcid IN (
    'a1_27',     -- n1_13 (hành lang T1)       -> n1_27 (Thang máy T1)
    'a2_1',      -- n2_28 (Cầu thang 4)        -> n2_27 (Thang máy T2)
    'a2_2',      -- n2_27 (Thang máy T2)       -> n2_26 (Kho nhỏ)
    'a2_7',      -- n2_27 (Thang máy T2)       -> n2_12 (Quầy hướng dẫn)
    'arc_3_19'   -- 3N_20 (hành lang T3)       -> 3N_21 (Thang máy T3)
  );

-- 1b. Trục thang máy giữa các tầng
--     (khi có kịch bản cháy, ứng dụng tự loại các arc này: không dùng thang
--      máy để thoát nạn)
UPDATE arc SET is_blocked = false
WHERE is_blocked
  AND arcid IN (
    'a_tm_1',    -- n1_27 (T1) -> n2_27 (T2)
    'a_tm_2'     -- n2_27 (T2) -> 3N_21 (T3)
  );

-- 1c. Hành lang chính tầng 2 bị cắt
UPDATE arc SET is_blocked = false
WHERE is_blocked
  AND arcid IN (
    'a2_12',     -- n2_16 (P. khám nhi)        -> n2_17 (hành lang T2)
    'a2_13',     -- n2_17 (hành lang T2)       -> n2_18 (P. tim mạch)
    'a2_31'      -- n2_7  (P. khám nội TQ)     -> n2_18 (P. tim mạch)
  );

-- ---------------------------------------------------------------------
-- 2. Bỏ liên kết node - phòng sai tầng
-- ---------------------------------------------------------------------
DELETE FROM node_solid
WHERE nodeid = '3N_15' AND solidid = 's_bhyt';

-- Nếu 3N_15 thực ra là một cửa của Phòng trực, bỏ comment dòng dưới:
-- INSERT INTO node_solid (nodeid, solidid) VALUES ('3N_15', 's_pt') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Xóa solid thừa s_stair3
-- ---------------------------------------------------------------------
UPDATE udm_complex
SET solid_list = solid_list - 's_stair3'
WHERE solid_list ? 's_stair3';

DELETE FROM node_solid WHERE solidid = 's_stair3';   -- phòng hờ, hiện không có dòng nào
DELETE FROM udm_face   WHERE solidid = 's_stair3';   -- phòng hờ, hiện không có dòng nào
UPDATE arc SET left_poly  = NULL WHERE left_poly  = 's_stair3';
UPDATE arc SET right_poly = NULL WHERE right_poly = 's_stair3';
DELETE FROM udm_solid  WHERE solidid = 's_stair3';

-- ---------------------------------------------------------------------
-- 4. (Tùy chọn) Xóa node cụt n2_23 và arc a2_18 dẫn vào nó
--    Giữ lại nếu n2_23 được dùng làm điểm cuối hành lang có chủ đích.
-- ---------------------------------------------------------------------
-- DELETE FROM arc  WHERE arcid  = 'a2_18' AND from_node = 'n2_22' AND to_node = 'n2_23';
-- DELETE FROM node WHERE nodeid = 'n2_23'
--   AND NOT EXISTS (SELECT 1 FROM arc WHERE from_node = 'n2_23' OR to_node = 'n2_23')
--   AND NOT EXISTS (SELECT 1 FROM node_solid WHERE nodeid = 'n2_23');

-- ---------------------------------------------------------------------
-- 5. Kiểm tra sau khi sửa: nếu còn lỗi, RAISE EXCEPTION làm hủy (rollback)
--    toàn bộ thay đổi ở trên, dữ liệu giữ nguyên như trước khi chạy.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  bad TEXT;
BEGIN
  -- 5a. Arc còn bị khóa
  SELECT string_agg(arcid, ', ') INTO bad FROM arc WHERE is_blocked;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Còn arc bị khóa: %', bad; END IF;

  -- 5b. Node không có arc nào mở (bị cô lập)
  SELECT string_agg(n.nodeid, ', ') INTO bad FROM node n
  WHERE NOT EXISTS (
    SELECT 1 FROM arc a
    WHERE NOT a.is_blocked AND (a.from_node = n.nodeid OR a.to_node = n.nodeid)
  );
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Node bị cô lập: %', bad; END IF;

  -- 5c. Phòng chưa gắn node
  SELECT string_agg(s.solidid, ', ') INTO bad FROM udm_solid s
  WHERE NOT EXISTS (SELECT 1 FROM node_solid ns WHERE ns.solidid = s.solidid);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Phòng chưa gắn node: %', bad; END IF;

  -- 5d. Node gắn với phòng khác tầng (tầng 1: z=0, tầng 2: z=4, tầng 3: z=8)
  SELECT string_agg(ns.nodeid || '->' || ns.solidid, ', ') INTO bad
  FROM node_solid ns
  JOIN node n      ON n.nodeid = ns.nodeid
  JOIN udm_solid s ON s.solidid = ns.solidid
  WHERE ROUND(n.z / 4) + 1 <> s.floor_level;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Node gắn phòng khác tầng: %', bad; END IF;

  RAISE NOTICE 'Mạng lưới đường đi hợp lệ.';
END $$;

COMMIT;

-- Sau khi chạy: cd my-hospital && npm test  -> tất cả test phải pass.
