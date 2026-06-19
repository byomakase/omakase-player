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

import Konva from 'konva';
import {map, Observable, of, switchMap} from 'rxjs';
import {AuthConfig, type AuthenticationData} from '../../common';
import type {ThumbnailVttCueXYWH} from '../model';
import {BlobUtil} from '../../util/blob-util';
import {errorCompleteObserver, nextCompleteObserver} from '../../util/rxjs-util';

export class ImageUtil {
  private static _spriteCache = new Map();

  static getProtectedImageUrl(url: string, authentication: AuthenticationData): Observable<string> {
    return new Observable<string>((o$) => {
      fetch(url, AuthConfig.createRequestInit(url, authentication))
        .then((res) => res.blob())
        .then((blob) => {
          nextCompleteObserver(o$, BlobUtil.createObjectURL(blob));
        })
        .catch((err) => {
          errorCompleteObserver(o$, err);
        });
    });
  }

  static createKonvaImage(url: string, authentication?: AuthenticationData): Observable<Konva.Image> {
    const imageUrl$ = authentication ? this.getProtectedImageUrl(url, authentication) : of(url);
    return imageUrl$.pipe(
      switchMap((url) => {
        return new Observable<Konva.Image>((o$) => {
          Konva.Image.fromURL(
            url,
            (image: Konva.Image) => {
              nextCompleteObserver(o$, image);
            },
            (error: any) => {
              errorCompleteObserver(o$, error);
            }
          );
        });
      })
    );
  }

  static createKonvaImageFromSprite(url: string, xywh: ThumbnailVttCueXYWH, authentication?: AuthenticationData): Observable<Konva.Image> {
    const imageUrl$ = authentication ? this.getProtectedImageUrl(url, authentication) : of(url);
    return imageUrl$.pipe(
      switchMap((url) => {
        if (this._spriteCache.has(url)) {
          const img = new Konva.Image(this._spriteCache.get(url));

          return of(this.cropSpriteImage(img, xywh));
        }

        return new Observable<Konva.Image>((o$) => {
          Konva.Image.fromURL(
            url,
            (image: Konva.Image) => {
              this._spriteCache.set(url, image.getAttrs());

              const cropImage = this.cropSpriteImage(image, xywh);

              nextCompleteObserver(o$, cropImage);
            },
            (error: any) => {
              errorCompleteObserver(o$, error);
            }
          );
        });
      })
    );
  }

  static cropSpriteImage(image: Konva.Image, xywh: ThumbnailVttCueXYWH): Konva.Image {
    return image.crop({
      x: xywh.x,
      y: xywh.y,
      width: xywh.w,
      height: xywh.h,
    });
  }

  static createKonvaImageSizedByWidth(url: string, width: number, authentication?: AuthenticationData): Observable<Konva.Image> {
    return ImageUtil.createKonvaImage(url, authentication).pipe(
      map((image) => {
        image.setAttrs({
          image: image.image(),
          width: width,
          height: ImageUtil.calculateProportionalHeight(width, image),
        });
        return image;
      })
    );
  }

  static createKonvaImageSizedByHeight(url: string, height: number, authentication?: AuthenticationData): Observable<Konva.Image> {
    return ImageUtil.createKonvaImage(url, authentication).pipe(
      map((image) => {
        image.setAttrs({
          image: image.image(),
          width: ImageUtil.calculateProportionalWidth(height, image),
          height: height,
        });
        return image;
      })
    );
  }

  static createKonvaImageFromSpriteByHeight(imageUrl: string, xywh: ThumbnailVttCueXYWH, height: number, authentication?: AuthenticationData): Observable<Konva.Image> {
    return this.createKonvaImageFromSprite(imageUrl, xywh, authentication).pipe(
      map((image) => {
        image.setAttrs({
          image: image.image(),
          width: ImageUtil.calculateProportionalWidthForSprite(height, xywh),
          height: height,
        });
        return image;
      })
    );
  }

  static createKonvaImageFromSpriteByWidth(imageUrl: string, xywh: ThumbnailVttCueXYWH, width: number, authentication?: AuthenticationData): Observable<Konva.Image> {
    return this.createKonvaImageFromSprite(imageUrl, xywh, authentication).pipe(
      map((image) => {
        image.setAttrs({
          image: image.image(),
          width: width,
          height: ImageUtil.calculateProportionalHeightForSprite(width, xywh),
        });
        return image;
      })
    );
  }

  static getHTMLImageElementSize(konvaImage: Konva.Image) {
    const src = konvaImage.image();
    if (!src) return {naturalWidth: 0, naturalHeight: 0};

    if (src instanceof HTMLImageElement) {
      return {naturalWidth: src.naturalWidth, naturalHeight: src.naturalHeight};
    }

    throw new Error('Image is not HTMLImageElement');
  }

  public static calculateProportionalHeight(width: number, image: Konva.Image): number {
    let htmlImageElementSize = this.getHTMLImageElementSize(image);
    return (width * htmlImageElementSize.naturalHeight) / htmlImageElementSize.naturalWidth;
  }

  public static calculateProportionalWidth(height: number, image: Konva.Image): number {
    let htmlImageElementSize = this.getHTMLImageElementSize(image);
    return (height * htmlImageElementSize.naturalWidth) / htmlImageElementSize.naturalHeight;
  }

  public static calculateProportionalHeightForSprite(width: number, xywh: ThumbnailVttCueXYWH): number {
    return (width * xywh.h) / xywh.w;
  }

  public static calculateProportionalWidthForSprite(height: number, xywh: ThumbnailVttCueXYWH): number {
    return (height * xywh.w) / xywh.h;
  }
}
