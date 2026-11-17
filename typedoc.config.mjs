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

/**
 * Lets heading anchors include inline code.
 *
 * TypeDoc builds a heading's anchor from the heading's text tokens only, so the code in a heading such as
 * `` #### `<omakase-mute-button>` `` is left out: the anchor becomes `_`, `_-1`, ... and links like
 * `README.md#omakase-mute-button` (GitHub's anchor for that heading, used throughout docs/static) don't resolve.
 * Giving each inline code token in a heading a text child with its content makes TypeDoc count it, which yields
 * the same anchors as GitHub. Rendering is unaffected: inline code is rendered from the token's own content.
 *
 * @param {import('markdown-it').default} parser
 */
function headingCodeAnchors(parser) {
  parser.core.ruler.push('omakase_heading_code_anchors', (state) => {
    state.tokens.forEach((token, i) => {
      if (token.type !== 'heading_open') {
        return;
      }
      const inline = state.tokens[i + 1];
      inline?.children?.forEach((child) => {
        if (child.type === 'code_inline' && !child.children) {
          const text = new state.Token('text', '', 0);
          text.content = child.content;
          child.children = [text];
        }
      });
    });
  });
}

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  markdownItLoader: headingCodeAnchors,
};
