import * as THREE from "three";

/** Shared look for every rig: cel shading, outlines from a normal/depth pass, and the palette. */

export const palette = {
  accent: "#ff8a2a",
  accentDeep: "#e8650f",
  ink: "#2b2522",
  paper: "#f4eee4",
  gridMinor: "#e9e1d3",
  gridMajor: "#ddd2bf",
  shadow: "#8a6a4e",
};

/** Objects (and their subtrees) flagged with this stay out of the outline pass and draw after it. */
export const overlayLayer = 1;

let gradient: THREE.DataTexture | null = null;

/** One shared ramp for every toon material: a deep shade, a mid band and the lit face, with soft steps so curves keep some depth. */
export function toonGradient() {
  if (gradient) return gradient;
  const width = 256;
  const data = new Uint8Array(width * 4);
  const bands: [number, number][] = [
    [0, 0.0],
    [0.45, 0.55],
    [0.78, 1.0],
  ];
  const softness = 0.03;
  for (let index = 0; index < width; index++) {
    const coord = index / (width - 1);
    let value = bands[0][1];
    for (const [edge, level] of bands.slice(1)) {
      const blend = THREE.MathUtils.smoothstep(coord, edge - softness, edge + softness);
      value = value + (level - value) * blend;
    }
    const byte = Math.round(value * 255);
    data.set([byte, byte, byte, 255], index * 4);
  }
  gradient = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  gradient.magFilter = THREE.LinearFilter;
  gradient.minFilter = THREE.LinearFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

type LitMaterial = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;

/** True for see-through things (glass, decals, cutouts) that should not get outlines or cast shadows. */
export function isSeeThrough(material: THREE.Material) {
  if (material.userData.seeThrough !== undefined) return material.userData.seeThrough as boolean;
  const lit = material as LitMaterial;
  return (lit.transmission ?? 0) > 0 || (material.transparent && (material.opacity < 0.98 || !!lit.map || !!lit.alphaMap || material.alphaTest > 0));
}

function isGlass(material: THREE.Material) {
  const lit = material as LitMaterial;
  return isSeeThrough(material) && !lit.map && !lit.alphaMap && material.opacity < 0.75;
}

/** A cel-shaded copy of a lit material, keeping its colour, maps, transparency and sidedness. Unlit and custom materials pass through. */
export function toonCopy(source: THREE.Material): THREE.Material {
  if (source.userData.toon) return source;
  if (!("isMeshStandardMaterial" in source || "isMeshPhongMaterial" in source || "isMeshLambertMaterial" in source)) {
    source.userData.seeThrough = isSeeThrough(source);
    source.userData.toon = true;
    return source;
  }
  const lit = source as LitMaterial;
  const toon = new THREE.MeshToonMaterial({
    name: source.name,
    color: lit.color,
    map: lit.map,
    alphaMap: lit.alphaMap,
    alphaTest: source.alphaTest,
    transparent: source.transparent || (lit.transmission ?? 0) > 0,
    opacity: (lit.transmission ?? 0) > 0 ? Math.min(source.opacity, 0.35) : source.opacity,
    side: source.side,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
    emissive: lit.emissive,
    emissiveIntensity: lit.emissiveIntensity,
    emissiveMap: lit.emissiveMap,
    normalMap: lit.normalMap,
    normalScale: lit.normalScale,
    bumpMap: lit.bumpMap,
    bumpScale: lit.bumpScale,
    aoMap: lit.aoMap,
    vertexColors: source.vertexColors,
    polygonOffset: source.polygonOffset,
    polygonOffsetFactor: source.polygonOffsetFactor,
    polygonOffsetUnits: source.polygonOffsetUnits,
    visible: source.visible,
    colorWrite: source.colorWrite,
    gradientMap: toonGradient(),
  });
  // Metal has no reflections to read by in a cel look, so lift it a touch to keep it from going muddy.
  if ((lit.metalness ?? 0) > 0.5 && !lit.map) toon.color.lerp(new THREE.Color("#ffffff"), 0.12);
  toon.userData = { ...source.userData, toon: true, seeThrough: isSeeThrough(source), glass: isGlass(source) };
  return toon;
}

const sharedToon = new WeakMap<THREE.Material, THREE.Material>();

function sharedToonCopy(source: THREE.Material) {
  if (source.userData.toon) return source;
  let toon = sharedToon.get(source);
  if (!toon) {
    toon = toonCopy(source);
    sharedToon.set(source, toon);
  }
  return toon;
}

const glassEdges = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();
let glassLine: THREE.LineBasicMaterial | null = null;

/** Glass keeps its see-through body and gets a thin drawn edge instead of a thick outline. */
function addGlassEdge(mesh: THREE.Mesh) {
  if (mesh.userData.glassEdge || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
  mesh.userData.glassEdge = true;
  let edges = glassEdges.get(mesh.geometry);
  if (!edges) {
    edges = new THREE.EdgesGeometry(mesh.geometry, 28);
    glassEdges.set(mesh.geometry, edges);
  }
  glassLine ??= new THREE.LineBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.55 });
  const line = new THREE.LineSegments(edges, glassLine);
  line.raycast = () => {};
  mesh.add(line);
}

