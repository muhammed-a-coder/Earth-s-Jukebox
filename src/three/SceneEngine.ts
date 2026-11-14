import * as THREE from "three";
import type { ScenePlan } from "../types";
import { createStarfield } from "./materials";
import { buildScene, type BuiltScene } from "./sceneFactory";

const TAU = Math.PI * 2;
const AUTO_ORBIT_SPEED = 0.065;
const REDUCED_ORBIT_SPEED = 0.018;
const SCRUB_SENSITIVITY = 0.0062;
const KEYBOARD_SCRUB_SPEED = 0.9;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class SceneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private stars: THREE.Group;
  private current: BuiltScene | null = null;
  private currentSignature = "";
  private theta = -0.42;
  private baseRadius = 4.6;
  private targetRadius = 4.6;
  private currentRadius = 6.2;
  private currentElevation = 0.14;
  private targetElevation = 0.14;
  private sceneAge = 0;
  private sceneEnter = 0;
  private raf = 0;
  private disposed = false;
  private pointerActive = false;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private keysDown = new Set<string>();
  private reducedMotion = false;
  private mediaQuery: MediaQueryList | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastTime = 0;
  private viewChangeHandler: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    this.camera.position.set(0, 1, 6);
    this.camera.lookAt(0, 0, 0);

    this.stars = createStarfield();
    this.scene.add(this.stars);

    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.mediaQuery.matches;
    this.mediaQuery.addEventListener?.("change", this.mediaQueryListener);

    this.attachInteractions();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.animate);
  }

  setViewChangeHandler(handler: () => void): void {
    this.viewChangeHandler = handler;
  }

  setScene(plan: ScenePlan): void {
    if (this.disposed) return;
    const signature = JSON.stringify(plan);
    if (signature === this.currentSignature && this.current) return;
    const previous = this.current;
    if (previous) {
      this.scene.remove(previous.group);
      this.disposeGroup(previous.group);
    }
    const built = buildScene(plan);
    this.current = built;
    this.currentSignature = signature;
    this.baseRadius = built.radius;
    this.targetElevation = plan.orbitElevation ?? built.elevation;
    this.sceneEnter = 0;
    this.sceneAge = 0;
    this.scene.add(built.group);
    built.group.scale.setScalar(0.9);
    this.targetRadius = this.responsiveRadius(built.radius);
    this.resize();
  }

  private responsiveRadius(radius: number): number {
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    if (aspect < 0.8) return radius * 1.55;
    if (aspect < 1.05) return radius * 1.28;
    return radius;
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 1.9));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.targetRadius = this.responsiveRadius(this.baseRadius);
  }

  private attachInteractions(): void {
    this.canvas.style.touchAction = "none";
    this.canvas.style.cursor = "grab";

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("lostpointercapture", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (this.pointerActive) return;
    this.pointerActive = true;
    this.pointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    this.emitViewChange();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointerActive || event.pointerId !== this.pointerId) return;
    const delta = event.clientX - this.lastPointerX;
    this.lastPointerX = event.clientX;
    this.theta += delta * SCRUB_SENSITIVITY;
    event.preventDefault();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointerActive) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    this.pointerActive = false;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.style.cursor = "grab";
    this.emitViewChange();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
  };

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private isTextEntry(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.isTextEntry(event.target)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    this.keysDown.add(event.key);
    this.emitViewChange();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    this.keysDown.delete(event.key);
    if (!this.keysDown.size) this.emitViewChange();
  };

  private onBlur = () => {
    this.keysDown.clear();
    this.pointerActive = false;
    this.canvas.style.cursor = "grab";
  };

  private onVisibility = () => {
    if (!document.hidden) this.lastTime = performance.now();
  };

  private emitViewChange(): void {
    this.viewChangeHandler?.();
  }

  private animate = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const rawDelta = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (!Number.isFinite(rawDelta) || rawDelta <= 0) return;

    const scrubbing = this.pointerActive || this.keysDown.size > 0;
    if (!scrubbing) {
      this.theta += (this.reducedMotion ? REDUCED_ORBIT_SPEED : AUTO_ORBIT_SPEED) * rawDelta;
    } else if (this.keysDown.size) {
      const direction = (this.keysDown.has("ArrowRight") ? 1 : 0) - (this.keysDown.has("ArrowLeft") ? 1 : 0);
      this.theta += direction * KEYBOARD_SCRUB_SPEED * rawDelta;
    }

    this.currentRadius += (this.targetRadius - this.currentRadius) * Math.min(1, rawDelta * 1.8);
    this.currentElevation += (this.targetElevation - this.currentElevation) * Math.min(1, rawDelta * 1.6);
    const distance = this.currentRadius;
    const horizontal = distance / Math.sqrt(1 + this.currentElevation ** 2);
    const height = horizontal * this.currentElevation;
    this.camera.position.set(Math.sin(this.theta) * horizontal, height, Math.cos(this.theta) * horizontal);
    this.camera.lookAt(0, 0, 0);

    this.stars.rotation.y += rawDelta * 0.002;
    if (this.reducedMotion) this.stars.rotation.y += 0;

    this.sceneAge += rawDelta;
    this.sceneEnter = Math.min(1, this.sceneEnter + rawDelta / 1.05);
    if (this.current) {
      const t = easeOutCubic(this.sceneEnter);
      const scale = 0.9 + t * 0.1;
      this.current.group.scale.setScalar(scale);
      this.current.update(rawDelta, this.sceneAge, this.camera);
    }
    this.renderer.render(this.scene, this.camera);
  };

  describeView(): string {
    const normalized = ((this.theta % TAU) + TAU) % TAU;
    const positions = [
      "in front of the subject",
      "to the front right of the subject",
      "to the right of the subject",
      "behind and to the right",
      "behind the subject",
      "behind and to the left",
      "to the left of the subject",
      "to the front left of the subject",
    ];
    const index = Math.round(normalized / (TAU / 8)) % 8;
    const motion = this.pointerActive || this.keysDown.size
      ? "The automatic orbit is paused while you scrub."
      : this.reducedMotion
        ? "The camera is circling slowly to respect your reduced-motion setting."
        : "The camera is circling the subject automatically.";
    return `You are viewing from ${positions[index]}, at a constant distance. ${motion}`;
  }

  getReducedMotion(): boolean {
    return this.reducedMotion;
  }

  private disposeGroup(group: THREE.Object3D): void {
    const textures = new Set<THREE.Texture>();
    group.userData.disposed = true;
    group.traverse((object) => {
      const maybeMesh = object as THREE.Mesh;
      if (maybeMesh.geometry && !maybeMesh.geometry.userData?.shared) {
        maybeMesh.geometry.dispose();
      }
      const materials = Array.isArray(maybeMesh.material) ? maybeMesh.material : maybeMesh.material ? [maybeMesh.material] : [];
      for (const material of materials) {
        const record = material as THREE.Material & {
          map?: THREE.Texture;
          normalMap?: THREE.Texture;
          emissiveMap?: THREE.Texture;
          alphaMap?: THREE.Texture;
          uniforms?: Record<string, { value: unknown }>;
        };
        for (const key of ["map", "normalMap", "emissiveMap", "alphaMap"] as const) {
          const texture = record[key];
          if (texture instanceof THREE.Texture) textures.add(texture);
        }
        if (record.uniforms) {
          for (const uniform of Object.values(record.uniforms)) {
            if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
          }
        }
        material.userData.disposed = true;
        if (!material.userData?.shared) material.dispose();
      }
    });
    for (const texture of textures) {
      if (!texture.userData?.shared) texture.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mediaQuery?.removeEventListener?.("change", this.mediaQueryListener);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("lostpointercapture", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.current) this.disposeGroup(this.current.group);
    this.disposeGroup(this.stars);
    this.stars.clear();
    this.renderer.dispose();
  }

  private mediaQueryListener = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches;
  };
}
