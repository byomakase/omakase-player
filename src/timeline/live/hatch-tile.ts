/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface HatchTileStyle {
  hatchStroke: string;
  hatchOpacity: number;
  hatchLineWidth: number;
  /** Tile size (px) of the repeating diagonal hatch pattern — one line per tile. */
  hatchSpacing: number;
  /** Mirrors the diagonal direction: `false` draws "/", `true` draws "\". */
  hatchMirrored: boolean;
}

/**
 * A single-diagonal tile that repeats seamlessly into a hatch pattern when used as a Konva fill
 * pattern. Shared between every spanning region overlay ({@link LiveEdgeOverlay}, {@link
 * EvictedRegionOverlay}) so they all draw the exact same hatch texture, just parameterized
 * differently (color, direction) per overlay's style.
 */
export function createHatchTile(style: HatchTileStyle): HTMLCanvasElement {
  const size = style.hatchSpacing;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  if (style.hatchMirrored) {
    // Flip horizontally so the tile draws "\" instead of "/" — everything below still tiles
    // seamlessly since the flip is applied to the whole canvas, not just the drawn path.
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.strokeStyle = style.hatchStroke;
  ctx.globalAlpha = style.hatchOpacity;
  ctx.lineWidth = style.hatchLineWidth;
  ctx.beginPath();
  // Corner-to-corner plus its wraparound twin so the tile edges line up when repeated.
  ctx.moveTo(-1, size + 1);
  ctx.lineTo(size + 1, -1);
  ctx.moveTo(size - 1, size + 1);
  ctx.lineTo(2 * size + 1, -1);
  ctx.moveTo(-size - 1, size + 1);
  ctx.lineTo(1, -1);
  ctx.stroke();

  return canvas;
}
