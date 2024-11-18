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

import {YogaProvider} from '../common/yoga-provider';
import {Destroyable} from '../types';
import {isNullOrUndefined} from '../util/object-util';
import {z} from 'zod';

// @ts-ignore
import {Config, Edge, Node, Overflow, PositionType, Yoga} from 'yoga-layout';
import {destroyer, nullifier} from '../util/destroy-util';
import {yogaLiberator} from '../util/yoga-util';
import {CryptoUtil} from '../util/crypto-util';

export type FlexJustifyContent = 'JUSTIFY_CENTER' | 'JUSTIFY_FLEX_END' | 'JUSTIFY_FLEX_START' | 'JUSTIFY_SPACE_AROUND' | 'JUSTIFY_SPACE_BETWEEN' | 'JUSTIFY_SPACE_EVENLY';
export type FlexDirection = 'FLEX_DIRECTION_COLUMN' | 'FLEX_DIRECTION_COLUMN_REVERSE' | 'FLEX_DIRECTION_COUNT' | 'FLEX_DIRECTION_ROW' | 'FLEX_DIRECTION_ROW_REVERSE';
export type FlexEdge = 'EDGE_LEFT' | 'EDGE_TOP' | 'EDGE_RIGHT' | 'EDGE_BOTTOM' | 'EDGE_START' | 'EDGE_END' | 'EDGE_HORIZONTAL' | 'EDGE_VERTICAL' | 'EDGE_ALL';
export type FlexWrap = 'WRAP_NO_WRAP' | 'WRAP_WRAP' | 'WRAP_WRAP_REVERSE'
export type PositionType = 'POSITION_TYPE_ABSOLUTE' | 'POSITION_TYPE_RELATIVE'
export type FlexAlign = 'ALIGN_AUTO' | 'ALIGN_BASELINE' | 'ALIGN_CENTER' | 'ALIGN_FLEX_END' | 'ALIGN_FLEX_START' | 'ALIGN_SPACE_AROUND' | 'ALIGN_SPACE_BETWEEN' | 'ALIGN_STRETCH';
export type FlexOverflow = 'OVERFLOW_VISIBLE' | 'OVERFLOW_HIDDEN' | 'OVERFLOW_SCROLL'

export interface Layout {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface FlexSpacing {
  value: number;
  flexEdge: FlexEdge;
}

export class FlexSpacingBuilder {
  private _spacings: FlexSpacing[];

  public static instance(): FlexSpacingBuilder {
    return new FlexSpacingBuilder();
  }

  private constructor() {
    this._spacings = [];
  }

  topRightBottomLeft(spacings: number[]) {
    if (spacings && spacings.length > 0 && spacings.length < 5) {
      let top = spacings.length >= 1 ? spacings[0] : 0;
      let right = spacings.length >= 2 ? spacings[1] : 0;
      let bottom = spacings.length >= 3 ? spacings[2] : 0;
      let left = spacings.length >= 4 ? spacings[3] : 0;

      this.spacing(top, 'EDGE_TOP');
      this.spacing(right, 'EDGE_RIGHT');
      this.spacing(bottom, 'EDGE_BOTTOM');
      this.spacing(left, 'EDGE_LEFT');
    }
    return this;
  }

  spacing(value: number, flexEdge: FlexEdge): FlexSpacingBuilder {
    this._spacings.push({
      value: value,
      flexEdge: flexEdge
    });
    return this;
  }

  build(): FlexSpacing[] {
    return this._spacings;
  }
}

export interface FlexContentNode extends Destroyable {
  updateLayout(layout: Layout): void;
}

export interface FlexNode<T extends FlexContentNode> extends Destroyable {
  setWidth(value: number | string | 'auto'): void;

  setHeight(value: number | string | 'auto'): void;

  setHeightAndMargins(value: number | string | 'auto', margins: FlexSpacing[], refreshLayout: boolean): void;

  setDimension(width: number | string | 'auto', height: number | string | 'auto'): void;

  setPositions(positions: FlexSpacing[]): void;

  setDimensionAndPositions(width: number | string | 'auto', height: number | string | 'auto', positions: FlexSpacing[]): void;