/** Puts a mesh in the house style. Idempotent; called for every mesh, every frame, so late-mounting meshes are caught too. */
export function stylizeMesh(mesh: THREE.Mesh) {
  const current = mesh.material;
  if (Array.isArray(current)) {
    if (current.some((material) => !material.userData.toon)) mesh.material = current.map(sharedToonCopy);
  } else if (!current.userData.toon) {
    mesh.material = sharedToonCopy(current);
  }
  if (mesh.userData.styled) return;
  mesh.userData.styled = true;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  // The ground is the only thing that takes shadows: self-shadowing a cel look just adds noise.
  mesh.receiveShadow = false;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  // Knobs, screws and labels barely show in a soft ground shadow; skipping them saves a draw call each per frame.
  const radius = (mesh.geometry.boundingSphere?.radius ?? 1) * mesh.getWorldScale(new THREE.Vector3()).length() * 0.577;
  mesh.castShadow = radius > 0.03 && !isSeeThrough(material) && material.colorWrite !== false && material.visible;
  if (material.userData.glass) addGlassEdge(mesh);
}

const thinGeometry = new WeakMap<THREE.BufferGeometry, boolean>();

/**
 * Wire racks, mesh screens and other lattices fill a tiny share of their bounding box. Inked, every wire becomes a
 * black smear, so they skip the outline pass unless they are the focused part.
 */
export function isLattice(geometry: THREE.BufferGeometry) {
  const cached = thinGeometry.get(geometry);
  if (cached !== undefined) return cached;
  const position = geometry.getAttribute("position");
  let lattice = false;
  if (position && position.count > 1500) {
    const index = geometry.getIndex();
    const triangles = index ? index.count / 3 : position.count / 3;
    const [first, second, third] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let volume = 0;
    for (let triangle = 0; triangle < triangles; triangle++) {
      const corner = (offset: number) => (index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset);
      first.fromBufferAttribute(position, corner(0));
      second.fromBufferAttribute(position, corner(1));
      third.fromBufferAttribute(position, corner(2));
      volume += first.dot(second.cross(third)) / 6;
    }
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const boxVolume = Math.max(1e-9, size.x * size.y * size.z);
    lattice = Math.abs(volume) / boxVolume < 0.06 && Math.min(size.x, size.y, size.z) > 0.02;
  }
  thinGeometry.set(geometry, lattice);
  return lattice;
}

/* ---------- outline pass materials ---------- */

const normalMaterials = new Map<string, THREE.MeshNormalMaterial>();

