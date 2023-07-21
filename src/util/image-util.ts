/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import Konva from "konva";
import {map, Observable, Subject} from "rxjs";

export class ImageUtil {

    static createKonvaImage(url: string): Observable<Konva.Image> {
        return new Observable<Konva.Image>(o$ => {
            Konva.Image.fromURL(url, (image) => {
                o$.next(image);
                o$.complete();
            }, (error) => {
                console.error(error)
                o$.error(error);
            });
        })
    }

    static createKonvaImageSizedByWidth(url: string, width: number): Observable<Konva.Image> {
        return ImageUtil.createKonvaImage(url).pipe(map(image => {
            image.setAttrs({
                width: width,
                height: ImageUtil.calculateProportionalHeight(width, image)
            })
            return image;
        }))
    }

    static createKonvaImageSizedByHeight(url: string, height: number): Observable<Konva.Image> {
        return ImageUtil.createKonvaImage(url).pipe(map(image => {
            image.setAttrs({
                width: ImageUtil.calculateProportionalWidth(height, image),
                height: height
            })
            return image;
        }))
    }

    public static calculateProportionalHeight(width: number, image: Konva.Image): number {
        return (width * image.getAttrs().image.naturalHeight) / image.getAttrs().image.naturalWidth;
    }

    public static calculateProportionalWidth(height: number, image: Konva.Image): number {
        return (height * image.getAttrs().image.naturalWidth) / image.getAttrs().image.naturalHeight;
    }

}