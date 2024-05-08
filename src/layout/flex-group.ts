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

import {BaseFlexNode, FlexAlign, FlexContentNode, FlexDirection, FlexJustifyContent, FlexNode, FlexNodeConfig, FlexWrap} from './flex-node';
// @ts-ignore
import {Align, Direction, Justify, Overflow, Wrap} from 'yoga-layout';
import {YogaProvider} from '../common/yoga-provider';

export interface FlexGroupConfig extends FlexNodeConfig {
  flexWrap?: FlexWrap,
  flexDirection?: FlexDirection,
  justifyContent?: FlexJustifyContent
  alignItems?: FlexAlign,
  alignContent?: FlexAlign
}

export interface FlexGroupContentNode<T extends FlexContentNode> extends FlexContentNode {
  addContentChild(flexContentNode: T, index: number): void;

  removeContentChild(flexContentNode: T): void;
}

export abstract class BaseFlexGroup<C extends FlexGroupConfig, T extends FlexGroupContentNode<any>> extends BaseFlexNode<C, T> {
  private _children: FlexNode<any>[];

  constructor(config: C, contentNode: T) {
    super(config, contentNode);

    this._children = [];

    this.refreshLayout();
  }

  protected override processOptions() {
    super.processOptions();

    if (this._config.flexWrap) {
      this.setFlexWrap(this._config.flexWrap)
    } else {
      this.setFlexWrap('WRAP_NO_WRAP')
    }

    if (this._config.flexDirection) {
      this.setFlexDirection(this._config.flexDirection)
    } else {
      this.setFlexDirection('FLEX_DIRECTION_ROW')
    }

    if (this._config.justifyContent) {
      this.setJustifyContent(this._config.justifyContent)
    } else {
      this.setJustifyContent('JUSTIFY_FLEX_START')
    }

    if (this._config.alignItems) {
      this.setAlignItems(this._config.alignItems)
    }

    if (this._config.alignContent) {
      this.setAlignContent(this._config.alignContent)
    }
  }

  addChild(flexNode: FlexNode<any>, index: number | undefined = void 0): BaseFlexGroup<C, T> {
    index = index === undefined ? this._children.length : index;

    return this.addChildInternal(flexNode, index, true);
  }

  addChildren(...flexNodes: FlexNode<any>[]): BaseFlexGroup<C, T> {
    flexNodes.forEach(flexNode => {
      this.addChildInternal(flexNode, this._children.length, false);
    })
    this.refreshLayoutFromRoot();
    return this;
  }

  addChildInternal(flexNode: FlexNode<any>, index: number, refreshLayout: boolean = true): BaseFlexGroup<C, T> {
    if (flexNode === void 0) {
      throw new Error(`Flex node is undefined`)
    }

    if (this._children.find(p => p === flexNode)) {
      throw new Error(`Flex node already added as a child`)
    }

    this._children.splice(index, 0, flexNode)
    this._yogaNode.insertChild(flexNode.yogaNode, index);

    flexNode.setParent(this);

    // important to set it to value dividable by number of children, otherwise flex no-wrap will not work ok
    this._yogaConfig.setPointScaleFactor(this._children.length);

    this._contentNode.addContentChild(flexNode.contentNode, index);

    if (refreshLayout) {
      this.refreshLayoutFromRoot();
    }

    return this;
  }

  removeChild(flexNode: FlexNode<any>) {
    if (flexNode === void 0) {
      throw new Error(`Flex node is undefined`)
    }

    let index = this._children.findIndex(p => p === flexNode);
    this._children.splice(index, 1)
    this._yogaNode.removeChild(flexNode.yogaNode);

    this._contentNode.removeContentChild(flexNode.contentNode);
    this.refreshLayoutFromRoot();

    return this;
  }

  override refreshLayout(): BaseFlexGroup<C, T> {
    this._yogaNode.calculateLayout(this._yogaNode.getComputedWidth(), this._yogaNode.getComputedHeight());
    let layout = this.getLayout();

    if (this._children.length > 0) {
      this._children.forEach(child => {
        child.refreshLayout();
      })
    }

    this._contentNode.updateLayout(layout)

    return this;
  }

  override destroy(): void {
    this._children.forEach(child => {
      child.destroy();
    })
    super.destroy();
  }

  private setJustifyContent(justifyContent: FlexJustifyContent): void {
    let yogaJustifyContent: Justify = YogaProvider.instance().Yoga[justifyContent];
    this._yogaNode.setJustifyContent(yogaJustifyContent);
  }

  private setAlignContent(alignContent: FlexAlign): void {
    let yogaAlign: Align = YogaProvider.instance().Yoga[alignContent];
    this._yogaNode.setAlignContent(yogaAlign);
  }

  private setAlignItems(alignItems: FlexAlign): void {
    let yogaAlign: Align = YogaProvider.instance().Yoga[alignItems];
    this._yogaNode.setAlignItems(yogaAlign);
  }

  private setFlexDirection(flexDirection: FlexDirection): void {
    let yogaFlexDirection: Direction = YogaProvider.instance().Yoga[flexDirection];
    this._yogaNode.setFlexDirection(yogaFlexDirection);
  }

  private setFlexWrap(flexWrap: FlexWrap): void {
    let yogaFlexWrap: Wrap = YogaProvider.instance().Yoga[flexWrap];
    this._yogaNode.setFlexWrap(yogaFlexWrap);
  }

  getChildren(): FlexNode<any>[] {
    return this._children;
  }

}
