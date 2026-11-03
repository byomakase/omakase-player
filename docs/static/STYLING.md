# Styling

Omakase Player elements (including media chrome elements) can be styled with CSS/SCSS. The CSS structure is shown below.

![Omakase Player CSS structure](https://api.player.byomakase.org/static/styling-diagram.svg)

## Player

The player's dimensions can be controlled with three CSS custom properties set on the player's container element or any ancestor:

| CSS Variable                    | Description                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--omakase-player-width`        | Sets the width of the player. Accepts any valid CSS length value (e.g. `800px`, `100%`).                                                           |
| `--omakase-player-height`       | Sets the height of the player. Accepts any valid CSS length value (e.g. `450px`, `50vh`).                                                          |
| `--omakase-player-aspect-ratio` | Sets the aspect ratio of the player (e.g. `16 / 9`, `4 / 3`). When not specified, the aspect ratio is derived automatically from the loaded media. |

```css
#omakase-player {
  --omakase-player-width: 100%;
  --omakase-player-aspect-ratio: 16 / 9;
}
```

## Chroming

### Primary Colors

| CSS Variable                                    | Default                        | Description                                                                                   |
| ------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--omakase-primary-color`                       | `#009ceb`                      | Primary accent blue — active router toggle, changed-router glow, active dropdown option, thumbnail border |
| `--omakase-progress-bar-color`                  | `#009cebcc`                    | Accent blue at high opacity — time-range progress bar fill                                    |
| `--omakase-progress-bar-buffered-color`         | `rgba(0, 156, 235, 0.6)`       | Accent blue at low opacity — time-range buffered segment                                      |
| `--omakase-primary-accent-color`                | `#76d1ff`                      | Lighter accent tint — router toggle active border                                             |
| `--omakase-panel-border-color`                  | `#00476a`                      | Panel border color (omakase theme control bar, dropdown, timecode, table)                     |
| `--omakase-panel-body-background-color`         | `#002335bf`                    | Panel background (omakase theme vu-meter, control-bar-upper, dropdown, timecode-wrapper)       |
| `--omakase-panel-header-background-color`       | `#002335f0`                    | Panel background, darker variant (dropdown title, control-bar-lower)                          |
| `--omakase-panel-header-text-color`                  | `#bbb`                         | Panel header text color                                                                        |
| `--omakase-timecode-preview-background-color`   | `#005e8dcc`                    | Preview timecode background (omakase theme)                                                   |
| `--omakase-progress-bar-thumb-color`            | *(none)*                        | Time-range progress bar seek thumb/handle color                                                |
| `--omakase-volume-background-color`             | `#222222d9`                    | Volume panel background (volume action icon, omakase theme)                                    |
| `--omakase-volume-border-color`                 | `white`                         | Volume panel border (volume action icon, omakase theme)                                        |
| `--omakase-text-color`                          | `white`                         | Default text/icon/border color on dark chrome                                                  |
| `--omakase-drop-shadow`                         | `rgba(0, 0, 0, 0.7)`           | Watermark and icons drop-shadow                                                                |
| `--omakase-thumbnail-drop-shadow`               | `rgba(0, 0, 0, 0.45)`         | Thumbnail drop shadow                                                                           |
| `--omakase-timecode-edit-color`                 | `white`                         | Timecode div border color while editing                                                        |
| `--omakase-timecode-edit-invalid-color`         | `red`                           | Timecode div border color if invalid time entered                                              |

### Dropdowns

| CSS Variable                                | Default                       | Description                        |
| --------------------------------------------- | ------------------------------- | ------------------------------------- |
| `--omakase-dropdown-text-color`             | defaults to `--omakase-text-color` | Dropdown items text                |
| `--omakase-dropdown-active-background-color`| `white`                        | Active dropdown item background    |
| `--omakase-dropdown-active-text-color`      | `black`                        | Active dropdown item text          |
| `--omakase-dropdown-hover-background-color` | `rgba(0, 0, 0, 0.7)`          | Mouseover dropdown item background |
| `--omakase-dropdown-disabled-option-opacity` | `0.4`                        | Opacity of a disabled dropdown item |
| `--omakase-dropdown-max-height`             | *(computed from player height)*| Max height of an open dropdown list |
| `--omakase-dropdown-vertical-offset`        | `60px`                         | Vertical offset used when computing the dropdown's max height (varies by breakpoint) |
| `--omakase-compact-dropdown-max-height`     | `200px`                        | Max height override for the compact (audio theme) dropdown variant |
| `--omakase-dropdown-toggle-color`           | `white`                        | Border color of the radio/checkbox toggle shown next to a dropdown option |
| `--omakase-dropdown-selector-offset`        | depends on the theme: `26px` default, `28px` audio, `13px` omakase; `10px` outside the themes | Gap between a selector's toggle and its dropdown when it opens above the toggle (playback rate, audio, text and track selectors). The theme defaults change at some player sizes |
| `--omakase-dropdown-toggle-max-width`       | `120px`                        | Max width of a dropdown's toggle, including its caret, padding and border. A longer label is truncated with an ellipsis, keeping the caret shown after it. Full text is shown on mouseover. |
| `--omakase-dropdown-selector-caret-size`     | `0.6em`                        | Width of the caret shown after a selector's label with the `caret` attribute |
| `--omakase-dropdown-selector-caret-gap`      | `0.4em`                        | Gap between a selector's label and its caret |
| `--omakase-dropdown-selector-caret-color`    | `currentColor`                 | Color of a selector's caret |
| `--omakase-dropdown-selector-toggle-background-color` | `rgba(255, 255, 255, 0.1)` | Background color of a selector's toggle with the `toggle-background` attribute |
| `--omakase-dropdown-selector-toggle-border-color` | `transparent`             | Border color of a selector's toggle with the `toggle-background` attribute |
| `--omakase-dropdown-selector-toggle-border-width` | `1px`                     | Border width of a selector's toggle with the `toggle-background` attribute |
| `--omakase-dropdown-selector-toggle-border-radius` | `2px`                    | Border radius of a selector's toggle with the `toggle-background` attribute |
| `--omakase-dropdown-selector-toggle-padding` | `0 6px`                        | Padding inside a selector's toggle with the `toggle-background` attribute |

