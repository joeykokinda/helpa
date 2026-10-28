"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { palette } from "./toon";

/** Cream paper with a faint engineering grid, fading out at the edges, and a warm soft shadow catcher on top. */
export default function Ground() {
  const gridMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          paper: { value: new THREE.Color(palette.paper) },
          minor: { value: new THREE.Color(palette.gridMinor) },
          major: { value: new THREE.Color(palette.gridMajor) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vPlane;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vPlane = world.xz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 paper;
          uniform vec3 minor;
          uniform vec3 major;
          varying vec2 vPlane;
          float gridLine(vec2 plane, float spacing, float width) {
            vec2 cell = plane / spacing;
            vec2 distance = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
            return 1.0 - clamp(min(distance.x, distance.y) - width + 0.5, 0.0, 1.0);
          }
          void main() {
            float fade = 1.0 - smoothstep(1.6, 4.2, length(vPlane));
            vec3 color = paper;
            color = mix(color, minor, gridLine(vPlane, 0.1, 0.4) * fade);
            color = mix(color, major, gridLine(vPlane, 0.5, 0.8) * fade);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );

  return (
    <group userData={{ noOutline: true }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} material={gridMaterial} renderOrder={-1}>
        <planeGeometry args={[14, 14]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <shadowMaterial color={palette.shadow} opacity={0.3} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
