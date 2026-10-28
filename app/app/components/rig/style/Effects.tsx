"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { Beat, RigPartDef } from "../../../lib/rig/types";
import type { PlayHead } from "./MotionGuide";
import { timing } from "./motion";
import { overlayLayer } from "./toon";

const puffs = 12;
const sparkles = 14;
const drops = 16;

const waterParts = /water|drain|tap|hose|valve|pump|inlet|sump|spray|jet|filter/i;
const lightParts = /bulb|lamp|light/i;
const liquidParts = /\boil|drain plug|drain pan|standing water|rinse water/i;

/** Which effect a beat earns, and when (in seconds into the beat) it fires. */
function effectFor(beat: Beat, def: RigPartDef) {
  const name = `${def.id} ${def.label}`;
  // Oil and other liquids have their own catalog effects (streams, drips, pools); water splashes would be wrong.
  if (liquidParts.test(name) && def.joint.kind !== "debris") return null;
  if (beat.action === "clean" && def.joint.kind === "debris") return { puff: 1, sparkle: 1, drop: 0, ring: 0, halo: 0, at: timing.lead + timing.move * 0.32 };
  if (beat.action === "clean") return { puff: 0, sparkle: 1, drop: waterParts.test(name) ? 1 : 0, ring: 0, halo: 0, at: timing.lead + timing.move * 0.5 };
  if (beat.action === "press") return { puff: 0, sparkle: 0, drop: 0, ring: 1, halo: 0, at: timing.lead + timing.move * 0.12 };
  if (lightParts.test(name) && (beat.action === "insert" || beat.action === "close" || beat.action === "lock")) return { puff: 0, sparkle: 1, drop: 0, ring: 0, halo: 1, at: timing.lead + timing.move * 0.9 };
  if (waterParts.test(name) && ["open", "remove", "unlock", "turn"].includes(beat.action)) return { puff: 0, sparkle: 0, drop: 1, ring: 0, halo: 0, at: timing.lead + timing.move * 0.45 };
  return null;
}

/**
 * Stylized one-shot effects in a single draw call: outlined puffs and sparkles when grime comes off, droplets for
 * water parts, a ripple on presses and a halo when a bulb goes in. Particles move in the shader from a seed and the
 * time since the effect fired, so nothing is updated per particle on the CPU.
 */