### Help Menu

| CSS Variable                                     | Default              | Description                  |
| --------------------------------------------------- | ----------------------- | ------------------------------- |
| `--omakase-help-menu-item-background-color`      | `rgba(#444, 0.9)`     | Help menu item row background |
| `--omakase-help-menu-header-background-color`    | `rgba(#222, 0.9)`     | Help menu header background   |
| `--omakase-help-menu-border-color`               | `#000`                | Help menu border              |
| `--omakase-help-menu-item-text-color`             | `#fff`                | Help menu item text           |
| `--omakase-help-menu-header-text-color`           | `#bbb`                | Help menu header text         |

### Chromed Router

| CSS Variable                              | Default        | Description                       |
| -------------------------------------------- | ---------------- | ------------------------------------ |
| `--omakase-router-header-text-color`      | `#bbb`         | Router table header text          |
| `--omakase-router-header-background-color`| `#434242e5`    | Router table header background    |
| `--omakase-router-toggle-color`           | `white`        | Router table toggle               |
| `--omakase-router-default-icon`           | *(icon)*       | Audio router icon, default state  |
| `--omakase-router-changed-icon`           | *(icon)*       | Audio router icon, changed state (also gets a glow using `--omakase-primary-color`) |
| `--omakase-router-deselect-all-icon`      | *(icon)*       | Router "deselect all" icon        |
| `--omakase-router-reset-icon`             | *(icon)*       | Router "reset" icon               |
| `--omakase-router-few-outputs-icon`       | *(icon)*       | Router icon shown when there are few outputs |
| `--omakase-router-many-outputs-icon`      | *(icon)*       | Router icon shown when there are many outputs |

### Chromed VU Meter

| CSS Variable                | Default | Description               |
| ------------------------------ | --------- | ---------------------------- |
| `--omakase-vu-meter-text-color`| `#ddd`  | Vu-meter label/scale text |

### Live Indicator

| CSS Variable                               | Default            | Description                          |
| --------------------------------------------- | --------------------- | ---------------------------------------- |
| `--omakase-live-button-live-color`         | `rgb(255, 0, 0)`   | Live indicator dot color             |
| `--omakase-live-button-dvr-color`          | `rgb(128, 128, 128)`| DVR-mode indicator dot color        |
| `--omakase-live-button-indicator-size`     | `8px`              | Size of the live/DVR indicator dot   |

### Mute Button Volume Flyout

Styles the volume range that an `omakase-mute-button` with the `volume-flyout` attribute presents while hovered, and the panel around it. Set them on the mute button or any of its ancestors. They apply both in the chroming and in a standalone control bar. The range itself can also be styled directly, and the panel through the `volume-flyout` part.

| CSS Variable                             | Default                                        | Description                                                                                                  |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--omakase-volume-flyout-length`         | `70px`                                         | Length of the volume range                                                                                   |
| `--omakase-volume-flyout-thickness`      | defaults to `--media-control-height` (`24px`)  | Thickness of the volume range: its height when horizontal, its width when vertical                           |
| `--omakase-volume-flyout-background-color`     | `transparent`; in a control bar `#222222` / `#00476a` | Background of the panel around the volume range                                                              |
| `--omakase-volume-flyout-border`         | `none`; in a control bar `1px solid #333333` / `1px solid #014e74` | Border of the panel, e.g. `1px solid white`                                                                  |
| `--omakase-volume-flyout-border-radius`  | `0`                                            | Border radius of the panel                                                                                   |
| `--omakase-volume-flyout-padding`        | `0`; in a control bar `6px`                    | Padding between the panel's border and the volume range                                                      |
| `--omakase-volume-flyout-offset`         | `0px`; in a control bar `8px`                  | Gap between the mute button and the panel. The flyout stays open while the pointer crosses it                |

```css
omakase-mute-button[volume-flyout='up'] {
  --omakase-volume-flyout-offset: 12px;
  --omakase-volume-flyout-length: 90px;
  --omakase-volume-flyout-background-color: rgba(20, 20, 30, 0.9);
  --omakase-volume-flyout-border: 1px solid rgba(255, 255, 255, 0.25);
  --omakase-volume-flyout-border-radius: 4px;
  --omakase-volume-flyout-padding: 10px 6px;
}
```

### Sizing

| CSS Variable                                      | Default | Description                                                                       |
| ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `--omakase-action-icon-base-size-stamp-theme`     | `24px`  | Icon size override for stamp theme (fullscreen, mute button)                     |
| `--omakase-action-icon-base-size-omakase-theme`   | `32px`  | Icon size override for omakase theme (top-right buttons, audio toggle)           |
| `--omakase-panel-border-radius-omakase-theme`            | `1px`   | Panel radius, omakase theme (control-bar-upper/lower, dropdown, timecode-wrapper) |
| `--omakase-panel-border-radius-default-theme`            | `3px`   | Popup/badge radius, default theme (help-menu, router thead, vu-meter-floating)   |
| `--omakase-panel-border-radius-audio-theme`              | `5px`   | Container/compact radius, audio theme                                             |
| `--omakase-playback-icon-base-size`               | `128px` | Overlay playback icon base size                                                   |
| `--omakase-thumbnail-base-size`                   | `180px` | Preview thumbnail box size                                                        |

