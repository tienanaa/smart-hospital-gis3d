import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { attachRoomPicking } from "./roomPicking";
import { filterLayerByLevel } from "./routeLayer";
import type { FloorModel } from "./types";

export type RouteMarks = { start: string | null; end: string | null };

export function updateFloorScene(
  model: FloorModel,
  level: number | null,
  roomId: string | null,
  marks: RouteMarks = { start: null, end: null },
  /** Làm mờ khối phòng để nhìn thấy khói/lửa bên trong */
  ghostRooms = false,
) {
  for (const floor of model.floors) {
    floor.group.visible = level === null || floor.level === level;
  }
  for (const room of model.rooms) {
    const id = room.solid.solidid;
    const emissive = id === marks.start ? 0x1d6b35
      : id === marks.end ? 0x8a1f1f
      : id === roomId ? 0x408c81 : 0;
    if (!room.mesh) continue;
    const material = room.mesh.material;
    material.emissive.setHex(emissive);
    const marked = id === marks.start || id === marks.end;
    material.opacity = ghostRooms && !marked ? 0.28 : 1;
    material.depthWrite = !ghostRooms || marked;
  }
  filterLayerByLevel(model.routeLayer, level);
  filterLayerByLevel(model.fireLayer, level);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

export function useFloorScene(
  hostRef: RefObject<HTMLDivElement | null>,
  model: FloorModel | null,
  onSelectRoom: (id: string) => void,
  setError: (message: string) => void,
) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model?.floors.length) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    const bounds = new THREE.Box3();
    const sceneFloors = model.floors;
    for (const floor of sceneFloors) {
      scene.add(floor.group);
      bounds.expandByObject(floor.group);
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 10);

    const gridSize = Math.max(size.x, size.y, 30) * 2.25;
   const cellSize = 2; // <-- Đổi số này (ví dụ từ 1 lên 2, 3, 5...) để ô lưới to hơn
    const divisions = Math.max(10, Math.min(200, Math.round(gridSize / cellSize)));
    const grid = new THREE.GridHelper(
    gridSize,
    divisions,
    0x444444,
    0x2c2c2c,
);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(center.x, center.y, bounds.min.z - 0.03);
    scene.add(grid);
    scene.add(model.routeLayer);
    scene.add(model.fireLayer);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(center.x + 20, center.y + 20, bounds.max.z + 40);
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(
      60,
      Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1),
      0.1,
      maxDimension * 100,
    );
    camera.up.set(0, 0, 1);
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const limitingHalfFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
    const distance = bounds.getBoundingSphere(new THREE.Sphere()).radius / Math.sin(limitingHalfFov) * 1.12;
    camera.position.copy(center).addScaledVector(new THREE.Vector3(15, -15, 25).normalize(), distance);
    camera.lookAt(center);

    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | null = null;
    let animationFrame = 0;
    let errorTimeout = 0;
    const cleanupScene = () => {
      controls?.dispose();
      disposeObject(grid);
      scene.remove(model.routeLayer);
      scene.remove(model.fireLayer);
      for (const floor of sceneFloors) {
        disposeObject(floor.group);
      }
      renderer?.dispose();
      renderer?.domElement.remove();
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (cause) {
      console.error("Failed to initialize the Three.js renderer:", cause);
      errorTimeout = window.setTimeout(() => {
        setError("Trình duyệt không khởi tạo được WebGL để hiển thị mô hình 3D.");
      }, 0);
      return () => {
        window.clearTimeout(errorTimeout);
        cleanupScene();
      };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableRotate = true; // Không cho xoay góc camera
    controls.enablePan = true;     // Cho phép kéo di chuyển ngang / dọc (không đổi góc nhìn)
    controls.enableZoom = true;    // Cho phép phóng to / thu nhỏ
    controls.minDistance = 5;      // Khoảng cách zoom gần nhất
    controls.maxDistance = 120;    // Khoảng cách zoom xa nhất
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.update();

    const activeRenderer = renderer;
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      activeRenderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const detachPicking = attachRoomPicking(renderer.domElement, camera, sceneFloors, onSelectRoom);

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      controls?.update();
      renderer?.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      detachPicking();
      cleanupScene();
    };
  }, [hostRef, model, onSelectRoom, setError]);
}
