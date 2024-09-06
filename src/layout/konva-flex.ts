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

import {BaseFlexNode, FlexContentNode, FlexNodeConfig, Layout} from './flex-node';
import Konva from 'konva';
import {BaseFlexGroup, FlexGroupConfig, FlexGroupContentNode} from './flex-group';
import {destroyer, nullifier} from '../util/destroy-util';
import {Group} from 'konva/lib/Group';
import {Shape, ShapeConfig} from 'konva/lib/Shape';

export class KonvaFlexContentNode implements FlexContentNode {
  private _konvaNode: Konva.Group | Konva.Shape;

  constructor(konvaNode: Konva.Group | Konva.Shape) {
    this._konvaNode = konvaNode;
  }

  updateLayout(layout: Layout) {
    this._konvaNode.setAttrs({
      width: layout.width,
      height: layout.height,
      x: layout.left,
      y: layout.top
    })
  }

  destroy(): void {
    destroyer(
      this._konvaNode
    )
    nullifier(
      this._konvaNode
    )
  }

  get konvaNode(): Konva.Group | Konva.Shape {
    return this._konvaNode;
  }
}

export class KonvaFlexItem<T extends KonvaFlexContentNode> extends BaseFlexNode<FlexNodeConfig, T> {
  constructor(config: FlexNodeConfig, contentNode: T) {
    super(config, contentNode);

    this.refreshLayout();
  }

  static of(config: FlexNodeConfig, konvaNode: Konva.Group | Konva.Shape): KonvaFlexItem<KonvaFlexContentNode> {
    return new KonvaFlexItem(config, new KonvaFlexContentNode(konvaNode))
  }
}

export interface KonvaFlexGroupContentNodeConfig {
  konvaNode: Konva.Group,
  konvaBgNode?: Konva.Rect,
  clip?: boolean
}

export class KonvaFlexGroupContentNode implements FlexGroupContentNode<KonvaFlexContentNode> {
  private _config: KonvaFlexGroupContentNodeConfig;
  private _konvaNode: Konva.Group;
  private _konvaBgNode?: Konva.Rect;

  constructor(config: KonvaFlexGroupContentNodeConfig) {
    this._config = config;
    this._konvaNode = config.konvaNode;

    if (config.konvaBgNode) {
      this._konvaBgNode = config.konvaBgNode;
      this._konvaBgNode.setAttrs({
        listening: false,
        perfectDrawEnabled: false,
      })
      this._konvaNode.add(this._konvaBgNode)
    }
  }

  updateLayout(layout: Layout) {
    this._konvaNode.setAttrs({
      width: layout.width,
      height: layout.height,
      x: layout.left,
      y: layout.top,
    })

    if (this._config.clip) {
      this._konvaNode.clipFunc((ctx) => {
        ctx.rect(0, 0, layout.width, layout.height)
      })
    }

    if (this._konvaBgNode) {
      this._konvaBgNode.setAttrs({
        width: layout.width,
        height: layout.height,
      })
    }

  }

  addContentChild(flexContentNode: KonvaFlexContentNode, index: number) {
    if (!this._konvaNode.findOne((p: Group | Shape<ShapeConfig>) => p === flexContentNode.konvaNode)) {
      this._konvaNode.add(flexContentNode.konvaNode);
    }
  }

  removeContentChild(flexContentNode: KonvaFlexContentNode) {
    let children = this._konvaNode.getChildren(p => p === flexContentNode.konvaNode);
    if (children && children.length === 1) {
      let child = children[0];
      child.destroy();
    }
  }

  destroy(): void {
    if (this._konvaNode) {
      this._konvaNode.destroy();
      nullifier(
        this._konvaNode
      )
    }
  }

  get konvaNode(): Konva.Group {
    return this._konvaNode;
  }

  get konvaBgNode(): Konva.Rect | undefined {
    return this._konvaBgNode;
  }
}

export interface KonvaFlexGroupConfig extends FlexGroupConfig, KonvaFlexGroupContentNodeConfig {

}

export class KonvaFlexGroup extends BaseFlexGroup<FlexGroupConfig, KonvaFlexGroupContentNode> {
  constructor(config: FlexGroupConfig, contentNode: KonvaFlexGroupContentNode) {
    super(config, contentNode);
  }

  static of(config: KonvaFlexGroupConfig): KonvaFlexGroup {
    return new KonvaFlexGroup(config, new KonvaFlexGroupContentNode(config))
  }
}