  setMargins(margins: FlexSpacing[]): void;

  getLayout(): Layout;

  refreshLayout(): void;

  refreshLayoutFromRoot(): void;

  setParent(parent: FlexNode<any>): void;

  get name(): string;

  get parent(): FlexNode<any> | undefined;

  get yogaNode(): Yoga.YogaNode;

  get yogaConfig(): Yoga.YogaConfig;

  get contentNode(): T
}

export interface FlexNodeConfig {
  name?: string;
  flexGrow?: number;
  flexShrink?: number,
  positionType?: PositionType;
  overflow?: FlexOverflow;
  margins?: {
    value: number, flexEdge: FlexEdge
  }[];
  paddings?: {
    value: number, flexEdge: FlexEdge
  }[];
  width?: number | string | 'auto';
  height?: number | string | 'auto';
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
}

export abstract class BaseFlexNode<C extends FlexNodeConfig, T extends FlexContentNode> implements FlexNode<T> {
  protected _name!: string;
  protected _config: C;
  protected _parent?: FlexNode<any>;

  protected _contentNode: T;

  protected _yogaConfig: Config;
  protected _yogaNode: Node;

  protected constructor(config: C, contentNode: T) {
    this._config = config;
    this._yogaConfig = YogaProvider.instance().Config.create();
    this._yogaNode = YogaProvider.instance().Yoga.Node.createWithConfig(this._yogaConfig);
    this._contentNode = contentNode;
    this.processOptions();
  }

  protected processOptions() {
    this._name = this._config.name ? this._config.name : `flex-${CryptoUtil.uuid()}`;

    if (!isNullOrUndefined(this._config.flexGrow)) {
      this._yogaNode.setFlexGrow(this._config.flexGrow);
    }

    if (!isNullOrUndefined(this._config.flexShrink)) {
      this._yogaNode.setFlexShrink(this._config.flexShrink);
    }

    if (this._config.margins && this._config.margins.length > 0) {
      this.setMarginsInternal(this._config.margins);
    }

    if (this._config.paddings && this._config.paddings.length > 0) {
      this._config.paddings.forEach(padding => {
        let yogaFlexEdge: Edge = YogaProvider.instance().Yoga[padding.flexEdge];
        this._yogaNode.setPadding(yogaFlexEdge, padding.value);
      })
    }

    if (!isNullOrUndefined(this._config.width)) {
      this.setWidthInternal(this._config.width!)
    }

    if (!isNullOrUndefined(this._config.height)) {
      this.setHeightInternal(this._config.height!)
    }

    if (!isNullOrUndefined(this._config.minWidth)) {
      this.setMinWidthInternal(this._config.minWidth!)
    }

    if (!isNullOrUndefined(this._config.minHeight)) {
      this.setMinHeightInternal(this._config.minHeight!)
    }

    if (!isNullOrUndefined(this._config.maxWidth)) {
      this.setMaxWidthInternal(this._config.maxWidth!)
    }

    if (!isNullOrUndefined(this._config.maxHeight)) {
      this.setMaxHeightInternal(this._config.maxHeight!)
    }

    if (this._config.positionType) {
      let yogaPositionType: PositionType = YogaProvider.instance().Yoga[this._config.positionType];
      this._yogaNode.setPositionType(yogaPositionType);
    }

    if (this._config.overflow) {
      let yogaOverflow = YogaProvider.instance().Yoga[this._config.overflow];
      this._yogaNode.setOverflow(yogaOverflow);
    }
  }

  protected setWidthInternal(value: number | string | 'auto') {
    if (value === 'auto') {
      this._yogaNode.setWidthAuto();
    } else if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setWidthPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setWidth(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setWidth(value);
    }
  }

  protected setMaxWidthInternal(value: number | string) {
    if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setMaxWidthPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setMaxWidth(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setMaxWidth(value);
    }
  }

  protected setMinWidthInternal(value: number | string) {
    if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setMinWidthPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setMinWidth(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setMinWidth(value);
    }
  }

