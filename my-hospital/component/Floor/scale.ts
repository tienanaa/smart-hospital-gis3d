/**
 * Tỉ lệ hệ trục tọa độ: 1 đơn vị tọa độ (ví dụ từ x=1 đến x=2) = bao nhiêu mét ngoài thực tế.
 * Đổi số này để thay đổi tỉ lệ quãng đường / thời gian hiển thị.
 */
export const METERS_PER_UNIT = 10;

/** Đổi khoảng cách theo đơn vị tọa độ sang mét. */
export function unitsToMeters(units: number) {
  return units * METERS_PER_UNIT;
}
