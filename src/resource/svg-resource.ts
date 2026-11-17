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

import {BaseResourceEntity, type BaseResourceEntityArgs, type BaseResourceEntityCreateOptions, type ResourceEntity, type ResourceEntityState, ResourceEntityType} from '../entity';
import {SourceUtil, UrlSource, type UrlSourceState} from '../source';
import {from, map, Observable, of, takeUntil} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {SvgUtil} from '../util/svg-util';
import {ObserverBreaker} from '../common/observer-breaker';
import {BlobUtil} from '../util/blob/blob-util';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {isString} from '../util/util-functions';
import {UrlUtil} from '../util/url-util';
import {httpGetText} from '../http';
import {AuthConfig} from '../common';

/**
 * Serializable snapshot of a {@link SvgResource} instance.
 *
 * Extends {@link ResourceEntityState} with svg-specific fields such as source and blob.
 */
export interface SvgResourceState extends ResourceEntityState {
  source: UrlSourceState | string | undefined;
  blobUrl: string | undefined;
}

/**
 * Primary resource entity representing the svg resource.
 *
 * A `Svg` holds the svg source, load lifecycle state and
 * blob attribute used for HtmlImage elements.
 * Extends {@link ResourceEntity} with `resourceType` always set to {@link ResourceEntityType.SVG_RESOURCE}.
 */
export interface SvgResource extends ResourceEntity {
  /** Serializable state snapshot of this svg. */
  state: SvgResourceState;

  /** The data source backing this svg, if any. */
  source: UrlSource | string | undefined;

  /** Svg blob created from {@link source}, used for svg rendering across player. */
  blobUrl: string | undefined;

  /**
   * Return {@link blobUrl}. If non-existent, create a new one and return it.
   * Emits synchronously once resolved.
   */
  resolveBlobUrl(): Observable<string>;
}

/** Base create options shared by all svg resources. */
export interface BaseSvgResourceCreateOptions extends BaseResourceEntityCreateOptions {}

/**
 * Construction arguments for {@link BaseSvgResource} and its subclasses.
 */
export interface BaseSvgResourceArgs extends BaseResourceEntityArgs {
  /** Data source backing this svg. */
  source?: UrlSource | string | undefined;
  /** Data blob related to {@link source}, used for svg rendering. */
  blobUrl?: string | undefined;
}

export abstract class BaseSvgResource<S extends SvgResourceState> extends BaseResourceEntity<S> implements SvgResource, Destroyable {
  protected _source: UrlSource | string | undefined;

  protected _blobUrl: string | undefined;
  protected _blobUrlResolution$?: Observable<string>;

  protected readonly _resourceType = ResourceEntityType.SVG_RESOURCE;

  protected readonly _destroyBreaker = new ObserverBreaker();

  protected constructor(args?: BaseSvgResourceArgs) {
    super(args);

    this._source = args?.source;

    this._blobUrl = args?.blobUrl;
  }

  protected _getState(): SvgResourceState {
    return {
      ...super._getState(),
      source: this._source,
      blobUrl: this._blobUrl,
    };
  }

  resolveBlobUrl(): Observable<string> {
    if (this._blobUrl) {
      return of(this._blobUrl);
    }

    return (this._blobUrlResolution$ ??= passiveObservable((observer) => {
      if (!this.source) {
        errorCompleteObserver(observer, 'SvgResource.source not defined');
      } else {
        this._resolveBlobUrl(this.source)
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (blobUrl) => {
              this._blobUrl = blobUrl;
              nextCompleteObserver(observer, this._blobUrl);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
      }
    }));
  }

  protected _resolveBlobUrl(source: UrlSource | string): Observable<string> {
    let o$: Observable<string>;
    if (isString(source)) {
      if (UrlUtil.isUrlAbsolute(source) || UrlUtil.isDataBase64Url(source) || UrlUtil.isBlobUrl(source)) {
        o$ = from(httpGetText(source, {...AuthConfig.createRequestInit(source, AuthConfig.authentication)}));
      } else if (SvgUtil.svgRegex.test(source)) {
        o$ = of(source);
      } else {
        o$ = of(UrlUtil.decodeBase64toString(source));
      }
    } else {
      const url = SourceUtil.resolveUrlFromSourceOrFail(source);
      o$ = from(httpGetText(url, {...AuthConfig.createRequestInit(url, AuthConfig.authentication)}));
    }

    return o$.pipe(
      map((data) => {
        SvgUtil.validateSvg(data);
        return BlobUtil.createBlobURL([data], {type: 'image/svg+xml'});
      })
    );
  }

  get source(): UrlSource | string | undefined {
    return this._source;
  }

  get blobUrl(): string | undefined {
    return this._blobUrl;
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    if (this._blobUrl) {
      BlobUtil.revokeObjectURL(this._blobUrl);
      this._blobUrl = void 0;
    }
    delete this._blobUrlResolution$;
  }
}

/**
 * Serializable snapshot of a {@link DefaultSvgResource} instance.
 */
export interface DefaultSvgResourceState extends SvgResourceState {}

/** Create options for svg resources. */
export interface DefaultSvgResourceCreateOptions extends BaseSvgResourceCreateOptions {
  args?: DefaultSvgResourceArgs;
}

/**
 * Construction arguments for {@link DefaultSvgResource}.
 */
export interface DefaultSvgResourceArgs extends BaseSvgResourceArgs {}

export class DefaultSvgResource extends BaseSvgResource<DefaultSvgResourceState> {
  constructor(args?: DefaultSvgResourceArgs) {
    super(args);
  }

  protected getState(): DefaultSvgResourceState {
    return {
      ...super._getState(),
    };
  }
}