  protected setHeightInternal(value: number | string | 'auto') {
    if (value === 'auto') {
      this._yogaNode.setHeightAuto();
    } else if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setHeightPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setHeight(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setHeight(value);
    }
  }

  protected setMinHeightInternal(value: number | string) {
    if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setMinHeightPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setMinHeight(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setMinHeight(value);
    }
  }

  protected setMaxHeightInternal(value: number | string) {
    if (typeof value === 'string') {
      if (value.includes('%')) {
        this._yogaNode.setMaxHeightPercent(z.coerce.number().parse((value.replace('%', ''))));
      } else {
        this._yogaNode.setMaxHeight(z.coerce.number().parse(value));
      }
    } else {
      this._yogaNode.setMaxHeight(value);
    }
  }

  protected setMarginsInternal(margins: { value: number, flexEdge: FlexEdge }[]) {
    margins.forEach(margin => {
      let yogaFlexEdge: Edge = YogaProvider.instance().Yoga[margin.flexEdge];
      this._yogaNode.setMargin(yogaFlexEdge, margin.value);
    })
  }

  protected setPositionsInternal(positions: { value: number, flexEdge: FlexEdge }[]) {
    positions.forEach(position => {
      let yogaFlexEdge: Edge = YogaProvider.instance().Yoga[position.flexEdge];
      this._yogaNode.setPosition(yogaFlexEdge, position.value);
    })
  }

  refreshLayout(): void {
    this._yogaNode.calculateLayout(this._yogaNode.getComputedWidth(), this._yogaNode.getComputedHeight());
    let layout = this.getLayout();

    this._contentNode.updateLayout(layout);
  }

  refreshLayoutFromRoot(): T {
    if (this._parent) {
      this._parent.refreshLayoutFromRoot();
    } else {
      this.refreshLayout();
    }
    return this as unknown as T;
  }

  setParent(parent: FlexNode<any>) {
    this._parent = parent;
  }

  setWidth(value: number | string | 'auto') {
    this.setWidthInternal(value);
    this.refreshLayoutFromRoot();
  }

  setHeight(value: number | string | 'auto') {
    this.setHeightInternal(value);
    this.refreshLayoutFromRoot();
  }

  setHeightAndMargins(value: number | string | 'auto', margins: FlexSpacing[], refreshLayout: boolean = true) {
    this.setHeightInternal(value);
    this.setMarginsInternal(margins);
    if (refreshLayout) {
      this.refreshLayoutFromRoot();
    }
  }

  setDimension(width: number | string | 'auto', height: number | string | 'auto'): void {
    this.setWidthInternal(width);
    this.setHeightInternal(height);
    this.refreshLayoutFromRoot();
  }

  setMargins(margins: FlexSpacing[], refreshLayout: boolean = true): void {
    this.setMarginsInternal(margins);
    if (refreshLayout) {
      this.refreshLayoutFromRoot();
    }
  }

  setPositions(positions: FlexSpacing[]): void {
    this.setPositionsInternal(positions);
    this.refreshLayoutFromRoot();
  }

  setDimensionAndPositions(width: number | string | 'auto', height: number | string | 'auto', positions: FlexSpacing[]): void {
    this.setWidthInternal(width);
    this.setHeightInternal(height);
    this.setPositionsInternal(positions);
    this.refreshLayoutFromRoot();
  }

  getLayout(): Layout {
    return this._yogaNode.getComputedLayout();
  }

  destroy(): void {
    try {
      yogaLiberator(
        this._yogaNode,
        this._yogaConfig
      )

      destroyer(
        this._contentNode
      )

      nullifier(
        this._contentNode,
        this._yogaNode,
        this._yogaConfig
      )

    } catch (e) {
      console.error(e);
    }
  }

  get name(): string {
    return this._name;
  }

  get parent(): FlexNode<any> | undefined {
    return this._parent;
  }

  get yogaNode(): Yoga.YogaNode {
    return this._yogaNode;
  }

  get yogaConfig(): Yoga.YogaConfig {
    return this._yogaConfig;
  }

  get contentNode(): T {
    return this._contentNode;
  }

  get config(): C {
    return this._config;
  }
}
