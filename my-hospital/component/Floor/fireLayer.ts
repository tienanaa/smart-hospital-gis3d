import * as THREE from "three";
import type { DbVoxelGridConfig, DbVoxelState } from "@/lib/dijkstra";

const floorHeight = 4;
const blockedColor = new THREE.Color(0xff3b30);
const hotColor = new THREE.Color(0xff9f0a);
const smokeColor = new THREE.Color(0x9ca3af);

function clearLayer(layer: THREE.Group) {
  for (const child of [...layer.children]) {
    layer.remove(child);
    if (child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      child.dispose();
    }
  }
}

/** Màu ô: đỏ = vượt ngưỡng chặn (không thể đi qua), cam = nóng, xám = khói. */
function voxelColor(voxel: DbVoxelState, config: DbVoxelGridConfig) {
  if (voxel.smoke_density >= config.smoke_block || voxel.temperature >= config.temp_block) return blockedColor;
  if (voxel.temperature >= config.temp_penalty) return hotColor;
  return smokeColor;
}

/** Vẽ các ô voxel khói/nhiệt thành khối hộp bán trong suốt, gom theo tầng để lọc hiển thị. */
export function drawFire(layer: THREE.Group, voxels: DbVoxelState[] | null, config: DbVoxelGridConfig | null) {
  clearLayer(layer);
  if (!voxels?.length || !config) return;

  const byLevel = new Map<number, { voxel: DbVoxelState; position: THREE.Vector3 }[]>();
  for (const voxel of voxels) {
    const position = new THREE.Vector3(
      config.x_min + (voxel.i_idx + 0.5) * config.dx,
      config.y_min + (voxel.j_idx + 0.5) * config.dy,
      config.z_min + (voxel.k_idx + 0.5) * config.dz,
    );
    const level = Math.floor(position.z / floorHeight) + 1;
    byLevel.set(level, [...(byLevel.get(level) ?? []), { voxel, position }]);
  }

  const matrix = new THREE.Matrix4();
  for (const [level, cells] of byLevel) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(config.dx * 0.92, config.dy * 0.92, config.dz * 0.92),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false }),
      cells.length,
    );
    cells.forEach(({ voxel, position }, index) => {
      mesh.setMatrixAt(index, matrix.makeTranslation(position));
      mesh.setColorAt(index, voxelColor(voxel, config));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 5;
    mesh.userData.levels = [level];
    layer.add(mesh);
  }
}
