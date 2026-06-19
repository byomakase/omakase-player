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

declare module 'smp-imsc' {
  export type ErrorHandler = {
    info?(msg: string): boolean | void;
    warn?(msg: string): boolean | void;
    error?(msg: string): boolean | void;
    fatal?(msg: string): boolean | void;
  };

  export type TTDocument = {
    getMediaTimeEvents(): number[];
  };

  export type ISD = any;

  export type ImgResolver = (uri: string, img: HTMLImageElement) => void;

  export function fromXML(xml: string, errorHandler?: ErrorHandler, metadataHandler?: unknown): TTDocument;

  export function generateISD(tt: TTDocument, offset: number, errorHandler?: ErrorHandler): ISD;

  export function renderHTML(
    isd: ISD,
    element: HTMLElement,
    imgResolver?: ImgResolver,
    eheight?: number | null,
    ewidth?: number | null,
    displayForcedOnlyMode?: boolean,
    errorHandler?: ErrorHandler,
    previousISDState?: unknown,
    enableRollUp?: boolean
  ): void;
}
