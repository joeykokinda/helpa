import * as THREE from "three";
import type { Cutout, Pose } from "./live";

/** A rectangle on screen in CSS pixels, relative to the AR layer. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/**
 * One part in the AR layer. "ghost" is the hologram acting out the beat, "slot" outlines the real part while the
 * person does it. `appear` builds the hologram in behind a scan line (0 to 1); with `leaving` it dissolves into
 * pixels instead. `hole` darkens where the part really is while its ghost is out.
 */
export type GhostDraw = { id: string; cutout: Cutout; rect: ScreenRect; pose: Pose; appear: number; leaving: boolean; hole: number; mode: "ghost" | "slot"; opacity: number };

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// One program for every layer: 0 hologram, 1 hole, 2 drop shadow, 3 slot outline.
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform float time;
uniform float appear;
uniform float leaving;
uniform float opacity;
uniform float mode;
uniform float reduced;
varying vec2 vUv;

float hash(vec2 point) { return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 tex = texture2D(map, vUv);
  float alpha = tex.a;
  float around = 0.0;
  for (int index = 0; index < 8; index++) {
    float angle = float(index) * 0.785398;
    around += texture2D(map, vUv + vec2(cos(angle), sin(angle)) * texel * 2.5).a;
  }
  around /= 8.0;
  float edge = clamp((alpha - around) * 2.6, 0.0, 1.0);
  float halo = (1.0 - alpha) * clamp(around * 2.2, 0.0, 1.0);

  if (mode > 0.5 && mode < 1.5) {
    gl_FragColor = vec4(0.0, 0.03, 0.05, alpha * 0.3 * opacity);
    return;
  }
  if (mode > 1.5 && mode < 2.5) {
    gl_FragColor = vec4(0.0, 0.02, 0.04, (alpha * 0.5 + around * 0.5) * 0.3 * opacity);
    return;
  }

  float scan = 0.72 + 0.28 * step(0.0, sin(gl_FragCoord.y * 1.1 - time * 9.0));
  float flicker = reduced > 0.5 ? 1.0 : 0.93 + 0.07 * hash(vec2(floor(time * 20.0), 3.1));
  vec3 edgeColor = vec3(0.7, 1.0, 1.0);
  vec3 dark = vec3(0.0, 0.07, 0.11);
  vec4 color;
  if (mode > 2.5) {
    // Slot outline: only the traced contour, breathing, over a dark under-stroke so it reads on white.
    float pulse = 0.65 + 0.35 * sin(time * 3.0);
    color = vec4(mix(dark, edgeColor, edge), max(edge * pulse, halo * 0.55));
  } else {
    float luminance = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 body = vec3(0.05, 0.78, 1.0) * (0.3 + 0.8 * luminance) * scan;
    if (reduced < 0.5) {
      // A thin red and blue split along the edges, like a slightly misaligned projector.
      float right = texture2D(map, vUv + vec2(texel.x * 3.0, 0.0)).a;
      float left = texture2D(map, vUv - vec2(texel.x * 3.0, 0.0)).a;
      body += vec3(max(0.0, right - alpha) * 0.9, 0.0, max(0.0, left - alpha) * 0.9);
    }
    vec3 rgb = mix(body, edgeColor, edge);
    float fill = alpha * 0.62 * scan;
    color = vec4(mix(dark, rgb, step(0.01, alpha)), max(max(fill, edge), halo * 0.6));
  }

  float fromTop = 1.0 - vUv.y;
  if (leaving > 0.5) {
    // Dissolve into small glowing pixels.
    float cell = hash(floor(vUv * vec2(46.0, 46.0)));
    float keep = step(cell, appear);
    float spark = step(cell, appear + 0.08) - keep;
    color.rgb = mix(color.rgb, edgeColor, spark);
    color.a = max(color.a * keep, spark * alpha);
  } else {
    // Build in behind a bright scan line sweeping down the part.
    float front = appear * 1.15 - 0.05;
    float built = smoothstep(front + 0.01, front - 0.02, fromTop);
    float line = smoothstep(0.035, 0.0, abs(fromTop - front)) * (1.0 - step(1.0, appear));
    color.a *= built;
    color.rgb = mix(color.rgb, vec3(0.85, 1.0, 1.0), line);
    color.a = max(color.a, line * max(alpha, around) * 0.95);
  }
  gl_FragColor = vec4(color.rgb, color.a * opacity * flicker);
}`;

type Entry = { group: THREE.Group; ghost: THREE.Mesh; shadow: THREE.Mesh; hole: THREE.Mesh; image: HTMLCanvasElement; texture: THREE.CanvasTexture; materials: THREE.ShaderMaterial[] };

const perspectiveDistance = 1100;

/** The hologram layer: one WebGL canvas, a perspective camera in CSS pixels, and a textured plane per part. */
export class ArLayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 1, 6000);
  private entries = new Map<string, Entry>();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = (2 * Math.atan(height / 2 / perspectiveDistance) * 180) / Math.PI;
    this.camera.position.set(width / 2, -height / 2, perspectiveDistance);
    this.camera.updateProjectionMatrix();
  }

  private entry(draw: GhostDraw) {
    let entry = this.entries.get(draw.id);
    if (entry && entry.image !== draw.cutout.image) {
      entry.texture.dispose();
      entry.texture = new THREE.CanvasTexture(draw.cutout.image);
      entry.texture.colorSpace = THREE.SRGBColorSpace;
      entry.image = draw.cutout.image;
      for (const material of entry.materials) {
        material.uniforms.map.value = entry.texture;
        material.uniforms.texel.value.set(1 / draw.cutout.image.width, 1 / draw.cutout.image.height);
      }
    }
    if (entry) return entry;
    const texture = new THREE.CanvasTexture(draw.cutout.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = (mode: number) =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          map: { value: texture },
          texel: { value: new THREE.Vector2(1 / draw.cutout.image.width, 1 / draw.cutout.image.height) },
          time: { value: 0 },
          appear: { value: 0 },
          leaving: { value: 0 },
          opacity: { value: 1 },
          mode: { value: mode },
          reduced: { value: 0 },
        },
      });
    const materials = [material(0), material(2), material(1)];
    const ghost = new THREE.Mesh(this.geometry, materials[0]);
    const shadow = new THREE.Mesh(this.geometry, materials[1]);
    const hole = new THREE.Mesh(this.geometry, materials[2]);
    hole.renderOrder = 0;
    shadow.renderOrder = 1;
    ghost.renderOrder = 2;
    const group = new THREE.Group();
    group.add(ghost);
    this.scene.add(hole, shadow, group);
    entry = { group, ghost, shadow, hole, image: draw.cutout.image, texture, materials };
    this.entries.set(draw.id, entry);
    return entry;
  }

  /** The plane's size and center on screen for a part box (the cutout carries a margin around the mask). */
  private plane(draw: GhostDraw) {
    const { image, margin } = draw.cutout;
    const scaleX = draw.rect.width / Math.max(1, image.width - margin * 2);
    const scaleY = draw.rect.height / Math.max(1, image.height - margin * 2);
    return { width: image.width * scaleX, height: image.height * scaleY, centerX: draw.rect.left + draw.rect.width / 2, centerY: draw.rect.top + draw.rect.height / 2 };
  }

  /** The world transform of a pose on a part box: about the pivot, then moved. */
  private poseMatrix(rect: ScreenRect, pose: Pose) {
    const pivotX = rect.left + pose.pivot[0] * rect.width;
    const pivotY = -(rect.top + pose.pivot[1] * rect.height);
    const axis = new THREE.Vector3(...pose.axis);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    const rotation = new THREE.Matrix4().makeRotationAxis(axis.normalize(), pose.angle);
    return new THREE.Matrix4()
      .makeTranslation(pivotX + pose.move[0], pivotY + pose.move[1], pose.move[2])
      .multiply(rotation)
      .multiply(new THREE.Matrix4().makeTranslation(-pivotX, -pivotY, 0));
  }

  /** Where a point on the part (0..1 of its box, y down) lands on screen for a pose. */
  project(rect: ScreenRect, pose: Pose, point: [number, number]) {
    const world = new THREE.Vector3(rect.left + point[0] * rect.width, -(rect.top + point[1] * rect.height), 0).applyMatrix4(this.poseMatrix(rect, pose));
    const projected = world.project(this.camera);
    return { x: ((projected.x + 1) / 2) * this.width, y: ((1 - projected.y) / 2) * this.height };
  }

  render(draws: GhostDraw[], time: number, reduced: boolean) {
    const live = new Set(draws.map((draw) => draw.id));
    for (const [id, entry] of this.entries) {
      entry.group.visible = entry.hole.visible = entry.shadow.visible = live.has(id);
    }
    for (const draw of draws) {
      const entry = this.entry(draw);
      const plane = this.plane(draw);
      for (const mesh of [entry.ghost, entry.shadow, entry.hole]) mesh.scale.set(plane.width, plane.height, 1);
      entry.hole.position.set(plane.centerX, -plane.centerY, -1);
      entry.ghost.position.set(plane.centerX, -plane.centerY, 0);
      entry.group.matrixAutoUpdate = false;
      entry.group.matrix.copy(this.poseMatrix(draw.rect, draw.pose));
      entry.group.matrixWorldNeedsUpdate = true;
      // The shadow falls on the machine under the ghost, softer and further off the more the part lifts away.
      const lifted = new THREE.Vector3(plane.centerX, -plane.centerY, 0).applyMatrix4(entry.group.matrix);
      entry.shadow.position.set(lifted.x + 8 * draw.pose.depth, lifted.y - 14 * draw.pose.depth, -0.5);
      entry.shadow.visible = draw.mode === "ghost" && draw.pose.depth > 0.02;
      const [ghostMaterial, shadowMaterial, holeMaterial] = entry.materials;
      ghostMaterial.uniforms.mode.value = draw.mode === "slot" ? 3 : 0;
      for (const material of entry.materials) {
        material.uniforms.time.value = time;
        material.uniforms.reduced.value = reduced ? 1 : 0;
      }
      ghostMaterial.uniforms.appear.value = draw.appear;
      ghostMaterial.uniforms.leaving.value = draw.leaving ? 1 : 0;
      ghostMaterial.uniforms.opacity.value = draw.opacity;
      shadowMaterial.uniforms.opacity.value = draw.opacity * Math.min(1, draw.pose.depth * 3) * draw.appear;
      holeMaterial.uniforms.opacity.value = draw.opacity * draw.hole;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const entry of this.entries.values()) {
      entry.texture.dispose();
      entry.materials.forEach((material) => material.dispose());
    }
    this.geometry.dispose();
    this.renderer.dispose();
  }
}
