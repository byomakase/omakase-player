/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

export class ColorUtil {
  static randomHexColor(): string {
    return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
  }

  static inverseFillGradient(gradient: (string | number)[]) {
    return gradient.map(p => (typeof p === 'number') ? (1 - p) : p)
  }

  static hexToRgb(hex: string): { r: number, g: number, b: number } | undefined {
    // Remove the leading '#' if present
    hex = hex.replace(/^#/, '');

    let bigint = parseInt(hex, 16);
    let r, g, b;

    if (hex.length === 6) {
      r = (bigint >> 16) & 255;
      g = (bigint >> 8) & 255;
      b = bigint & 255;
    } else if (hex.length === 3) {
      r = (bigint >> 8) & 15;
      g = (bigint >> 4) & 15;
      b = bigint & 15;

      // Convert 4-bit color to 8-bit color
      r = (r << 4) | r;
      g = (g << 4) | g;
      b = (b << 4) | b;
    } else {
      return void 0; // Invalid hex color
    }

    return {r, g, b};
  }

  static getLuminance({r, g, b}: { r: number, g: number, b: number }): number {
    // Normalize the RGB values to the range [0, 1]
    const normalize = (value: number) => value / 255;
    r = normalize(r);
    g = normalize(g);
    b = normalize(b);

    // Apply gamma correction
    const gammaCorrect = (value: number) => {
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    r = gammaCorrect(r);
    g = gammaCorrect(g);
    b = gammaCorrect(b);

    // Calculate the luminance
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  static rgbToHex({r, g, b}: { r: number, g: number, b: number }): string {
    const componentToHex = (c: number) => {
      const hex = c.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
  }

  static isLightColor(hex: string): boolean {
    const rgb = ColorUtil.hexToRgb(hex);
    if (rgb) {
      const luminance = ColorUtil.getLuminance(rgb);
      // A luminance of 0.5 is used as the threshold for light/dark
      return luminance > 0.5;
    } else {
      return false;
    }
  }

  static lightenColor(hex: string, percent: number): string {
    const rgb = ColorUtil.hexToRgb(hex);

    if (rgb) {
      const adjust = (value: number, percentage: number) => {
        return percentage >= 0
          ? value + (255 - value) * (percentage / 100)
          : value * (1 + (percentage / 100));
      };

      const adjustedRgb = {
        r: Math.round(adjust(rgb.r, percent)),
        g: Math.round(adjust(rgb.g, percent)),
        b: Math.round(adjust(rgb.b, percent))
      };

      return ColorUtil.rgbToHex(adjustedRgb);

    } else {
      return hex;
    }
  }


}