/** View-space normals in rgb, and whether this is the focused part in alpha. */
export function normalMaterial(side: THREE.Side, focused: boolean, depthTest: boolean) {
  const key = `${side}-${focused}-${depthTest}`;
  let material = normalMaterials.get(key);
  if (!material) {
    material = new THREE.MeshNormalMaterial({ side, depthTest, opacity: focused ? 1 : 0, blending: THREE.NoBlending });
    normalMaterials.set(key, material);
  }
  return material;
}

/** Composites ink lines (depth laplacian + normal creases) and the thick orange focus outline over the frame. */
export function edgeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      normals: { value: null },
      depths: { value: null },
      texel: { value: new THREE.Vector2(1, 1) },
      thickness: { value: 1 },
      focusRadius: { value: 6 },
      depthRange: { value: 10 },
      depthThreshold: { value: 0.01 },
      ink: { value: new THREE.Color(palette.ink) },
      focusColor: { value: new THREE.Color(palette.accent) },
      focusAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D normals;
      uniform sampler2D depths;
      uniform vec2 texel;
      uniform float thickness;
      uniform float focusRadius;
      uniform float depthRange;
      uniform float depthThreshold;
      uniform vec3 ink;
      uniform vec3 focusColor;
      uniform float focusAlpha;
      varying vec2 vUv;

      float depthAt(vec2 uv) { return texture2D(depths, uv).r * depthRange; }
      vec3 normalAt(vec2 uv) { return texture2D(normals, uv).rgb * 2.0 - 1.0; }
      float maskAt(vec2 uv) { return texture2D(normals, uv).a; }

      void main() {
        vec2 offsetX = vec2(texel.x * thickness, 0.0);
        vec2 offsetY = vec2(0.0, texel.y * thickness);
        float center = depthAt(vUv);
        float left = depthAt(vUv - offsetX);
        float right = depthAt(vUv + offsetX);
        float down = depthAt(vUv - offsetY);
        float up = depthAt(vUv + offsetY);
        // Planes are linear in an orthographic depth buffer, so the laplacian only fires on real steps, at any slope.
        float laplacian = abs(left + right - 2.0 * center) + abs(down + up - 2.0 * center);
        float depthEdge = smoothstep(depthThreshold, depthThreshold * 2.0, laplacian);

        vec3 normalCenter = normalAt(vUv);
        float crease = (1.0 - dot(normalCenter, normalAt(vUv + offsetX))) + (1.0 - dot(normalCenter, normalAt(vUv + offsetY)));
        float creaseEdge = smoothstep(0.32, 0.6, crease) * 0.85;
        float line = max(depthEdge, creaseEdge);

        // Thick focus outline: anything near the focused part's mask, outside it.
        float inside = maskAt(vUv);
        float near = 0.0;
        for (int index = 0; index < 12; index++) {
          float angle = float(index) * 0.5235988;
          vec2 direction = vec2(cos(angle), sin(angle)) * texel;
          near = max(near, maskAt(vUv + direction * focusRadius));
          near = max(near, maskAt(vUv + direction * focusRadius * 0.5));
        }
        float focus = near * (1.0 - inside) * focusAlpha;

        vec3 color = mix(ink, focusColor, step(0.01, focus));
        float alpha = max(line * 0.92 * (1.0 - focus), focus);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

let ghost: THREE.MeshMatcapMaterial | null = null;

/** Where a part is going: a see-through orange copy, shaded by a matcap so it needs no lights. */
export function ghostMaterial() {
  if (ghost) return ghost;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const fill = context.createRadialGradient(26, 24, 2, 32, 32, 32);
  fill.addColorStop(0, "#fff1e2");
  fill.addColorStop(0.6, "#ffc79a");
  fill.addColorStop(0.92, "#ff8a2a");
  fill.addColorStop(1, "#e8650f");
  context.fillStyle = fill;
  context.fillRect(0, 0, 64, 64);
  const matcap = new THREE.CanvasTexture(canvas);
  matcap.colorSpace = THREE.SRGBColorSpace;
  ghost = new THREE.MeshMatcapMaterial({ matcap, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  return ghost;
}
