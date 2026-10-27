import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: number, draw: (context: CanvasRenderingContext2D, size: number) => void, repeat: [number, number] = [1, 1]) {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/** Stainless drum wall with rows of small holes. */
export function perforatedTexture() {
  return canvasTexture(
    "perforated",
    256,
    (context, size) => {
      context.fillStyle = "#c9ced4";
      context.fillRect(0, 0, size, size);
      context.fillStyle = "#8e959e";
      const step = size / 8;
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
          context.beginPath();
          context.arc(column * step + (row % 2 ? step / 2 : 0) + step / 4, row * step + step / 2, step * 0.14, 0, Math.PI * 2);
          context.fill();
        }
      }
    },
    [10, 4],
  );
}

/** Fine screen mesh, drawn as a grid with see-through gaps. */
export function screenMeshTexture() {
  return canvasTexture(
    "screen-mesh",
    128,
    (context, size) => {
      context.clearRect(0, 0, size, size);
      context.strokeStyle = "rgba(90, 96, 104, 0.95)";
      context.lineWidth = 1.4;
      const step = size / 16;
      for (let line = 0; line <= 16; line++) {
        context.beginPath();
        context.moveTo(line * step, 0);
        context.lineTo(line * step, size);
        context.moveTo(0, line * step);
        context.lineTo(size, line * step);
        context.stroke();
      }
    },
    [4, 4],
  );
}

/** A soft, pale felt of lint with ragged edges, the stuff that collects on the screen. */
export function lintTexture() {
  return canvasTexture("lint", 256, (context, size) => {
    context.clearRect(0, 0, size, size);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // a solid felt body with an uneven outline
    context.fillStyle = "rgb(214, 210, 218)";
    context.beginPath();
    for (let point = 0; point <= 64; point++) {
      const angle = (point / 64) * Math.PI * 2;
      const wobble = 0.42 + random() * 0.05;
      const x = size / 2 + Math.cos(angle) * size * wobble * 1.05;
      const y = size / 2 + Math.sin(angle) * size * wobble;
      context[point ? "lineTo" : "moveTo"](Math.min(size - 4, Math.max(4, x)), Math.min(size - 4, Math.max(4, y)));
    }
    context.fill();
    // soft clumps
    for (let blob = 0; blob < 500; blob++) {
      const x = size * (0.1 + random() * 0.8);
      const y = size * (0.1 + random() * 0.8);
      const shade = 185 + Math.floor(random() * 50);
      context.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade + 6}, ${0.25 + random() * 0.3})`;
      context.beginPath();
      context.arc(x, y, 2 + random() * 7, 0, Math.PI * 2);
      context.fill();
    }
    // stray fibres, a few with a hint of colour from clothes
    for (let fiber = 0; fiber < 320; fiber++) {
      const x = size * (0.08 + random() * 0.84);
      const y = size * (0.08 + random() * 0.84);
      const tint = random();
      context.strokeStyle = tint > 0.93 ? "rgba(110, 140, 200, 0.5)" : tint > 0.88 ? "rgba(200, 120, 130, 0.5)" : "rgba(250, 248, 252, 0.55)";
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(x + (random() - 0.5) * 22, y + (random() - 0.5) * 22, x + (random() - 0.5) * 34, y + (random() - 0.5) * 34);
      context.stroke();
    }
  });
}

/** Ribbed foil for vent hoses. */
export function foilTexture() {
  return canvasTexture(
    "foil",
    64,
    (context, size) => {
      const gradient = context.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, "#d9dde2");
      gradient.addColorStop(0.5, "#9aa1aa");
      gradient.addColorStop(1, "#d9dde2");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    },
    [1, 14],
  );
}