export default function Effects({ beat, def, nodes, playRef }: { beat?: Beat; def?: RigPartDef; nodes: RefObject<Record<string, THREE.Group>>; playRef: RefObject<PlayHead> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const firedRef = useRef<{ beat?: Beat; effect: ReturnType<typeof effectFor> }>({ effect: null });
  const { geometry, material } = useMemo(() => {
    const count = puffs + sparkles + drops + 1;
    const seeds = new Float32Array(count * 4);
    const kinds = new Float32Array(count);
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let index = 0; index < count; index++) {
      seeds.set([random(), random(), random(), random()], index * 4);
      kinds[index] = index < puffs ? 0 : index < puffs + sparkles ? 1 : index < puffs + sparkles + drops ? 2 : 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
    geometry.setAttribute("kind", new THREE.BufferAttribute(kinds, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        elapsed: { value: -1 },
        enabled: { value: new THREE.Vector4() },
        halo: { value: 0 },
        origin: { value: new THREE.Vector3() },
        spread: { value: 0.05 },
        pixelsPerUnit: { value: 100 },
        pixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        attribute float kind;
        uniform float elapsed;
        uniform vec4 enabled;
        uniform float halo;
        uniform vec3 origin;
        uniform float spread;
        uniform float pixelsPerUnit;
        uniform float pixelRatio;
        varying float vKind;
        varying float vLife;
        varying float vSeed;
        void main() {
          vec3 direction = normalize(seed.xyz * 2.0 - 1.0 + vec3(0.0, 0.45, 0.0));
          vec3 point = origin;
          float size = 0.0;
          float life = 0.0;
          if (kind < 0.5) {
            float time = (elapsed - seed.w * 0.18) / 0.95;
            life = clamp(time, 0.0, 1.0);
            point += direction * spread * (0.3 + 1.1 * (1.0 - pow(1.0 - life, 3.0))) + vec3(0.0, spread * 0.5 * life, 0.0);
            // Pop up fast, then shrink away: toon puffs vanish by getting smaller, not by going see-through.
            size = spread * (0.55 + 0.45 * seed.x) * pow(sin(min(life * 1.6, 1.0) * 1.5708), 0.5) * (1.0 - smoothstep(0.55, 1.0, life)) * enabled.x * step(0.0, time) * step(time, 1.0);
          } else if (kind < 1.5) {
            float time = (elapsed - 0.08 - seed.w * 0.4) / 0.75;
            life = clamp(time, 0.0, 1.0);
            point += direction * spread * (0.5 + 1.5 * sqrt(life));
            size = spread * (0.5 + 0.6 * seed.y) * sin(life * 3.14159) * enabled.y * step(0.0, time);
          } else if (kind < 2.5) {
            float time = (elapsed - seed.w * 0.55) / 0.8;
            life = clamp(time, 0.0, 1.0);
            vec3 velocity = vec3(direction.x * 0.9, 1.1 + seed.y * 0.7, direction.z * 0.9) * spread * 2.4;
            point += velocity * life + vec3(0.0, -spread * 6.0, 0.0) * life * life;
            size = spread * 0.3 * (0.7 + 0.5 * seed.x) * enabled.z * step(0.0, time) * step(time, 1.0);
          } else {
            float time = elapsed / (halo > 0.5 ? 1.4 : 0.7);
            life = clamp(time, 0.0, 1.0);
            size = spread * (halo > 0.5 ? 3.2 + 0.25 * sin(elapsed * 7.0) : 0.8 + 2.6 * life) * enabled.w * step(0.0, time) * step(time, 1.0);
          }
          vKind = kind + (kind > 2.5 ? halo : 0.0);
          vLife = life;
          vSeed = seed.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
          gl_PointSize = min(size * pixelsPerUnit * pixelRatio, 512.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vKind;
        varying float vLife;
        varying float vSeed;
        const vec3 ink = vec3(0.169, 0.145, 0.133);
        void main() {
          vec2 point = gl_PointCoord * 2.0 - 1.0;
          float radius = length(point);
          vec4 color = vec4(0.0);
          if (vKind < 0.5) {
            // cartoon dust puff: an opaque lumpy cloud, warm white with a shaded underside and an ink rim
            float edge = 0.88 + 0.07 * sin(atan(point.y, point.x) * 5.0 + vSeed * 6.2831);
            float body = 1.0 - smoothstep(edge - 0.03, edge, radius);
            float rim = smoothstep(edge - 0.17, edge - 0.12, radius);
            vec3 fill = mix(vec3(1.0, 0.99, 0.96), vec3(0.93, 0.87, 0.78), smoothstep(-0.2, 0.7, point.y));
            color = vec4(mix(fill, ink, rim), body);
          } else if (vKind < 1.5) {
            float star = max(0.0, 1.0 - abs(point.x * point.y) * 22.0 - radius * 0.95);
            vec3 tint = mix(vec3(1.0, 0.84, 0.35), vec3(1.0, 1.0, 0.92), smoothstep(0.2, 0.7, star));
            color = vec4(tint, smoothstep(0.0, 0.12, star));
          } else if (vKind < 2.5) {
            float body = 1.0 - smoothstep(0.78, 0.88, radius);
            float rim = smoothstep(0.58, 0.66, radius);
            float shine = 1.0 - smoothstep(0.0, 0.22, length(point - vec2(-0.25, -0.28)));
            vec3 water = mix(vec3(0.36, 0.7, 0.98), ink, rim);
            color = vec4(mix(water, vec3(1.0), shine * (1.0 - rim)), body * (1.0 - smoothstep(0.7, 1.0, vLife)));
          } else if (vKind < 3.5) {
            float ring = smoothstep(0.62, 0.7, radius) * (1.0 - smoothstep(0.86, 0.94, radius));
            color = vec4(1.0, 0.54, 0.16, ring * (1.0 - vLife));
          } else {
            float glow = pow(max(0.0, 1.0 - radius), 2.0);
            color = vec4(1.0, 0.86, 0.45, glow * 0.75 * sin(vLife * 3.14159));
          }
          if (color.a < 0.01) discard;
          gl_FragColor = color;
        }
      `,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    pointsRef.current?.layers.set(overlayLayer);
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ camera, gl }) => {
    const points = pointsRef.current;
    if (!points) return;
    const fired = firedRef.current;
    const uniforms = (points.material as THREE.ShaderMaterial).uniforms;
    if (fired.beat !== beat) {
      fired.beat = beat;
      fired.effect = beat && def ? effectFor(beat, def) : null;
      const node = beat ? nodes.current[beat.part] : undefined;
      if (fired.effect && node) {
        const box = new THREE.Box3().setFromObject(node);
        box.getCenter(uniforms.origin.value);
        uniforms.spread.value = Math.max(0.018, Math.min(0.09, box.getSize(new THREE.Vector3()).length() * 0.35));
        const { puff, sparkle, drop, ring, halo } = fired.effect;
        uniforms.enabled.value.set(puff, sparkle, drop, ring || halo);
        uniforms.halo.value = halo;
      } else fired.effect = null;
    }
    points.visible = !!fired.effect;
    if (!fired.effect) return;
    uniforms.elapsed.value = playRef.current.within - fired.effect.at;
    uniforms.pixelsPerUnit.value = (camera as THREE.OrthographicCamera).zoom;
    uniforms.pixelRatio.value = gl.getPixelRatio();
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={40} />;
}