### Positioning

| CSS Variable                                   | Default | Description                              |
| --------------------------------------------------- | --------- | ------------------------------------------- |
| `--omakase-section-offset-default-theme`       | `2.5%`  | Top-left/top-right corner inset, default theme |
| `--omakase-section-offset-omakase-theme`       | `20px`  | Top-left/top-right corner inset, omakase theme |
| `--omakase-section-offset-stamp-theme`         | `10px`  | Top-right corner inset, stamp theme       |

### Typography

| CSS Variable                     | Default          | Description                          |
| ------------------------------------ | ------------------ | --------------------------------------- |
| `--omakase-dropdown-font-family` | `'Lato'`         | Font used in dropdowns               |
| `--omakase-vu-meter-font-family` | `'Lato'`         | Font used for VU meter scale and labels |
| `--omakase-router-font-family`   | `'Lato'`         | Font used for Audio router text      |
| `--omakase-timecode-font-family` | `'Nunito Sans'`  | Font used for timecode/BITC          |
| `--omakase-watermark-font-family`| `'Nunito Sans'`  | Font used for the watermark          |

### Icons

Every control, overlay and background icon is a CSS custom property holding a `url(...)` value, applied via `background-image: var(--omakase-*-icon, url(...))`. Overriding one of these replaces the icon everywhere it's used; the built-in default artwork differs slightly between the omakase, stamp and audio themes.

**Playback & overlay**

| CSS Variable                     | Description                              |
| ------------------------------------ | -------------------------------------------- |
| `--omakase-play-icon`             | Control bar play icon                    |
| `--omakase-pause-icon`            | Control bar pause icon                   |
| `--omakase-frame-backwards-icon`  | Step back one frame icon                 |
| `--omakase-ten-frames-backwards-icon` | Step back ten frames icon           |
| `--omakase-frame-forward-icon`    | Step forward one frame icon              |
| `--omakase-ten-frames-forward-icon` | Step forward ten frames icon          |
| `--omakase-overlay-play-icon`     | Center overlay play icon                 |
| `--omakase-overlay-pause-icon`    | Center overlay pause icon                |
| `--omakase-overlay-replay-icon`   | Center overlay replay icon               |
| `--omakase-overlay-loading-icon`  | Center overlay loading spinner icon      |
| `--omakase-overlay-error-icon`    | Center overlay error icon                |
| `--omakase-overlay-attach-icon`   | Center overlay attach icon               |

**Transport & navigation**

Used by the standalone control bar's `<omakase-rewind-and-play-button>`, `<omakase-play-and-rewind-button>`, `<omakase-home-button>`, `<omakase-end-button>` and `<omakase-keyframe-button>` components.

| CSS Variable                      | Description                       |
| -------------------------------------- | --------------------------------------- |
| `--omakase-rewind-and-play-icon`  | Rewind-and-play button icon        |
| `--omakase-play-and-rewind-icon`  | Play-and-rewind button icon        |
| `--omakase-home-icon`             | Home (go to start) button icon     |
| `--omakase-end-icon`              | End (go to end) button icon        |
| `--omakase-keyframe-icon`         | Keyframe button icon               |

**Segmentation**

Used by the standalone control bar's `<omakase-playhead-to-marker-start-button>`, `<omakase-playhead-to-marker-end-button>`, `<omakase-create-marker-button>`, `<omakase-delete-marker-button>`, `<omakase-next-marker-button>`, `<omakase-previous-marker-button>`, `<omakase-loop-on-marker-button>`, `<omakase-split-marker-button>`, `<omakase-mark-in-button>` and `<omakase-mark-out-button>` components.

| CSS Variable                              | Description                       |
| ---------------------------------------------- | --------------------------------------- |
| `--omakase-playhead-to-marker-start-icon` | Playhead-to-marker-start button icon    |
| `--omakase-playhead-to-marker-end-icon`   | Playhead-to-marker-end button icon      |
| `--omakase-create-marker-icon`            | Create-marker button icon               |
| `--omakase-delete-marker-icon`            | Delete-marker button icon               |
| `--omakase-next-marker-icon`              | Next-marker button icon                 |
| `--omakase-previous-marker-icon`          | Previous-marker button icon             |
| `--omakase-loop-on-marker-icon`           | Loop-on-marker button icon              |
| `--omakase-split-marker-icon`             | Split-marker button icon                |
| `--omakase-mark-in-icon`                  | Mark-in button icon                     |
| `--omakase-mark-out-icon`                 | Mark-out button icon                    |

**Fullscreen & attach**

| CSS Variable                       | Description               |
| -------------------------------------- | ----------------------------- |
| `--omakase-fullscreen-enter-icon`  | Enter fullscreen icon     |
| `--omakase-fullscreen-exit-icon`   | Exit fullscreen icon      |
| `--omakase-detach-icon`            | Detach/undock icon        |
| `--omakase-attach-icon`            | Attach/dock icon          |

**Volume**

| CSS Variable                | Description           |
| ------------------------------- | ------------------------- |
| `--omakase-mute-icon`        | Mute icon              |
| `--omakase-volume-low-icon`  | Low volume icon        |
| `--omakase-volume-medium-icon`| Medium volume icon    |
| `--omakase-volume-high-icon` | High volume icon       |
| `--omakase-audio-toggle-on-icon` | Audio toggle icon, on |
| `--omakase-audio-toggle-off-icon` | Audio toggle icon, off |
| `--omakase-audio-toggle-on-slider-icon` | Audio toggle icon, on (slider variant) |
| `--omakase-audio-toggle-off-slider-icon` | Audio toggle icon, off (slider variant) |

