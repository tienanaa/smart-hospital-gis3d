import * as THREE from "three";
import type { RoutePoint } from "./routing";

const lift = 0.25;
const routeColor = 0xffb020;
const hazardColor = 0xff3b30;
const startColor = 0x22c55e;
const endColor = 0xef4444;

function overlayMaterial(color: number) {
  // Luôn vẽ đè lên khối phòng để tuyến đường không bị che khuất.
  return new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
}

function clearLayer(layer: THREE.Group) {
  for (const child of [...layer.children]) {
    layer.remove(child);
    child.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }
}

function addMesh(layer: THREE.Group, geometry: THREE.BufferGeometry, color: number, levels: number[]) {
  const mesh = new THREE.Mesh(geometry, overlayMaterial(color));
  mesh.renderOrder = 10;
  mesh.userData.levels = levels;
  layer.add(mesh);
  return mesh;
}

function addMarker(layer: THREE.Group, point: THREE.Vector3, color: number, level: number) {
  const pin = addMesh(layer, new THREE.SphereGeometry(0.42, 20, 12), color, [level]);
  pin.position.copy(point).add(new THREE.Vector3(0, 0, 0.6));
  pin.renderOrder = 11;
  const stem = addMesh(layer, new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), color, [level]);
  stem.rotation.x = Math.PI / 2;
  stem.position.copy(point).add(new THREE.Vector3(0, 0, 0.3));
  const ring = addMesh(layer, new THREE.RingGeometry(0.35, 0.55, 28), color, [level]);
  ring.position.copy(point);
}

/**
 * Vẽ lại tuyến đường (ống màu cam + điểm đầu xanh, điểm cuối đỏ) vào layer.
 * Đoạn đi qua vùng khói/nhiệt (`hazards[i]`) tô màu đỏ.
 */
export function drawRoute(layer: THREE.Group, points: RoutePoint[] | null, hazards: boolean[] = []) {
  clearLayer(layer);
  if (!points || points.length < 2) return;

  const positions = points.map(({ x, y, z }) => new THREE.Vector3(x, y, z + lift));
  for (let i = 0; i < positions.length - 1; i += 1) {
    const curve = new THREE.LineCurve3(positions[i], positions[i + 1]);
    addMesh(layer, new THREE.TubeGeometry(curve, 1, 0.13, 10, false), hazards[i] ? hazardColor : routeColor,
      [points[i].level, points[i + 1].level]);
  }
  for (let i = 1; i < positions.length - 1; i += 1) {
    const joint = addMesh(layer, new THREE.SphereGeometry(0.13, 10, 8), routeColor, [points[i].level]);
    joint.position.copy(positions[i]);
  }

  addMarker(layer, positions[0], startColor, points[0].level);
  addMarker(layer, positions[positions.length - 1], endColor, points[points.length - 1].level);
}

/** Ẩn các đối tượng (đoạn tuyến, ô khói) không thuộc tầng đang xem. */
export function filterLayerByLevel(layer: THREE.Group, level: number | null) {
  for (const child of layer.children) {
    const levels = child.userData.levels as number[] | undefined;
    child.visible = level === null || !levels || levels.includes(level);
  }
}
