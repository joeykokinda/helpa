import { decodeMaskToRaster, formats, recordsOfKind } from "@meta-sam/parser";

export type PartMask = { left: number; top: number; width: number; height: number; raster: Uint8Array; rasterWidth: number; rasterHeight: number };

/** Parses SAM 3.1's raw output text into masks positioned in source-image pixels. */
export function parseMasks(samText: string): PartMask[] {
  if (!samText) return [];
  const parser = formats.segmentation.image().createParser();
  parser.push(samText.endsWith("\n") ? samText : samText + "\n", { emit: false });
  const { result } = parser.finish({ status: "completed" });
  return recordsOfKind(result.records, "mask").map((record) => ({
    left: record.bounds.left,
    top: record.bounds.top,
    width: record.bounds.right - record.bounds.left,
    height: record.bounds.bottom - record.bounds.top,
    raster: decodeMaskToRaster(record.mask),
    rasterWidth: record.mask.width,
    rasterHeight: record.mask.height,
  }));
}

/** Paints masks onto a canvas the size of the source image, in one glowing color. */
export function paintMasks(canvas: HTMLCanvasElement, masks: PartMask[], color: [number, number, number]) {
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const mask of masks) {
    const tile = new ImageData(mask.rasterWidth, mask.rasterHeight);
    mask.raster.forEach((value, index) => {
      if (!value) return;
      tile.data.set([color[0], color[1], color[2], 255], index * 4);
    });
    const scratch = document.createElement("canvas");
    scratch.width = mask.rasterWidth;
    scratch.height = mask.rasterHeight;
    scratch.getContext("2d")!.putImageData(tile, 0, 0);
    context.drawImage(scratch, mask.left, mask.top, mask.width, mask.height);
  }
}