**Audio router**

| CSS Variable                          | Description                          |
| ------------------------------------------ | ----------------------------------------- |
| `--omakase-audio-track-selector-icon`   | Audio track selector icon              |
| `--omakase-audio-track-selector-active-icon` | Audio track selector icon, active |
| `--omakase-audio-track-selector-disabled-icon` | Audio track selector icon, disabled |
| `--omakase-audio-text-track-selector-icon` | Text/audio track selector icon      |
| `--omakase-audio-text-track-selector-active-icon` | Text/audio track selector icon, active |
| `--omakase-track-selector-icon`         | Track selector icon                    |
| `--omakase-dropdown-back-icon`          | Dropdown "back" icon                   |

**Captions**

| CSS Variable                            | Description                        |
| -------------------------------------------- | --------------------------------------- |
| `--omakase-captions-on-icon`             | Captions-on icon                    |
| `--omakase-captions-on-disabled-icon`    | Captions-on icon, disabled state (player chroming only; in a control bar the toggle is dimmed instead) |
| `--omakase-captions-off-icon`            | Captions-off icon                   |
| `--omakase-captions-off-disabled-icon`   | Captions-off icon, disabled state (player chroming only; in a control bar the toggle is dimmed instead) |

**VU meter toggle**

| CSS Variable                                    | Description                                  |
| ---------------------------------------------------- | ------------------------------------------------- |
| `--omakase-vu-meter-floating-active-icon`       | Floating VU meter toggle icon, active state    |
| `--omakase-vu-meter-control-bar-active-icon`    | Control-bar VU meter toggle icon, active state |
| `--omakase-vu-meter-inactive-icon`              | VU meter toggle icon, inactive state           |

**Other controls**

| CSS Variable                          | Description                                       |
| ------------------------------------------ | ------------------------------------------------------ |
| `--omakase-help-icon`                  | Help button icon                                     |
| `--omakase-close-icon`                 | Close icon                                            |
| `--omakase-settings-icon`              | Settings icon                                         |
| `--omakase-bitc-enabled-icon`          | Burnt-in timecode toggle icon, enabled                |
| `--omakase-bitc-disabled-icon`         | Burnt-in timecode toggle icon, disabled               |
| `--omakase-safe-zone-on-icon`          | Safe zone toggle icon, safe zones shown               |
| `--omakase-safe-zone-off-icon`         | Safe zone toggle icon, safe zones hidden              |
| `--omakase-control-bar-enabled-icon`   | Control bar visibility icon, enabled                  |
| `--omakase-control-bar-disabled-icon`  | Control bar visibility icon, disabled                 |
| `--omakase-control-bar-always-on-icon` | Control bar visibility icon, always-on                |

**Backgrounds**

| CSS Variable                    | Description                                     |
| ------------------------------------ | ---------------------------------------------------- |
| `--omakase-background-small`     | Background image shown on a narrow player          |
| `--omakase-background-large`      | Background image shown on a wide player            |
| `--omakase-background-logo`       | Background logo image, shown on a wide player      |
| `--omakase-background-audio`      | Background image, audio theme                      |

## Control Bar

A standalone control bar (`media-control-bar` together with `omakase-control-bar-row` and `omakase-control-bar-group`) exposes the following CSS variables for visual customization. Set them on the `media-control-bar` element or any of its ancestors.

The control bar's `theme` config option (`ControlBarTheme.DEFAULT` or `ControlBarTheme.OMAKASE`) selects the colors and icons of the matching chroming theme. Where a default below differs per theme, it is given as default theme / omakase theme. Icons can be overridden with the same `--omakase-*-icon` variables as the chroming (see [Icons](#icons)), and theme colors fall back to the shared chroming variables such as `--omakase-panel-body-background-color`, `--omakase-panel-border-color`, `--omakase-text-color` and `--omakase-progress-bar-color`.

The dropdowns of the playback rate, audio, text and track selectors and of the menu also follow the theme: with `ControlBarTheme.OMAKASE` they are styled like the omakase chroming theme's dropdowns, using `--omakase-panel-body-background-color`, `--omakase-panel-header-background-color`, `--omakase-panel-border-color` and `--omakase-panel-border-radius-omakase-theme`.

**Control bar**

