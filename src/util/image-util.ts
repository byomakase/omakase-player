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

import Konva from 'konva';
import axios from 'axios';
import {map, Observable, of, switchMap} from 'rxjs';
import {BlobUtil} from './blob-util';
import {AuthConfig, AuthenticationData} from '../common/authentication';
import {ThumbnailVttCueXYWH} from '../types';

export class ImageUtil {
  private static _spriteCache = new Map();

  static getProtectedImageUrl(url: string, authentication: AuthenticationData): Observable<string> {
    return new Observable<string>((o$) => {
      const axiosConfig = AuthConfig.createAxiosRequestConfig(url, authentication);
      axios
        .get(url, {...axiosConfig, responseType: 'blob'})
        .then((res) => {
          const blob = BlobUtil.createObjectURL(res.data);
          o$.next(blob);
          o$.complete();
        })
        .catch((err) => {
          o$.error(err);
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
              o$.next(image);
              o$.complete();
            },
            (error: any) => {
              o$.error(error);
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

              o$.next(cropImage);
              o$.complete();
            },
            (error: any) => {
              o$.error(error);
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
          width: width,
          height: ImageUtil.calculateProportionalHeightForSprite(width, xywh),
        });
        return image;
      })
    );
  }

  public static calculateProportionalHeight(width: number, image: Konva.Image): number {
    return (width * image.getAttrs().image.naturalHeight) / image.getAttrs().image.naturalWidth;
  }

  public static calculateProportionalWidth(height: number, image: Konva.Image): number {
    return (height * image.getAttrs().image.naturalWidth) / image.getAttrs().image.naturalHeight;
  }

  public static calculateProportionalHeightForSprite(width: number, xywh: ThumbnailVttCueXYWH): number {
    return (width * xywh.h) / xywh.w;
  }

  public static calculateProportionalWidthForSprite(height: number, xywh: ThumbnailVttCueXYWH): number {
    return (height * xywh.w) / xywh.h;
  }
}
