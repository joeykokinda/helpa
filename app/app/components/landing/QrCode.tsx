"use client";

import qrcode from "qrcode-generator";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** A QR code for the app on this same site, so someone reading the page on a laptop can open Helpa on their phone. */
export default function QrCode({ path = "/app", size = 132 }: { path?: string; size?: number }) {
  // The address only exists in the browser; the server renders an empty frame of the same size.
  const url = useSyncExternalStore(noop, () => `${window.location.origin}${path}`, () => "");
  if (!url) return <span className="lp-qr-code" style={{ width: size, height: size }} aria-hidden="true" />;
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  const count = code.getModuleCount();
  let dark = "";
  for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) if (code.isDark(row, column)) dark += `M${column} ${row}h1v1h-1z`;
  return (
    <svg className="lp-qr-code" width={size} height={size} viewBox={`-2 -2 ${count + 4} ${count + 4}`} role="img" aria-label={`QR code for ${url}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={count + 4} height={count + 4} fill="#fff" />
      <path d={dark} fill="#0e0e0f" />
    </svg>
  );
}