| CSS Variable                              | Default                | Description                                                                                     |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `--omakase-control-bar-background-color`  | `#000` / `#002335f0` | Background color of the control bar                                                 |
| `--omakase-control-bar-border-color`      | `transparent` / `#00476a` | Border color of the control bar                                                              |
| `--omakase-control-bar-border-width`      | `0` / `1px`            | Border width of the control bar. Set it to a non-zero value to make the border color visible    |
| `--omakase-control-bar-border-radius`     | `0`                    | Border radius of the control bar                                                                |
| `--omakase-control-bar-padding`           | `0 10px`               | Padding inside the control bar                                                                  |
| `--omakase-control-bar-gap`               | `5px`                  | Gap between controls in the control bar, in rows and in row sections (left, center, right)      |
| `--omakase-control-bar-icon-size`         | `22px`                 | Size of the play, mute and fullscreen buttons; also the minimum height of time displays         |
| `--omakase-control-bar-text-color`        | `white`                | Text color of time displays                                                                     |
| `--omakase-control-bar-popup-z-index`     | `1000`                 | z-index of the control bar's popups (time range preview, volume flyout, dropdowns and color selector flyout) |
| `--omakase-control-disabled-opacity`      | `0.5`                  | Opacity of every disabled or inactive control: a component disabled through the [component API](./control-bar/README.md#enabling-disabling-showing-and-hiding-components), an inactive segmentation component or capability toggle, a captions toggle without an active text track, a live button while no live media is loaded, a disabled selector and the icon of a disabled menu |

**Control bar rows**

| CSS Variable                               | Default | Description                                              |
| ------------------------------------------ | ------- | --------------------------------------------------------- |
| `--omakase-control-bar-row-padding-bottom` | `8px`   | Space below a row, separating it from the row that follows |

**Control bar groups**

| CSS Variable                                    | Default                                   | Description                                                                                  |
| ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `--omakase-control-bar-group-background-color`  | `#222222` / `#00476a`                     | Background color of a control bar group                                                      |
| `--omakase-control-bar-group-border-color`      | `#333333` / `#014e74`                     | Border color of a control bar group                                                          |
| `--omakase-control-bar-group-border-width`      | `1px`                                     | Border width of a control bar group                                                          |
| `--omakase-control-bar-group-border-radius`     | `2px`                                     | Border radius of a control bar group                                                         |
| `--omakase-control-bar-group-padding`           | `4px 6px`                                 | Padding inside a control bar group                                                           |
| `--omakase-control-bar-group-gap`               | defaults to `--omakase-control-bar-gap`   | Gap between controls inside a control bar group                                              |

**Control bar labels**

| CSS Variable                                | Default                                          | Description                           |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `--omakase-control-bar-label-font-family`   | defaults to `--omakase-dropdown-font-family`     | Font of `omakase-control-bar-label`   |
| `--omakase-control-bar-label-font-size`     | 75% of `--omakase-control-bar-icon-size`         | Font size of `omakase-control-bar-label` |
| `--omakase-control-bar-label-font-weight`   | `normal`                                         | Font weight of `omakase-control-bar-label` |

Labels have the height of the control bar icons, and use `--omakase-text-color` for their text, like the dropdown toggles.

**Menu**

Used by `<omakase-menu>` (see the [control bar docs](./control-bar/README.md#menu)). Its options use the [dropdown](#dropdowns) variables.

| CSS Variable                        | Default                                                      | Description                                  |
| ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| `--omakase-menu-icon`               | `media-chrome-menu.svg` / `omakase-menu.svg`                 | Icon that opens the menu                     |

**Marker bars**

Marker bars in a control bar show the playhead position with a vertical line.

| CSS Variable                        | Default | Description                         |
| ----------------------------------- | ------- | ----------------------------------- |
| `--omakase-marker-bar-playhead-color` | `white` | Color of the playhead line          |
| `--omakase-marker-bar-playhead-width` | `1px`   | Width of the playhead line          |

**Playback rate selector**

| CSS Variable                             | Default | Description |
| ---------------------------------------- | ------- | ----------- |
| `--omakase-playback-rate-selector-width` | `2.5em`   | Width of the label in an `<omakase-playback-rate-selector>`'s toggle, in which the selected rate is centered. The default fits the longest default rate, `0.25x`. The caret and the padding of a `toggle-background` toggle are added to it, and a longer rate is truncated |

Mute buttons with a volume flyout are styled with the `--omakase-volume-flyout-*` variables (see [Mute Button Volume Flyout](#mute-button-volume-flyout)). In a control bar, the flyout's panel has a theme background and an offset by default.

An `omakase-time-range` takes all the horizontal space available to it in the control bar, whether it's placed directly in the control bar or in a row section. Give it an explicit `width` or `flex` to size it otherwise.

Preview thumbnails in the control bar use `--omakase-thumbnail-base-size` (default theme; `140px` in the omakase theme), `--omakase-thumbnail-drop-shadow` and `--omakase-primary-color` (omakase theme border), like the chroming's.

Time displays in the control bar also use the shared chroming variables `--omakase-timecode-font-family` and `--omakase-timecode-edit-invalid-color` (see [Chroming](#chroming)). An `editable` time display is edited in place, as in the audio chroming theme: the input has the display's font and color and no background, border or padding of its own, and an invalid time is shown in `--omakase-timecode-edit-invalid-color`.

**Mark in / mark out**

Used by `<omakase-mark-in-button>` / `<omakase-mark-out-button>`'s `icon-time` and `label-time` representations (see the [control bar docs](./control-bar/README.md#omakase-segmentation-components)). The time display is always as wide as a timecode, so the button keeps its size whether a time or the empty placeholder is shown.

| CSS Variable                        | Default | Description                                         |
| ------------------------------------ | ------- | ---------------------------------------------------- |
| `--omakase-mark-label-font-size`     | `0.75em`| Font size of the label and the time display (kept in sync so they line up) |
| `--omakase-mark-label-font-weight`   | `normal`| Font weight of the `label-time` representation's label |
| `--omakase-mark-label-letter-spacing`| `0.03em`| Letter spacing of the `label-time` representation's label |
| `--omakase-mark-display-gap`         | `6px`   | Space between the time display's text and its shared edge with the icon/label (applied as left padding, so their backgrounds/borders stay connected rather than leaving a gap) |
| `--omakase-mark-display-font-family` | `'Lato'` | Font of the time display (falls back to `'Consolas', monospace`) |
| `--omakase-mark-padding`             | `0`     | Padding inside the trigger region (icon or label) and the time display - set this when styling either as a standalone chip, e.g. after moving the button out of an `omakase-control-bar-group` |
| `--omakase-mark-label-color`         | `inherit` | Text/icon color of the trigger region (the icon in `icon`/`icon-time`, the label in `label-time`) |
| `--omakase-mark-label-background-color` | `transparent` | Background color of the trigger region |
| `--omakase-mark-label-border-width`  | `0`     | Border width of the trigger region. Set it to a non-zero value to make the border color visible |
| `--omakase-mark-label-border-color`  | `transparent` | Border color of the trigger region |
| `--omakase-mark-label-border-radius` | `0`     | Border radius of the trigger region. Accepts any `border-radius` value, including per-corner shorthand (e.g. `2px 0 0 2px` to round only the left side) |
| `--omakase-mark-display-text-color`       | `inherit` | Text color of the time display |
| `--omakase-mark-display-background-color` | `transparent` | Background color of the time display |
| `--omakase-mark-display-border-width` | `0`    | Border width of the time display. Set it to a non-zero value to make the border color visible |
| `--omakase-mark-display-border-color` | `transparent` | Border color of the time display |
| `--omakase-mark-display-border-radius` | `0`   | Border radius of the time display. Accepts any `border-radius` value, including per-corner shorthand |

```css
media-control-bar {
  --omakase-control-bar-background-color: #002335bf;
  --omakase-control-bar-border-color: #00476a;
  --omakase-control-bar-border-width: 1px;
  --omakase-control-bar-border-radius: 4px;
}
```

**Color selector**

Used by `<omakase-color-selector-button>` (see the [control bar docs](./control-bar/README.md#omakase-segmentation-components)).

| CSS Variable                                      | Default                      | Description                                                              |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `--omakase-color-selector-swatch-size`             | `18px`                        | Width/height of the current-color swatch                                  |
| `--omakase-color-selector-swatch-border-radius`    | `4px`                         | Border radius of the current-color swatch                                 |
| `--omakase-color-selector-swatch-border-width`     | `1px`                         | Border width of the current-color swatch                                  |
| `--omakase-color-selector-swatch-border-color`     | `rgba(255, 255, 255, 0.3)`    | Border color of the current-color swatch                                  |
| `--omakase-color-selector-flyout-offset`           | `8px`                         | Gap between the button and the fly-out                                    |
| `--omakase-color-selector-group-offset`            | `4px`                         | When the button is directly inside an `omakase-control-bar-group` and its fly-out opens `left`/`right`, offsets the fly-out's top to align with the group's rather than just the button's - keep this in sync with the vertical component of `--omakase-control-bar-group-padding` if that's customized |
| `--omakase-color-selector-flyout-background-color` | `rgba(51, 51, 51, 0.9)` / `#002335bf` | Background color of the fly-out (falls back to `--omakase-panel-body-background-color`; the default theme's value matches the chroming dropdowns) |
| `--omakase-color-selector-flyout-border-width`     | `0` / `1px`                   | Border width of the fly-out                                               |
| `--omakase-color-selector-flyout-border-color`     | `transparent` / `#00476a`     | Border color of the fly-out (falls back to `--omakase-panel-border-color`) |
| `--omakase-color-selector-flyout-border-radius`    | `0`                           | Border radius of the fly-out                                              |
| `--omakase-color-selector-flyout-padding`          | `6px`                         | Padding inside the fly-out                                                |
| `--omakase-color-selector-grid-gap`                | `4px`                         | Gap between swatches in the fly-out's color matrix                        |
| `--omakase-color-selector-option-size`             | `18px`                        | Width/height of each swatch in the fly-out's color matrix                 |
| `--omakase-color-selector-option-border-radius`    | `4px`                         | Border radius of each swatch in the fly-out's color matrix                |
| `--omakase-color-selector-option-border-width`     | `1px`                         | Border width of each swatch in the fly-out's color matrix                 |
| `--omakase-color-selector-option-border-color`     | `rgba(255, 255, 255, 0.2)`    | Border color of each swatch in the fly-out's color matrix                 |
| `--omakase-color-selector-active-border-color`     | `white`                       | Border color of the fly-out's currently selected/active swatch            |
| `--omakase-color-selector-active-border-width`     | `2px`                         | Border width of the fly-out's currently selected/active swatch            |

The fly-out's direction (`up` / `down` / `left` / `right`) is set via the `flyout` attribute (or the `flyoutDirection` property), defaulting to `down`.

## VU Meter

The VU Meter component exposes the following CSS variables for visual customization:

| CSS Variable                                   | Default       | Description                                                                                        |
| ----------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| `--omakase-vu-meter-font-size`                 | `12px`        | Font size for channel labels and scale text                                                        |
| `--omakase-vu-meter-padding`                   | `5px`         | Padding around the entire VU meter component                                                       |
| `--omakase-vu-meter-background-color`          | `transparent` | Background color of the entire VU meter component                                                  |
| `--omakase-vu-meter-label-background-color`    | `transparent` | Background color of the area behind channel labels                                                 |
| `--omakase-vu-meter-label-text-color`               | `#333`        | Text color of the channel labels                                                                   |
| `--omakase-vu-meter-label-gap`                 | `5px`         | Gap between each channel label and its level bar                                                   |
| `--omakase-vu-meter-label-width`               | `20px`        | Width of the channel label area (horizontal orientation only)                                      |
| `--omakase-vu-meter-label-height`              | `20px`        | Height of the channel label area (vertical orientation only)                                       |
| `--omakase-vu-meter-bar-size`                  | `16px`        | Bar width in vertical orientation; bar height in horizontal orientation                            |
| `--omakase-vu-meter-bar-gap`                   | `5px`         | Gap between adjacent channel bars                                                                  |
| `--omakase-vu-meter-bars-padding`              | `0px`         | Padding around the bar area                                                                        |
| `--omakase-vu-meter-scale-color`               | `#333`        | Color of scale tick marks and label text                                                           |
| `--omakase-vu-meter-scale-danger-color`        | `red`         | Color of +6, +9 and +12 marks in NORDIC scale                                                      |
| `--omakase-vu-meter-scale-background-color`    | `transparent` | Background color of the scale area                                                                 |
| `--omakase-vu-meter-scale-padding`             | `0px`         | Padding inside the scale container                                                                 |
| `--omakase-vu-meter-scale-size`                | `16px`        | Width of the tick column in vertical orientation; height of the tick row in horizontal orientation |
| `--omakase-vu-meter-scale-gap`                 | `4px`         | Gap between the scale label column and the scale tick column                                       |
| `--omakase-vu-meter-scale-margin`              | `5px`         | Margin between the scale and the bar area                                                          |
| `--omakase-vu-meter-scale-thickness`           | `1px`         | Thickness of main scale division tick marks                                                        |
| `--omakase-vu-meter-scale-subdivision-opacity` | `0.7`         | Opacity of subdivision tick marks                                                                  |
| `--omakase-vu-meter-scale-label-width`         | `20px`        | Width of the scale label column (vertical orientation only)                                        |
| `--omakase-vu-meter-transition`                | `0.2s`        | Duration of bar fill and clip-path transition animations                                           |

## Audio Router

The Audio Router component exposes the following CSS variables for visual customization:

**Colors & layout**

| CSS Variable                                       | Default       | Description                                                    |
| --------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `--omakase-audio-router-font-size`                 | `12px`        | Base font size, used when no `size-*` class is present          |
| `--omakase-audio-router-font-weight`               | `400`         | Font weight of the router text                                 |
| `--omakase-audio-router-border-color`              | `#c2e9ff`     | Color of the container border and the table body's top border  |
| `--omakase-audio-router-border-radius`             | `3px`         | Corner radius of the container                                 |
| `--omakase-audio-router-background-color`          | `#e9f7ff`     | Background color of the container                               |
| `--omakase-audio-router-row-padding`               | `10px`        | Top/bottom padding of the first/last table row                 |
| `--omakase-audio-router-cell-padding`              | `5px`         | Default padding of header and data cells                       |
| `--omakase-audio-router-first-cell-padding-left`   | `10px`        | Left padding of the first cell in each row                     |
| `--omakase-audio-router-first-cell-min-width`      | `80px`        | Minimum width of the first cell in each row                    |
| `--omakase-audio-router-last-cell-padding-right`   | `10px`        | Right padding of the last cell in each row                     |
| `--omakase-audio-router-label-max-width`           | `200px`       | Max width of a router visualization label before it truncates  |
| `--omakase-audio-router-actions-column-width`      | `60px`        | Width of the last header column (row actions)                  |
| `--omakase-audio-router-disabled-opacity`          | `0.4`         | Opacity of a disabled toggle                                   |
| `--omakase-audio-router-toggle-inner-offset`       | `4px`         | Offset of the toggle's inner dot from the toggle's edge         |
| `--omakase-audio-router-icon-size`                 | `20px`        | Width/height of action icons                                   |
| `--omakase-audio-router-icon-gap`                  | `5px`         | Right margin of the deselect-all and deselect icons             |

**Sizes**

The container's size is set via a `size-small`, `size-medium` or `size-large` class.

| CSS Variable                                         | Default    | Description                                    |
| ------------------------------------------------------- | ------------ | ------------------------------------------------- |
| `--omakase-audio-router-font-size-small`             | `11px`     | Font size, small size                          |
| `--omakase-audio-router-cell-padding-small`          | `0 5px`    | Data cell padding, small size                  |
| `--omakase-audio-router-toggle-size-small`           | `14px`     | Toggle width/height, small size                |
| `--omakase-audio-router-toggle-inner-size-small`     | `6px`      | Toggle inner dot width/height, small size      |
| `--omakase-audio-router-font-size-medium`            | `12px`     | Font size, medium size                         |
| `--omakase-audio-router-cell-padding-medium`         | `2px 7px`  | Data cell padding, medium size                 |
| `--omakase-audio-router-toggle-size-medium`          | `16px`     | Toggle width/height, medium size (also the default toggle size) |
| `--omakase-audio-router-toggle-inner-size-medium`    | `8px`      | Toggle inner dot width/height, medium size (also the default)  |
| `--omakase-audio-router-font-size-large`             | `13px`     | Font size, large size                          |
| `--omakase-audio-router-cell-padding-large`          | `5px 9px`  | Data cell padding, large size                  |
| `--omakase-audio-router-row-padding-large`           | `20px`     | Top/bottom padding of the first/last row, large size |
| `--omakase-audio-router-header-padding-top-large`    | `15px`     | Top padding of header cells, large size        |
| `--omakase-audio-router-header-padding-bottom-large` | `10px`     | Bottom padding of header cells, large size     |
| `--omakase-audio-router-toggle-size-large`           | `20px`     | Toggle width/height, large size                |
| `--omakase-audio-router-toggle-inner-size-large`     | `12px`     | Toggle inner dot width/height, large size      |

**Icons**

| CSS Variable                                     | Description               |
| ---------------------------------------------------- | ------------------------------ |
| `--omakase-audio-router-deselect-all-icon`       | Deselect-all icon         |
| `--omakase-audio-router-reset-all-icon`          | Reset-all icon             |
| `--omakase-audio-router-deselect-icon`           | Deselect icon              |
| `--omakase-audio-router-reset-icon`              | Reset icon                 |
| `--omakase-audio-router-few-outputs-icon`        | "Few outputs" icon         |
| `--omakase-audio-router-many-outputs-icon`       | "Many outputs" icon        |

## Marker List

The Marker List component exposes the following CSS variables for visual customization:

**Colors, borders & typography**

| CSS Variable                                          | Default                    | Description                                                          |
| ---------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `--omakase-marker-list-font-family`                    | `'Lato'`                    | Font family used throughout the list                                |
| `--omakase-marker-list-font-size`                      | `14px`                      | Base font size                                                       |
| `--omakase-marker-list-text-color`                     | `black`                     | Default text color; fallback for the header, name and icon colors    |
| `--omakase-marker-list-border-width`                   | `1px`                       | Width of the border between rows                                    |
| `--omakase-marker-list-border-color`                   | `black`                     | Color of the border between rows                                     |
| `--omakase-marker-list-border-radius`                  | `0px`                       | Corner radius of the list (first and last row outer corners)         |
| `--omakase-marker-list-outer-border-width`             | `1px` (`0px` on the header row) | Width of a row's outer left/right/top/bottom border              |
| `--omakase-marker-list-outer-border-color`             | `black`                     | Color of a row's outer left/right/top/bottom border                  |
| `--omakase-marker-list-row-background-color`           | `transparent`               | Background color of a row                                            |
| `--omakase-marker-list-active-row-background-color`    | `rgba(0, 0, 0, 0.2)`        | Background color of the active/selected row                          |
| `--omakase-marker-list-drag-ghost-background-color`    | `#ccc`                      | Background color of the placeholder shown while dragging a row       |
| `--omakase-marker-list-header-color`                   | text color                  | Text color of header cells                                           |
| `--omakase-marker-list-header-font-weight`             | `normal`                    | Font weight of header cells                                          |
| `--omakase-marker-list-name-color`                     | text color                  | Text color of the name cell                                          |
| `--omakase-marker-list-name-font-weight`               | `normal`                    | Font weight of the name cell                                         |
| `--omakase-marker-list-icon-color`                     | text color                  | Color of the remove icon                                             |

**Sizing**

| CSS Variable                                              | Default | Description                                                       |
| -------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| `--omakase-marker-list-row-height`                          | `60px`  | Height of each row, and line-height of the empty-state row        |
| `--omakase-marker-list-icon-size`                           | `18px`  | Width/height of the remove icon                                   |
| `--omakase-marker-list-time-edit-input-width-offset`        | `10px`  | Amount added to the timecode input's width beyond 100% of its cell |
| `--omakase-marker-list-color-cell-width`                    | `10px`  | Width of the color indicator cell                                 |
| `--omakase-marker-list-thumbnail-cell-width`                | `120px` | Width of the thumbnail cell                                       |
| `--omakase-marker-list-cell-gap`                            | `5px`  | Minimum gap before each cell after the thumbnail (name, in, out, duration, actions) |
| `--omakase-marker-list-name-cell-min-width`                 | `100px` | Minimum width of the name cell before columns start to collapse   |
| `--omakase-marker-list-start-cell-width`                    | `120px` | Width of the start/in timecode cell                               |
| `--omakase-marker-list-end-cell-width`                      | `120px` | Width of the end/out timecode cell                                |
| `--omakase-marker-list-duration-cell-width`                 | `120px` | Width of the duration cell                                        |
| `--omakase-marker-list-action-cell-width`                   | `60px`  | Width of the row actions (remove) cell                             |

## Timeline

The Timeline overlay (timecode edit box and live button) exposes the following CSS variables for visual customization:

| CSS Variable                                              | Default       | Description                                                |
| ------------------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| `--omakase-timeline-overlay-z-index`                       | `100`         | Stacking order of the timeline overlay                    |
| `--omakase-timeline-timecode-offset-left`                  | `10px`        | Left offset of the timecode edit box                       |
| `--omakase-timeline-timecode-offset-top`                   | `10px`        | Top offset of the timecode edit box                        |
| `--omakase-timeline-time-edit-font-size`                   | `10pt`        | Font size of the timecode edit input                       |
| `--omakase-timeline-time-edit-height`                      | `15px`        | Height of the timecode edit input                          |
| `--omakase-timeline-time-edit-input-padding`               | `0 5px`       | Padding of the timecode edit input                         |
| `--omakase-timeline-time-edit-input-width`                 | `100px`       | Width of the timecode edit input                           |
| `--omakase-timeline-time-edit-input-border-radius`         | `5px`         | Corner radius of the timecode edit input                   |
| `--omakase-timeline-time-edit-input-border-color`          | `#5db7e8`     | Border color of the timecode edit input                    |
| `--omakase-timeline-time-edit-input-disabled-background`   | `#ccc`        | Background color of the timecode edit input when disabled  |
| `--omakase-timeline-time-edit-input-invalid-border-color`  | `#fa6664`     | Border color of the timecode edit input when invalid        |
| `--omakase-timeline-live-button-offset-left`                | `10px`        | Left offset of the live button                             |
| `--omakase-timeline-live-button-offset-top`                 | `25px`        | Top offset of the live button                              |
| `--omakase-timeline-live-button-background`                 | `transparent` | Background color of the live button                        |
| `--omakase-timeline-live-button-hover-background`           | `transparent` | Background color of the live button on hover                |
| `--omakase-timeline-live-button-padding`                     | `0`           | Padding of the live button                                  |
| `--omakase-timeline-live-button-font-size`                   | `10px`        | Font size of the live button label                          |
| `--omakase-timeline-live-button-color`                       | `currentColor` | Color of the live button label; by default the timecode's text color |
| `--omakase-timeline-live-button-indicator-size`               | `6px`         | Size of the live/DVR indicator dot within the timeline overlay |
