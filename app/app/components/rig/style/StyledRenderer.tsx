"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { edgeMaterial, isLattice, normalMaterial, overlayLayer, stylizeMesh } from "./toon";

type Swap = { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] };

/**
 * Swaps every visible, solid mesh to a normal material for the outline pass and hides the rest.
 * Also stylizes meshes on the way, so models never need to know about the look.
 */
function prepareNormalPass(object: THREE.Object3D, focusRoot: THREE.Object3D | undefined, focused: boolean, swaps: Swap[], hidden: THREE.Object3D[]) {
  if (!object.visible) return;
  if (object.userData.noOutline || !object.layers.isEnabled(0)) {
    object.visible = false;
    hidden.push(object);
    return;
  }
  const inFocus = focused || object === focusRoot;
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh) {
    stylizeMesh(mesh);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material.userData.seeThrough || material.opacity < 0.99 || !material.visible || material.colorWrite === false || (!inFocus && isLattice(mesh.geometry))) {
      mesh.visible = false;
      hidden.push(mesh);
      return;
    }
    swaps.push({ mesh, material: mesh.material });
    mesh.material = normalMaterial(material.side, inFocus, material.depthTest);
  } else if ((object as THREE.Line).isLine || (object as THREE.Points).isPoints || (object as THREE.Sprite).isSprite) {
    object.visible = false;
    hidden.push(object);
    return;
  }
  for (const child of object.children) prepareNormalPass(child, focusRoot, inFocus, swaps, hidden);
}

function restoreNormalPass(swaps: Swap[], hidden: THREE.Object3D[]) {
  for (const swap of swaps) swap.mesh.material = swap.material;
  for (const object of hidden) object.visible = true;
}

function createResources() {
  const depthTexture = new THREE.DepthTexture(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, { depthTexture, depthBuffer: true });
  const material = edgeMaterial();
  material.uniforms.normals.value = target.texture;
  material.uniforms.depths.value = depthTexture;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  return { target, material, quad, quadScene, quadCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), buffer: new THREE.Vector2(), clearColor: new THREE.Color(), swaps: [] as Swap[], hidden: [] as THREE.Object3D[] };
}

/**
 * Takes over rendering: a normal/depth pass, the cel-shaded frame, ink outlines and the focus outline composited
 * from that pass, then the overlay layer (motion guides, ghosts, effects) on top of the outlines.
 */
export default function StyledRenderer({ focusRef, nodesRef }: { focusRef: RefObject<string | null>; nodesRef: RefObject<Record<string, THREE.Group>> }) {
  const resourcesRef = useRef<ReturnType<typeof createResources> | null>(null);

  useEffect(() => {
    const resources = createResources();
    resourcesRef.current = resources;
    return () => {
      resourcesRef.current = null;
      resources.target.dispose();
      resources.target.depthTexture?.dispose();
      resources.material.dispose();
      resources.quad.geometry.dispose();
    };
  }, []);

  useFrame(({ gl, scene, camera, clock }) => {
    const resources = resourcesRef.current;
    if (!resources) return;
    const { target, material, quadScene, quadCamera, buffer, clearColor, swaps, hidden } = resources;
    gl.getDrawingBufferSize(buffer);
    if (target.width !== buffer.x || target.height !== buffer.y) target.setSize(buffer.x, buffer.y);
    const pixelRatio = gl.getPixelRatio();
    const ortho = camera as THREE.OrthographicCamera;

    // 1. normals + depth
    const background = scene.background;
    const clearAlpha = gl.getClearAlpha();
    gl.getClearColor(clearColor);
    scene.background = null;
    gl.setClearColor(0x8080ff, 0);
    gl.shadowMap.autoUpdate = false;
    camera.layers.set(0);
    swaps.length = 0;
    hidden.length = 0;
    const focus = focusRef.current ? nodesRef.current[focusRef.current] : undefined;
    prepareNormalPass(scene, focus, false, swaps, hidden);
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    restoreNormalPass(swaps, hidden);
    gl.setClearColor(clearColor, clearAlpha);

    // 2. the cel-shaded frame, with fresh shadows
    scene.background = background;
    gl.shadowMap.needsUpdate = true;
    gl.render(scene, camera);
    const calls = gl.info.render.calls;

    // 3. ink lines and the focus outline
    const uniforms = material.uniforms;
    uniforms.texel.value.set(1 / buffer.x, 1 / buffer.y);
    uniforms.thickness.value = Math.max(1, 1.25 * pixelRatio);
    const pulse = (Math.sin(clock.elapsedTime * 5) + 1) / 2;
    uniforms.focusRadius.value = (3.2 + pulse * 1.3) * pixelRatio;
    uniforms.focusAlpha.value = 0.82 + pulse * 0.18;
    uniforms.depthRange.value = ortho.far - ortho.near;
    // A step must be a few pixels deep to count as an edge, so close-ups and overviews read alike.
    const worldPerPixel = (ortho.top - ortho.bottom) / ortho.zoom / buffer.y;
    uniforms.depthThreshold.value = Math.max(0.0025, worldPerPixel * 4);
    gl.autoClear = false;
    gl.render(quadScene, quadCamera);

    // 4. overlays above the ink
    scene.background = null;
    camera.layers.set(overlayLayer);
    gl.render(scene, camera);
    camera.layers.set(0);
    scene.background = background;
    gl.autoClear = true;

    if (process.env.NODE_ENV !== "production") (window as unknown as { __rigStats?: object }).__rigStats = { calls, triangles: gl.info.render.triangles };
  }, 1);

  return null;
}
