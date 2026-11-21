import * as THREE from "three";
import type { FloorGroup } from "./types";

export function attachRoomPicking(canvas: HTMLCanvasElement, camera: THREE.Camera, floors: FloorGroup[], onSelect: (id: string) => void) {
  const ray = new THREE.Raycaster();
  let press: { id: number; x: number; y: number } | undefined;
  const cancel = () => { press = undefined; };
  const down = (event: PointerEvent) => {
    press = event.isPrimary && event.button === 0
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : undefined;
  };
  const move = (event: PointerEvent) => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) cancel();
  };
  const up = (event: PointerEvent) => {
    move(event);
    const pick = press?.id === event.pointerId;
    cancel();
    if (!pick) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    ray.setFromCamera(new THREE.Vector2(
      2 * (event.clientX - bounds.left) / bounds.width - 1,
      1 - 2 * (event.clientY - bounds.top) / bounds.height,
    ), camera);
    const meshes = floors.filter(({ group }) => group.visible).flatMap(({ group }) => group.children);
    const hit = ray.intersectObjects(meshes, false)[0];
    const roomId = hit?.object.userData.roomId;
    if (typeof roomId === "string") onSelect(roomId);
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
  };
}
