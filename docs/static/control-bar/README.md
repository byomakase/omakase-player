# Omakase Player Control Bar

This guide covers the standalone control bar: a bar of player controls rendered anywhere on the page, outside of the player itself. It describes how to create a control bar, how to lay out its controls, which components can be used in it, how to enable, disable, show and hide them, and the keyboard shortcuts it provides.

---

## What is a Control Bar?

The player's own [chroming](../chroming/README.md) draws controls on top of the video. A control bar places the same kind of controls somewhere else on the page, for example below the player, next to a timeline, or in a separate panel, and lets you compose them freely from an HTML template.

A control bar:

- Is built from an HTML `<template>` containing Omakase components, laid out with the control bar [layout components](#layout-components)
- Is wired to the player automatically: every component in it controls and follows the player it's created for, with no extra code
- Uses the colors and icons of either the `DEFAULT` or the `OMAKASE` chroming theme, and can be customized further with CSS variables (see [STYLING.md](../STYLING.md#control-bar))
- Provides [keyboard shortcuts](#keyboard-shortcuts) for its controls
- Lets each of its components, and each component's keyboard shortcut, be [enabled, disabled, shown and hidden](#enabling-disabling-showing-and-hiding-components), from markup or at runtime

Several control bars can be shown at once for the same player.

---

## Creating a Control Bar

A control bar needs two elements on the page: a container it's rendered into, and a `<template>` with its content.

```html
<div id="omakase-player"></div>
<div id="control-bar"></div>

<template id="control-bar-template">
  <omakase-time-range>
    <div slot="preview">
      <omakase-time-display format="timecode"></omakase-time-display>
    </div>
  </omakase-time-range>
  <omakase-control-bar-row>
    <omakase-control-bar-group slot="left">
      <omakase-time-skip-button unit="frame" amount="-1"></omakase-time-skip-button>
      <omakase-play-button></omakase-play-button>
      <omakase-time-skip-button unit="frame" amount="1"></omakase-time-skip-button>
    </omakase-control-bar-group>
    <omakase-time-display slot="center" format="timecode" withduration></omakase-time-display>
    <omakase-mute-button slot="right" volume-flyout="up"></omakase-mute-button>
    <omakase-fullscreen-button slot="right"></omakase-fullscreen-button>
  </omakase-control-bar-row>
</template>
```

The control bar is then created for a player instance:

```javascript
import {OmakasePlayer, ControlBar, ControlBarTheme} from '@byomakase/omakase-player';

const omakasePlayer = new OmakasePlayer({
  playerHtmlElementId: 'omakase-player',
});

const controlBar = new ControlBar(
  {
    controlBarHTMLElementId: 'control-bar',
    templateHTMLElementId: 'control-bar-template',
    theme: ControlBarTheme.OMAKASE,
  },
  omakasePlayer
);
```

Button components get the `media-chrome-button` class on their own when they connect, and so does a plain `<media-chrome-button>` given as a dropdown toggle, so it never needs to be set in markup. Custom CSS can still target it.

When the control bar contains `<omakase-control-bar-row>` elements, its root is laid out as a column, so its children stack vertically. In the example above, the time range sits on top of the row of buttons. A control bar without rows lays out its controls side by side.

### Using an Element Instead of a `<template>`

Frameworks that compile `<template>` tags away, such as Vue and Nuxt, can provide the control bar's content in a regular element (e.g. a `<div>`) instead. Hiding the reference element to prevent duplication is left up to the user.

### Configuration

| Property                   | Type              | Default                          | Description                                                                                       |
| -------------------------- | ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `controlBarHTMLElementId`  | `string`          | `'omakase-control-bar'`          | Id of the element the control bar is rendered into                                                |
| `templateHTMLElementId`    | `string`          | `'omakase-control-bar-template'` | Id of the `<template>` with the control bar's content                                             |
| `theme`                    | `ControlBarTheme` | the template's `theme` attribute, otherwise `ControlBarTheme.DEFAULT` | Colors and icons: `ControlBarTheme.DEFAULT` or `ControlBarTheme.OMAKASE`. When not given, a `theme` attribute on the template that names a theme, case-insensitively (e.g. `<template id="control-bar-template" theme="omakase">`), is used instead |
| `keyboardShortcutsEnabled` | `boolean`         | `true`                           | Whether the control bar's [keyboard shortcuts](#keyboard-shortcuts) are enabled                   |
| `keyboardShortcuts`        | `ControlBarKeyboardShortcuts` | `{}`                  | Keys of the keyboard shortcuts that differ from the defaults (see [Remapping Shortcuts](#remapping-shortcuts)) |

### Control Bar Api Methods

#### `getControlBarElement<T>(querySelector: string): T`

Gets an element from the control bar's DOM.

```javascript
const playButton = controlBar.getControlBarElement('omakase-play-button');
```

#### `destroy(): void`

Removes the control bar from the page and disconnects it from the player.

### Control Bar Api Properties

#### `markerBar: ControlBarMarkerBarApi`

Marker bars API of the control bar, with the methods below (see [Marker Bars](#marker-bars)).

```javascript
const markerBar = controlBar.markerBar.addMarkerBar('omakase-marker-bars', 'chapters');
```

### Control Bar Marker Bar Api Methods

#### `addMarkerBar(markerBars: string | HTMLElement, tracks?: MarkerTrack | string | (MarkerTrack | string)[], config?: Partial<ControlBarMarkerBarConfig>): ControlBarMarkerBarHandlerApi`

Adds a marker bar to an `<omakase-marker-bars>` of the control bar.

#### `getMarkerBars(): ControlBarMarkerBarHandlerApi[]` / `getMarkerBar(id: string): ControlBarMarkerBarHandlerApi | undefined`

Gets the handlers of the marker bars added with `addMarkerBar`.

#### `deleteMarkerBar(id: string): void`

Removes a marker bar added with `addMarkerBar`.

---

## Layout Components

The content of a control bar is laid out with rows, groups and labels. Their CSS variables are listed in [STYLING.md](../STYLING.md#control-bar).

#### `<omakase-control-bar-row>`

Lays out its children in `left`, `center` and `right` sections, based on each child's `slot` attribute (children without one go to the center). Each section takes an equal share of the row's width by default, and lays out its children side by side.

```html
<omakase-control-bar-row>
  <omakase-play-button slot="left"></omakase-play-button>
  <omakase-time-display slot="center" format="timecode"></omakase-time-display>
  <omakase-fullscreen-button slot="right"></omakase-fullscreen-button>
</omakase-control-bar-row>
```

Rows can be nested: a row placed in a section of another row (with its own `slot` attribute) lays out its children within that section. A section that contains rows stacks its children vertically. Any element can be placed in a section, for example the container of a [VU meter](../../../README.md#vu-meter).

#### `<omakase-control-bar-group>`

Groups controls inside a row section, with an optional background and border.

```html
<omakase-control-bar-group slot="right">
  <omakase-captions-toggle></omakase-captions-toggle>
  <omakase-fullscreen-button></omakase-fullscreen-button>
</omakase-control-bar-group>
```

#### `<omakase-control-bar-label>`

Displays its content as text in the control bar, with the font, color and line height matching the other controls.

```html
<omakase-control-bar-label slot="left">SEGMENTATION</omakase-control-bar-label>
```

A label that doesn't fit into the space it's given - its row section, or what's left of its group next to the group's other controls - is truncated with an ellipsis, and shows its full text as a tooltip while hovered. A label given a `title` of its own keeps that title instead.

---

## Available Components

The following components can be used in a control bar. Each is wired to the player when the control bar is created.

### Playback

| Component                                                                                       | Description                                                                 |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`<omakase-play-button>`](../chroming/README.md#omakase-play-button)                            | Plays or pauses playback                                                    |
| [`<omakase-time-skip-button>`](../chroming/README.md#omakase-time-skip-button)                  | Steps the playhead by a number of frames, seconds or percent of the media   |
| [`<omakase-rewind-and-play-button>`](../chroming/README.md#omakase-rewind-and-play-button)      | Rewinds, then plays back to the starting position                           |
| [`<omakase-play-and-rewind-button>`](../chroming/README.md#omakase-play-and-rewind-button)      | Plays, then rewinds back to the starting position                           |
| [`<omakase-home-button>`](../chroming/README.md#omakase-home-button)                            | Moves the playhead to the start of the media                                |
| [`<omakase-end-button>`](../chroming/README.md#omakase-end-button)                              | Moves the playhead to the end of the media                                  |
| [`<omakase-live-button>`](../chroming/README.md#omakase-live-button)                            | Live indicator; moves the playhead to the live edge                         |
| [`<omakase-playback-rate-selector>`](../chroming/README.md#omakase-playback-rate-selector)      | Selects the playback rate                                                   |

### Time

| Component                                                                          | Description                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`<omakase-time-range>`](../chroming/README.md#omakase-time-range)                 | Scrubber for seeking, optionally showing markers (see [Progress Bar Markers](#progress-bar-markers)) |
| [`<omakase-time-display>`](../chroming/README.md#omakase-time-display)             | Displays the current time, optionally with the media duration     |
| [`<omakase-time-toggle>`](../chroming/README.md#omakase-time-toggle)               | Shows or hides the player's floating timecode                     |
| [`<omakase-preview-thumbnail>`](#preview-thumbnails)                               | Shows the thumbnail at the hovered time, in a time range's preview |

### Audio and Text

| Component                                                                          | Description                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`<omakase-mute-button>`](../chroming/README.md#omakase-mute-button)               | Mutes or unmutes the output, optionally with a volume flyout      |
| [`<omakase-volume-range>`](../chroming/README.md#omakase-volume-range)             | Sets the output volume                                            |
| [`<omakase-vu-meter-toggle>`](../chroming/README.md#omakase-vu-meter-toggle)       | Shows or hides the player's floating VU meter                     |
| [`<omakase-captions-toggle>`](../chroming/README.md#omakase-captions-toggle)       | Shows or hides the active text track                              |
| [`<omakase-audio-selector>`](../chroming/README.md#omakase-audio-selector)         | Selects the audio track                                           |
| [`<omakase-text-selector>`](../chroming/README.md#omakase-text-selector)           | Selects the text track                                            |
| [`<omakase-track-selector>`](../chroming/README.md#omakase-track-selector)         | Selects audio and text tracks in a single dropdown                |

### Display

| Component                                                                          | Description                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`<omakase-fullscreen-button>`](../chroming/README.md#omakase-fullscreen-button)   | Toggles fullscreen mode for the player                            |
| [`<omakase-keyframe-button>`](#keyframes)                                          | Extracts the video keyframe at the playhead (see [Keyframes](#keyframes)) |
| [`<omakase-safe-zone-toggle>`](#safe-zones)                                        | Shows or hides configured safe zones (see [Safe Zones](#safe-zones)) |
| [`<omakase-detach-toggle>`](../chroming/README.md#omakase-detach-toggle)           | Detaches the player into its own window, or attaches it back      |

### Markers

| Component                                                                          | Description                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`<omakase-marker-bars>`](../chroming/README.md#omakase-marker-bars)               | Displays the markers of one or more marker tracks (see [Marker Bars](#marker-bars)) |

### Segmentation

| Component                                                                                                                  | Description                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`<omakase-next-marker-button>`](#omakase-next-marker-button--omakase-previous-marker-button)                              | Selects the next marker                                         |
| [`<omakase-previous-marker-button>`](#omakase-next-marker-button--omakase-previous-marker-button)                          | Selects the previous marker                                     |
| [`<omakase-playhead-to-marker-start-button>`](#omakase-playhead-to-marker-start-button)                                    | Moves the playhead to the selected marker's start               |
| [`<omakase-playhead-to-marker-end-button>`](#omakase-playhead-to-marker-end-button)                                        | Moves the playhead to the selected marker's end                 |
| [`<omakase-create-marker-button>`](#omakase-create-marker-button)                                                          | Creates a marker at the playhead                                |
| [`<omakase-delete-marker-button>`](#omakase-delete-marker-button)                                                          | Deletes the selected marker(s)                                  |
| [`<omakase-loop-on-marker-button>`](#omakase-loop-on-marker-button)                                                        | Plays the selected marker in a loop region                      |
| [`<omakase-split-marker-button>`](#omakase-split-marker-button)                                                            | Splits the selected marker at the playhead                      |
| [`<omakase-mark-in-button>`](#omakase-mark-in-button--omakase-mark-out-button)                                             | Sets the selected marker's start (or starts a new marker)       |
| [`<omakase-mark-out-button>`](#omakase-mark-in-button--omakase-mark-out-button)                                            | Sets the selected marker's end (or starts a new marker)         |
| [`<omakase-color-selector-button>`](#omakase-color-selector-button)                                                        | Picks the color of a marker track or of the selected marker(s)  |

### Menu

| Component                                   | Description                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| [`<omakase-menu>`](#menu)                   | Opens a list of options, and calls a function with the selected one's label |

### Layout

| Component                                                       | Description                                         |
| --------------------------------------------------------------- | --------------------------------------------------- |
| [`<omakase-control-bar-row>`](#omakase-control-bar-row)         | Lays out controls in left, center and right sections |
| [`<omakase-control-bar-group>`](#omakase-control-bar-group)     | Groups controls with a background and border        |
| [`<omakase-control-bar-label>`](#omakase-control-bar-label)     | Displays text                                       |

---

## Enabling, Disabling, Showing and Hiding Components

Every component listed in [Available Components](#available-components), except the layout components, has a common API for:

- **Enabling or disabling the component.** A disabled component renders disabled, ignores clicks and keyboard activation, and its keyboard shortcut does nothing.
- **Enabling or disabling its keyboard shortcut.** The component itself keeps working; only its [keyboard shortcut](#keyboard-shortcuts) does nothing.
- **Showing or hiding the component.** A hidden component takes no space in the control bar, but its keyboard shortcut still works, unless the shortcut or the component is disabled as well.

The three are independent of each other: for example, a component can be hidden and have its shortcut disabled, while staying enabled.

### Attributes

Each state can be set in markup with an attribute, so that a component starts out disabled or hidden:

| Attribute           | Effect                                     |
| ------------------- | ------------------------------------------ |
| `disabled`          | Disables the component                     |
| `shortcut-disabled` | Disables the component's keyboard shortcut |
| `shortcut`          | Sets the key of the component's keyboard shortcut (see [Component Shortcuts](#component-shortcuts)) |
| `hidden`            | Hides the component                        |

```html
<omakase-control-bar-row>
  <!-- disabled until the user is allowed to edit markers -->
  <omakase-create-marker-button slot="left" marker-track-id="chapters" disabled></omakase-create-marker-button>
  <!-- clickable, but Space doesn't play or pause -->
  <omakase-play-button slot="center" shortcut-disabled></omakase-play-button>
  <!-- not shown, but F still toggles fullscreen -->
  <omakase-fullscreen-button slot="right" hidden></omakase-fullscreen-button>
</omakase-control-bar-row>
```

`disabled` and `hidden` are the standard HTML attributes, so the element's own `hidden` property works as well. Adding or removing an attribute at runtime takes effect right away, for example with `element.toggleAttribute('hidden', true)`.

### Methods and Properties

The same states can be changed at runtime with the component's methods, or read and set with its properties. Both are kept in sync with the attributes.

| Method                                  | Property                    | Default | Description                                         |
| --------------------------------------- | --------------------------- | ------- | --------------------------------------------------- |
| `setEnabled(enabled: boolean)`          | `enabled: boolean`          | `true`  | Enables or disables the component                   |
| `setShortcutEnabled(enabled: boolean)`  | `shortcutEnabled: boolean`  | `true`  | Enables or disables the component's keyboard shortcut |
| `setShortcut(shortcut: string \| undefined)` | `shortcut: string \| undefined` | `undefined` | Sets the key of the component's keyboard shortcut, or restores its action's key when `undefined` (see [Component Shortcuts](#component-shortcuts)) |
| `setVisible(visible: boolean)`          | `visible: boolean`          | `true`  | Shows or hides the component                        |

```javascript
const createMarkerButton = controlBar.getControlBarElement('omakase-create-marker-button');
createMarkerButton.setEnabled(true);

const playButton = controlBar.getControlBarElement('omakase-play-button');
playButton.setShortcutEnabled(false);

const fullscreenButton = controlBar.getControlBarElement('omakase-fullscreen-button');
fullscreenButton.setVisible(false);
console.log(fullscreenButton.visible); // false
```

In TypeScript, the API is described by the `ControlBarComponentApi` interface, and the attribute names are available as `ControlBarComponentAttributes`.

### How Each Component Behaves

- **Buttons and toggles** render disabled like any media-chrome button that is disabled, and can't be clicked or activated with `Enter` / `Space`. Disabling an `<omakase-mute-button>` disables its volume flyout as well, which then doesn't open on hover.
- **Selectors and the menu** can't be opened, and close if they're open. Selectors that are already disabled because there's nothing to select (for example an `<omakase-audio-selector>` with a single audio track) stay disabled until there is, even when enabled.
- **`<omakase-time-range>` and `<omakase-volume-range>`** can't be dragged or clicked. Clicking a [progress bar marker](#progress-bar-markers) neither seeks nor emits `onMarkerClick`.
- **`<omakase-time-display>`** can't be put into edit mode. Disabling it while it's being edited cancels the edit.
- **`<omakase-preview-thumbnail>` and `<omakase-marker-bars>`** are only dimmed. Markers in disabled marker bars can't be clicked.
- **Segmentation components** are inactive, regardless of their own [activation condition](#omakase-segmentation-components), and look the same as when that condition isn't met (both set the `inactive` attribute). Once enabled again, they follow their activation condition.

Disabled components, and inactive segmentation components, are dimmed with the `--omakase-control-disabled-opacity` CSS variable (see [STYLING.md](../STYLING.md#control-bar)).

A disabled component can still be hidden, shown, and have its shortcut enabled or disabled; its shortcut starts working again once the component is enabled, unless the shortcut is disabled.

### While No Media Is Loaded

While the player has no main media loaded, the control bar disables all of its components, which enables them again once main media is loaded. Only the components the control bar disabled itself are enabled again:

- A component disabled in markup, or before the control bar was created, stays disabled.
- A component enabled or disabled in the meantime, with the `disabled` attribute or the `enabled` property and `setEnabled` method, keeps that state.

### Hiding Layout Components

The layout components (`<omakase-control-bar-row>`, `<omakase-control-bar-group>` and `<omakase-control-bar-label>`) have no controls or shortcuts of their own, so they don't have this API. They can be hidden with the `hidden` attribute, which hides all controls inside them. As with hidden components, the shortcuts of controls inside a hidden row or group still work:

```html
<omakase-control-bar-row class="segmentation-row" hidden>
  <omakase-mark-in-button slot="left" marker-track-id="chapters"></omakase-mark-in-button>
  <omakase-mark-out-button slot="left" marker-track-id="chapters"></omakase-mark-out-button>
</omakase-control-bar-row>
```

```javascript
// shows the row; I and O work whether it's shown or not
controlBar.getControlBarElement('.segmentation-row').toggleAttribute('hidden', false);
```

---

## Preview Thumbnails

An `<omakase-preview-thumbnail>` in a time range's `preview` slot shows the thumbnail at the hovered time, like the player's own progress bar does. It shows the thumbnail track set on the chroming, and follows it when it's changed or removed - no extra code is needed:

```html
<omakase-time-range>
  <div slot="preview">
    <omakase-preview-thumbnail></omakase-preview-thumbnail>
    <omakase-time-display format="timecode"></omakase-time-display>
  </div>
</omakase-time-range>
```

```javascript
omakasePlayer.chroming.setThumbnailTrack('https://example.com/thumbnails.vtt').subscribe();
```

The thumbnail is hidden while no thumbnail track is set. It's styled like the thumbnail of the matching chroming theme; with `ControlBarTheme.DEFAULT` its width can be changed with `--omakase-thumbnail-base-size` (see [STYLING.md](../STYLING.md#control-bar)).

---

## Progress Bar Markers

The markers of one or more marker tracks can be shown on a control bar's `<omakase-time-range>`, like on the player's own progress bar. The markers are only displayed: they can't be moved or resized from the time range, and pressing on one seeks to that position like anywhere else on the time range.

A marker track is shown by adding its state to the time range, once the track has been added to the player:

```javascript
import {MarkerTrack, PlayerEventType, TimedItemTemporalType} from '@byomakase/omakase-player';
import {filter} from 'rxjs';

const timeRange = controlBar.getControlBarElement('omakase-time-range');

omakasePlayer.player.onEvent$.pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED)).subscribe(() => {
  const chapters = new MarkerTrack({id: 'chapters'});
  chapters.addTimedItems([
    {label: 'Intro', temporal: {type: TimedItemTemporalType.SPAN, start: '0', end: '30'}},
    {label: 'Chapter 1', temporal: {type: TimedItemTemporalType.MOMENT, time: '60'}},
  ]);
  omakasePlayer.track.add(chapters);

  timeRange.addTrack(chapters.state);
});
```

- Markers added to, updated on or deleted from a shown track are reflected automatically.
- `removeTrack(track.state)` stops showing a track, and `hasTrack(trackId)` tells whether a track is shown.
- Marker colors are set with UI style rules, for a whole track by its id, or for a single marker by the marker's id:

```javascript
omakasePlayer.ui.updateStyleRule({id: 'chapters', style: {markerColor: '#ffb300'}});
```

Clicking a marker emits its id on the time range's `onMarkerClick`, and hovering one emits on `onMarkerMouseEnter$` / `onMarkerMouseLeave$`. Clicks can be used to select the marker for the [segmentation components](#omakase-segmentation-components):

```javascript
let selectedMarkerId;
timeRange.onMarkerClick.subscribe(({markerId}) => {
  if (selectedMarkerId) {
    omakasePlayer.ui.updateElement({id: selectedMarkerId, props: {focused: undefined}});
  }
  selectedMarkerId = markerId;
  omakasePlayer.ui.updateElement({id: markerId, props: {focused: true}});
});
```

---

## Marker Bars

`<omakase-marker-bars>` shows one or more marker bars, each showing the markers of one or more marker tracks. A control bar can contain several `<omakase-marker-bars>`, each in its own row or row section, and each sized to the space it's given.

```html
<template id="control-bar-template">
  <omakase-control-bar-row>
    <omakase-marker-bars slot="left" class="chapters-bar"></omakase-marker-bars>
    <omakase-marker-bars slot="right" class="ads-bar"></omakase-marker-bars>
  </omakase-control-bar-row>
</template>
```

Marker bars are added with `addMarkerBar` of the control bar's `markerBar` API, given the `<omakase-marker-bars>` (as a query selector within the control bar, or the element itself) and the marker tracks to show, once they've been added to the player:

```javascript
import {filter} from 'rxjs';
import {ControlBarMarkerBarEventType, MarkerTrack, PlayerEventType, TimedItemTemporalType} from '@byomakase/omakase-player';

omakasePlayer.player.onEvent$.pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED)).subscribe(() => {
  const chapters = new MarkerTrack({id: 'chapters'});
  chapters.addTimedItems([{label: 'Chapter 1', temporal: {type: TimedItemTemporalType.MOMENT, time: '10'}}]);
  omakasePlayer.track.add(chapters);

  const markerBar = controlBar.markerBar.addMarkerBar('.chapters-bar', chapters);
  markerBar.onEvent$.pipe(filter((event) => event.type === ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_CLICK)).subscribe((event) => {
    console.log('clicked', event.data.item);
  });
});
```

- `addMarkerBar(markerBars, tracks?, config?)` takes a marker track or its id, or an array of them, and an optional `config` with the marker bar's `id` and initial `visible` state. It throws if the `<omakase-marker-bars>` or a marker track isn't found, or if a marker bar with the given `id` already exists.
- It returns a `ControlBarMarkerBarHandlerApi`, with `addTrack(track)` / `removeTrack(trackId)` / `getTrackIds()` to change the shown tracks, `setVisibility(visible)` to show or hide the marker bar, and its `state`.
- The handler's `onEvent$` emits `CONTROL_BAR_MARKER_BAR_ITEM_CLICK`, `CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_ENTER` and `CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_LEAVE` for the markers, and `CONTROL_BAR_MARKER_BAR_CHANGE` when its state changes. Clicks can be used to select the marker for the [segmentation components](#omakase-segmentation-components).
- `controlBar.markerBar.getMarkerBars()` and `getMarkerBar(id)` return the handlers of the added marker bars, and `deleteMarkerBar(id)` removes one.
- The control bar keeps the marker bars in sync with the player: they're sized to the loaded media, markers added to, updated on or deleted from a shown track are reflected automatically, and markers of unlocked tracks dragged on a marker bar are moved on their track.

---

## Menu

`<omakase-menu>` embeds a simple, single-level list of options in a control bar. Clicking its icon opens the list; selecting an option closes it and calls the menu's `onSelect` function with the option's label. What the options do is up to you - the menu doesn't act on the player itself.

Options can be given in markup as `<option>` elements, with optional `value` and `disabled` attributes:

```html
<omakase-menu menu-title="ACTIONS" alignment="right">
  <option>Copy timecode</option>
  <option value="go-to-start">Go to start</option>
  <option disabled>Export</option>
</omakase-menu>
```

```javascript
const menu = controlBar.getControlBarElement('omakase-menu');
menu.onSelect = (label, value) => {
  console.log(`selected ${label}`);
};
```

`onSelect` is called with the option's label and its value. An option's value identifies it within the menu and defaults to its label, so options only need a `value` when their label isn't unique or may change.

### Changing the options

Options can also be set, added and removed at any time, so the menu can follow the context it's used in:

```javascript
menu.options = [{label: 'Copy timecode'}, {label: 'Go to start', value: 'go-to-start'}];

menu.addOption({label: 'Pause', value: 'pause'}, 0); // inserted first; at the end when no index is given
menu.removeOption('pause');
```

`options` returns the current options, as `{label, value?, enabled?}` objects. Adding an option with the value of an existing one replaces that option in place.

### Enabling and disabling

```javascript
menu.setOptionEnabled('go-to-start', false); // shown greyed out, can't be selected
menu.setEnabled(false); // the icon is disabled and the menu can't be opened
```

Disabling the menu closes it if it's open. A menu without options is disabled as well. The menu is enabled, disabled, shown and hidden like any other component (see [Enabling, Disabling, Showing and Hiding Components](#enabling-disabling-showing-and-hiding-components)).

### Attributes

| Attribute    | Description                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `menu-title` | Title shown above the options. No title when not set                                                             |
| `alignment`  | Horizontal alignment of the list relative to the icon: `left`, `center` (default) or `right`                     |

The icon follows the control bar's theme and can be changed with the `--omakase-menu-icon` CSS variable (see [STYLING.md](../STYLING.md#control-bar)). To use something else as the toggle, give it in the `toggle` slot, as with the other dropdown selectors:

```html
<omakase-menu>
  <media-chrome-button slot="toggle">
    <span class="my-menu-icon"></span>
  </media-chrome-button>
  <option>Copy timecode</option>
</omakase-menu>
```

---

## Keyframes

`<omakase-keyframe-button>` extracts the video keyframe at the playhead, using the player's `extractVideoKeyframe` API, and hands it to a callback. Its keyboard shortcut is `Alt + K` (`Option + K` on macOS).

```html
<omakase-keyframe-button audio-src="/sounds/shutter.mp3"></omakase-keyframe-button>
```

The capability is configured with `configure()`, which replaces any previous configuration:

```javascript
const keyframeButton = controlBar.getControlBarElement('omakase-keyframe-button');

keyframeButton.configure({
  callbackFn: (keyframe) => {
    // keyframe.src is an object URL of the image; release it with URL.revokeObjectURL() when done
    document.getElementById('keyframe-image').src = keyframe.src;
  },
  audioSrc: '/sounds/shutter.mp3',
  keyframeOptions: {type: VideoKeyframeType.PNG},
});

// deactivates the capability, and clears its configuration
keyframeButton.deactivate();
```

| Option            | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `callbackFn`      | Invoked with each extracted `VideoKeyframe`. The capability is inactive while no callback function is configured         |
| `audioSrc`        | URL of an audio file played when a keyframe is extracted. Also available as the `audio-src` attribute. Silent when not set |
| `keyframeOptions` | Options of the extracted keyframes, e.g. `{type: VideoKeyframeType.PNG}`. JPEG by default                                |

- While inactive (no callback function configured, or after `deactivate()`), the button has the `inactive` attribute and is dimmed, and neither the button nor its shortcut does anything. The `active` property tells whether the capability is active.
- The `callbackFn` and `audioSrc` properties can also be set individually. Setting `callbackFn` to `undefined` deactivates the capability.
- Nothing is extracted while no main media is loaded.

## Safe Zones

`<omakase-safe-zone-toggle>` shows or hides a configured set of safe zones on the player, using the chroming's `addSafeZone` and `removeSafeZone` APIs. Its icon shows whether the safe zones are shown. Its keyboard shortcut is `Shift + S`.

```html
<omakase-safe-zone-toggle></omakase-safe-zone-toggle>
```

The capability is configured with `configure()`, which replaces any previous configuration. As in the chroming API, a safe zone is given by its `[top, right, bottom, left]` percentages, either as the array alone or as the `topRightBottomLeftPercent` of a full safe zone:

```javascript
const safeZoneToggle = controlBar.getControlBarElement('omakase-safe-zone-toggle');

safeZoneToggle.configure({
  safeZones: [
    [5, 5, 5, 5], // action safe
    {topRightBottomLeftPercent: [10, 10, 10, 10], htmlClass: 'title-safe'}, // title safe
  ],
});

// deactivates the capability, hiding its safe zones and clearing its configuration
safeZoneToggle.deactivate();
```

- While inactive (no safe zones configured, or after `deactivate()`), the toggle has the `inactive` attribute and is dimmed, and neither the toggle nor its shortcut does anything. The `active` property tells whether the capability is active.
- The toggle only adds and removes its own safe zones; safe zones added through the chroming API are left alone. Safe zones without an `id` are given one by the toggle.
- The `safeZonesVisible` property, and the `safe-zones-visible` attribute, tell whether the toggle's safe zones are shown. They follow the chroming, so they're updated when the safe zones are removed through the chroming API, e.g. `removeAllSafeZones()`.
- Reconfiguring while the safe zones are shown replaces them with the new ones.

## Omakase Segmentation Components

Segmentation components are control bar buttons that act on a `MarkerTrack`. Each one is linked to a single marker track through the `marker-track-id` attribute (or the `markerTrackId` property, settable at any time - including clearing it by setting it to `undefined`):

```html
<omakase-next-marker-button marker-track-id="chapters"></omakase-next-marker-button>
```

```javascript
const button = document.querySelector('omakase-next-marker-button');
button.markerTrackId = 'chapters';
```

A component renders disabled - and ignores clicks/keyboard activation - whenever no marker track is linked, the linked track can't be resolved, or its own activation condition (documented per component below) isn't met. It can also be disabled explicitly, regardless of those conditions, with the `disabled` attribute or `setEnabled(false)` (see [Enabling, Disabling, Showing and Hiding Components](#enabling-disabling-showing-and-hiding-components)). Either way, the component has the `inactive` attribute while it can't be used, which can be used for styling; `disabled` is only set when the component is disabled explicitly.

A marker is considered active/selected when its `focused` property is set via `omakasePlayer.ui.updateElement({id: markerId, props: {focused: true}})`; clearing it (`focused: undefined`) deselects it. This is the same mechanism `<omakase-next-marker-button>` and `<omakase-previous-marker-button>` use internally, so any code driving marker selection (e.g. in response to a marker being clicked) should use it too, to stay in sync with these components.

Their CSS variables are listed in [STYLING.md](../STYLING.md#icons).

### `<omakase-playhead-to-marker-start-button>`

Active whenever a marker is active/selected on the linked track. Pauses playback (if playing) and moves the playhead to the active marker's start. For a moment marker, start and end are the same time.

### `<omakase-playhead-to-marker-end-button>`

Active whenever a marker is active/selected on the linked track. Pauses playback (if playing) and moves the playhead to the active marker's end. For a moment marker, start and end are the same time.

### `<omakase-create-marker-button>`

Active whenever the linked track isn't locked (`areTimedItemsLocked`). Creates a Moment Marker at the current playhead position on the linked track.

Set `onCreateMarker` to override this default behavior - when set, it's called with the linked track and the current playhead position instead of creating a marker directly:

```javascript
document.querySelector('omakase-create-marker-button').onCreateMarker = (track, currentTime) => {
  // create a marker however you like, e.g. with custom data
};
```

### `<omakase-delete-marker-button>`

Active whenever the linked track isn't locked and at least one marker on it is active/selected. Deletes the active/selected marker(s) on the linked track.

Set `onDeleteMarker` to override this default behavior - when set, it's called with the linked track and the active/selected marker(s) instead of deleting them directly:

```javascript
document.querySelector('omakase-delete-marker-button').onDeleteMarker = (track, markers) => {
  // delete (or otherwise handle) the markers however you like
};
```

### `<omakase-next-marker-button>` / `<omakase-previous-marker-button>`

Active whenever the linked track has at least one marker (regardless of lock state or selection).

Deselects the currently active/selected marker(s) on the linked track and selects the marker to the right (`next`) / left (`previous`) of the right-most/left-most one that was selected. If nothing was selected, selects the first (`next`) or last (`previous`) marker instead. If the right-most (`next`) or left-most (`previous`) marker was already selected, the active marker(s) are deselected and nothing new is selected.

### `<omakase-loop-on-marker-button>`

Active whenever exactly one marker is active/selected on the linked track (deactivates when zero or multiple markers are selected).

Pauses playback, seeks to the start of a loop region, plays until reaching its end, then pauses and returns the playhead:

- For a Period Marker, the loop region is the marker's own start/end, and the playhead returns to the marker's start.
- For a Moment Marker, the loop region is `displacement` seconds (clamped to the timeline bounds) on either side of the marker's time, and the playhead returns to the marker's time.

The `displacement` attribute (or property) configures that distance in seconds; it defaults to `5` when unset.

```html
<omakase-loop-on-marker-button marker-track-id="chapters" displacement="3"></omakase-loop-on-marker-button>
```

### `<omakase-split-marker-button>`

Active whenever the linked track isn't locked, exactly one Period Marker is active/selected on it, and the playhead is strictly between that marker's start and end.

Splits the active marker in two at the playhead position: the left marker keeps the original start and ends at the playhead, the right marker starts one frame after the playhead and keeps the original end. The right (new) marker becomes active/selected, and is assigned the `splitColor` - the `split-color` attribute (or property), defaulting to `#EE7A76` when unset.

```html
<omakase-split-marker-button marker-track-id="chapters" split-color="#EE7A76"></omakase-split-marker-button>
```

```javascript
document.querySelector('omakase-split-marker-button').splitColor = '#00AACC';
```

### `<omakase-mark-in-button>` / `<omakase-mark-out-button>`

Supports three visual representations, set via the `representation` attribute (or property):

- `icon` (the default) - just the icon, like every other segmentation button.
- `icon-time` - the icon plus a non-interactive display of the relevant marker time in timecode format. Only the icon region is clickable.
- `label-time` - a text label instead of an icon, plus the same time display. Only the label region is clickable. The label defaults to the `markIn` / `markOut` localization keys (`MARK IN` / `MARK OUT` unless overridden via `LocalizationConfig`), is localizable per-instance via the `label` attribute (or property), and the label region resizes to fit it.

```html
<omakase-mark-in-button marker-track-id="chapters" representation="icon-time"></omakase-mark-in-button>
<omakase-mark-out-button marker-track-id="chapters" representation="label-time" label="SALIDA"></omakase-mark-out-button>
```

Business logic depends on both the active/selected marker and the playhead position:

- Multiple markers selected, or the linked track is locked: both deactivate.
- No marker selected: both start a new, open-ended Period Marker at the playhead position (its start for mark-in, its end for mark-out), and select it - so a follow-up Mark-In/Mark-Out acts on that same marker.
- A Moment Marker selected: mark-in sets its time to the playhead position; mark-out deactivates (and its display shows the empty placeholder, `-- : -- : -- : --`).
- A Period Marker selected: mark-in sets its start to the playhead position when the playhead is left of its end (or its end isn't defined yet), otherwise deactivates. Mark-out sets its end to the playhead position when the playhead is right of its start (or its start isn't defined yet), otherwise deactivates.

Set `onMarkIn` / `onMarkOut` to override the default behavior above - when set, it's called with the linked track, the current playhead position, and the active marker (if any) instead:

```javascript
document.querySelector('omakase-mark-in-button').onMarkIn = (track, currentTime, marker) => {
  // set the marker's start (or create one) however you like
};
```

### `<omakase-color-selector-button>`

Lets an API client pick the color used to render Marker(s) on the linked track. Active as long as a marker track is linked (regardless of lock state, since it only changes color, not track structure). Clicking it opens a fly-out presenting a color palette as an M x N matrix, with the currently active color highlighted; clicking a swatch applies that color and closes the fly-out.

The `flyout` attribute (or `flyoutDirection` property) sets the direction the fly-out opens in: `down` (the default), `up`, `left` or `right`. Opening down or up, the fly-out is centered on the button; opening left or right, its top is aligned with the button's.

The palette is set via the `palette` attribute (a comma-separated list of colors) or property (an array), and defaults to a built-in palette when unset. The matrix's dimensions are derived from the palette size: 1 row for fewer than 8 colors, 8 columns for up to 64, 10 columns beyond that.

```html
<omakase-color-selector-button marker-track-id="chapters" scope="track"></omakase-color-selector-button>
```

```javascript
const selector = document.querySelector('omakase-color-selector-button');
selector.palette = ['#ff0000', '#00ff00', '#0000ff'];
```

The `scope` attribute (or property) controls what the selected color applies to:

- `track` (the default) - the color assigned to the linked track, used by any of its markers that don't have their own explicit color.
- `marker` - the color assigned to the currently active/selected marker(s) on the linked track.

The `initial-color` attribute (or property) sets the color selected before the linked track/marker has an explicit color of its own; it defaults to the palette's first (upper-left) color when unset. The active/selected color can also be read or set directly via the `selectedColor` property, which applies the same scope rules as clicking a swatch.

---

## Keyboard Shortcuts

A control bar provides keyboard shortcuts for its controls. A shortcut performs the same action as clicking the matching control, and only works when the control bar contains that control - for example, `Space` plays or pauses only if the control bar has an `<omakase-play-button>`.

A shortcut does nothing while its control is disabled, or while the control's shortcut is disabled. It still works while its control is hidden. See [Enabling, Disabling, Showing and Hiding Components](#enabling-disabling-showing-and-hiding-components):

```html
<!-- Space doesn't play or pause, but the button still does -->
<omakase-play-button shortcut-disabled></omakase-play-button>
<!-- not shown, but S still mutes and unmutes -->
<omakase-mute-button hidden></omakase-mute-button>
```

| Action                                  | Shortcut (Windows / Linux)  | Shortcut (macOS)            | Component                                                                  | `ControlBarShortcutAction`        |
| --------------------------------------- | --------------------------- | --------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Play / pause                            | `Space`                     | `Space`                     | `<omakase-play-button>`                                                    | `PLAY_BUTTON`                      |
| Reset playback rate and pause           | `K`                         | `K`                         | `<omakase-play-button>`                                                    | `PLAY_BUTTON_RESET_PLAYBACK_RATE`   |
| Step 1 frame forward                    | `Right Arrow`               | `Right Arrow`               | `<omakase-time-skip-button unit="frame" amount="1">`                       | `TIME_SKIP_BUTTON_FRAME_FORWARD`                   |
| Step 1 frame backward                   | `Left Arrow`                | `Left Arrow`                | `<omakase-time-skip-button unit="frame" amount="-1">`                      | `TIME_SKIP_BUTTON_FRAME_BACKWARD`                  |
| Step 10 frames forward                  | `Shift + Right Arrow`       | `Shift + Right Arrow`       | `<omakase-time-skip-button unit="frame" amount="10">`                      | `TIME_SKIP_BUTTON_TEN_FRAMES_FORWARD`              |
| Step 10 frames backward                 | `Shift + Left Arrow`        | `Shift + Left Arrow`        | `<omakase-time-skip-button unit="frame" amount="-10">`                     | `TIME_SKIP_BUTTON_TEN_FRAMES_BACKWARD`             |
| Increase playback rate                  | `Shift + L`                 | `Shift + L`                 | `<omakase-playback-rate-selector>`                                         | `PLAYBACK_RATE_SELECTOR_UP`                |
| Decrease playback rate                  | `L`                         | `L`                         | `<omakase-playback-rate-selector>`                                         | `PLAYBACK_RATE_SELECTOR_DOWN`              |
| Increase volume                         | `Shift + \`                 | `Shift + \`                 | `<omakase-mute-button>` or `<omakase-volume-range>`                        | `VOLUME_RANGE_UP`                       |
| Decrease volume                         | `\`                         | `\`                         | `<omakase-mute-button>` or `<omakase-volume-range>`                        | `VOLUME_RANGE_DOWN`                     |
| Mute / unmute                           | `S`                         | `S`                         | `<omakase-mute-button>` or `<omakase-volume-range>`                        | `MUTE_BUTTON`                    |
| Show / hide text                        | `D`                         | `D`                         | `<omakase-captions-toggle>`                                                | `CAPTIONS_TOGGLE`                     |
| Toggle fullscreen                       | `F`                         | `F`                         | `<omakase-fullscreen-button>`                                              | `FULLSCREEN_BUTTON`               |
| Show / hide VU meter                    | `G`                         | `G`                         | `<omakase-vu-meter-toggle>`                                                | `VU_METER_TOGGLE`                 |
| Show / hide timecode                    | `B`                         | `B`                         | `<omakase-time-toggle>`                                                    | `TIME_TOGGLE`                 |
| Go to start                             | `Home`                      | `Fn + Left Arrow`           | `<omakase-home-button>`                                                    | `HOME_BUTTON`                     |
| Go to end                               | `End`                       | `Fn + Right Arrow`          | `<omakase-end-button>`                                                     | `END_BUTTON`                       |
| Rewind and play                         | `Ctrl + Left Arrow`         | `Cmd + Left Arrow`          | `<omakase-rewind-and-play-button>`                                         | `REWIND_AND_PLAY_BUTTON`                 |
| Play and rewind                         | `Ctrl + Right Arrow`        | `Cmd + Right Arrow`         | `<omakase-play-and-rewind-button>`                                         | `PLAY_AND_REWIND_BUTTON`                 |
| Align playhead to marker start          | `Shift + I`                 | `Shift + I`                 | `<omakase-playhead-to-marker-start-button>`                                | `PLAYHEAD_TO_MARKER_START_BUTTON`        |
| Align playhead to marker end            | `Shift + O`                 | `Shift + O`                 | `<omakase-playhead-to-marker-end-button>`                                  | `PLAYHEAD_TO_MARKER_END_BUTTON`          |
| Create marker                           | `M`                         | `M`                         | `<omakase-create-marker-button>`                                           | `CREATE_MARKER_BUTTON`                   |
| Delete marker                           | `Ctrl + Alt + M`            | `Option + M`                | `<omakase-delete-marker-button>`                                           | `DELETE_MARKER_BUTTON`                   |
| Next marker                             | `Shift + M`                 | `Shift + M`                 | `<omakase-next-marker-button>`                                             | `NEXT_MARKER_BUTTON`                     |
| Previous marker                         | `Ctrl + Shift + M`          | `Ctrl + Shift + M`          | `<omakase-previous-marker-button>`                                         | `PREVIOUS_MARKER_BUTTON`                 |
| Loop on marker                          | `R`                         | `R`                         | `<omakase-loop-on-marker-button>`                                          | `LOOP_ON_MARKER_BUTTON`                  |
| Split marker                            | `P`                         | `P`                         | `<omakase-split-marker-button>`                                            | `SPLIT_MARKER_BUTTON`                    |
| Mark in                                 | `I`                         | `I`                         | `<omakase-mark-in-button>`                                                 | `MARK_IN_BUTTON`                         |
| Mark out                                | `O`                         | `O`                         | `<omakase-mark-out-button>`                                                | `MARK_OUT_BUTTON`                        |
| Edit time                               | `'`                         | `'`                         | `<omakase-time-display editable>`                                          | `TIME_DISPLAY`                       |
| Extract keyframe                        | `Alt + K`                   | `Option + K`                | `<omakase-keyframe-button>`                                                | `KEYFRAME_BUTTON`                |
| Show / hide safe zones                  | `Shift + S`                 | `Shift + S`                 | `<omakase-safe-zone-toggle>`                                               | `SAFE_ZONE_TOGGLE`               |

- Increasing or decreasing the playback rate selects the next higher or lower rate offered by the `<omakase-playback-rate-selector>`.
- Increasing or decreasing the volume changes it by 10%. The volume shortcuts and mute / unmute work while at least one `<omakase-mute-button>` or standalone `<omakase-volume-range>` is enabled and has its shortcut enabled. The volume flyout of a mute button follows the button.
- Edit time pauses playback and puts the first `editable` time display into edit mode, once media is loaded. Type the time, then press `Enter` to seek to it, or `Escape` to cancel. Since the time is edited in place, this is the one shortcut that needs its control to be shown: hidden time displays, and time displays inside a hidden row or group, are skipped.
- Holding down a key repeats frame stepping and volume changes; other shortcuts are performed once per key press.
- Shortcuts are ignored while typing in a text field, and `Space` / `Enter` on a focused button activate that button instead.
- Shortcuts are matched by the position of the key on the keyboard (as on a US layout), not by the character it types.
- Some browsers reserve shortcuts for themselves, for example `Ctrl + Shift + M` in Chrome on Windows, in which case they don't reach the control bar.

### Remapping Shortcuts

The `keyboardShortcuts` config option assigns other keys to some of the shortcuts, by their `ControlBarShortcutAction` (listed in the table above). The shortcuts it doesn't mention keep their default keys.

```javascript
import {ControlBar, ControlBarShortcutAction} from '@byomakase/omakase-player';

const controlBar = new ControlBar(
  {
    controlBarHTMLElementId: 'control-bar',
    templateHTMLElementId: 'control-bar-template',
    keyboardShortcuts: {
      [ControlBarShortcutAction.PLAY_BUTTON]: 'K',
      [ControlBarShortcutAction.PLAY_BUTTON_RESET_PLAYBACK_RATE]: 'Shift+K',
      [ControlBarShortcutAction.MARK_IN_BUTTON]: ['I', 'BracketLeft'],
      [ControlBarShortcutAction.DELETE_MARKER_BUTTON]: 'Mod+Backspace',
      [ControlBarShortcutAction.TIME_DISPLAY]: null,
    },
  },
  omakasePlayer
);
```

Each action can be given:

- **A key**, as a string of `+`-separated modifiers followed by the key, for example `'M'`, `'Shift+ArrowRight'` or `'Ctrl+Alt+M'`.
- **Several keys**, as an array; any of them triggers the shortcut.
- **`null` or `[]`**, so that no key triggers the shortcut.

In a key string:

- The key is a [`KeyboardEvent.code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), such as `KeyM`, `Digit1`, `ArrowLeft`, `Space`, `Home` or `BracketLeft`. A single letter or digit stands for its key, so `M` is the same as `KeyM` and `1` the same as `Digit1`. As with the default shortcuts, keys are matched by their position on the keyboard (as on a US layout), not by the character they type.
- The modifiers are `Shift`, `Ctrl` (or `Control`), `Alt` (or `Option`), `Meta` (or `Cmd`, `Command`), and `Mod`, which is `Cmd` on macOS and `Ctrl` elsewhere. They're case-insensitive and can be given in any order. Exactly the given modifiers have to be held down: `'M'` isn't triggered by `Shift + M`.

A key can also be given as an object, which is what a key string is parsed into:

```javascript
keyboardShortcuts: {
  [ControlBarShortcutAction.NEXT_MARKER_BUTTON]: {code: 'ArrowDown', alt: true}, // or {code: 'ArrowDown', mod: true}
}
```

#### Keys for a Single Operating System

A key given as an object can be limited to one operating system with its `os` property - `ControlBarShortcutOs.MACOS`, `ControlBarShortcutOs.WINDOWS` or `ControlBarShortcutOs.LINUX`. The key works only there, and is ignored elsewhere. Keys without `os` work everywhere.

```javascript
import {ControlBarShortcutAction, ControlBarShortcutOs} from '@byomakase/omakase-player';

keyboardShortcuts: {
  // Option + Backspace on macOS, Delete on Windows and Linux
  [ControlBarShortcutAction.DELETE_MARKER_BUTTON]: [
    {code: 'Backspace', alt: true, os: ControlBarShortcutOs.MACOS},
    {code: 'Delete', os: ControlBarShortcutOs.WINDOWS},
    {code: 'Delete', os: ControlBarShortcutOs.LINUX},
  ],
  // Cmd + Shift + M on macOS; elsewhere, the default Ctrl + Shift + M is kept
  [ControlBarShortcutAction.PREVIOUS_MARKER_BUTTON]: {code: 'KeyM', meta: true, shift: true, os: ControlBarShortcutOs.MACOS},
}
```

- When none of a shortcut's keys apply to the current operating system, as for `PREVIOUS_MARKER_BUTTON` on Windows and Linux above, the shortcut keeps its default key there. To remove a shortcut, give it `null` or `[]`, which removes it on every operating system.
- The operating system is told by the browser's `navigator.platform`. iPadOS and iOS count as macOS, Android and ChromeOS as Linux.
- An unknown `os` value makes the `ControlBar` constructor throw, on any operating system.

#### Precedence

A remapped key takes precedence over the default key of another shortcut: in the first example of this section, `K` plays and pauses instead of resetting the playback rate, and `Shift + K` resets it instead. A default key that is taken over this way doesn't trigger its default shortcut anymore; give that shortcut a new key if it should still have one. Remapping only changes which keys trigger a shortcut - the shortcut still needs its control, as described above. An invalid key string, such as one with an unknown modifier, makes the `ControlBar` constructor throw.

Each control bar has its own keys, so the same key can trigger different shortcuts in different control bars.

### Component Shortcuts

The `shortcut` attribute sets the key of a single component's shortcut, overriding the key of its action. It takes a key string, as in `keyboardShortcuts`:

```html
<!-- Space plays and pauses, but J steps 5 frames back and Shift + J 5 frames forward -->
<omakase-time-skip-button unit="frame" amount="-5" shortcut="J"></omakase-time-skip-button>
<omakase-play-button></omakase-play-button>
<omakase-time-skip-button unit="frame" amount="5" shortcut="Shift+J"></omakase-time-skip-button>
<!-- this marker track's mark in is Shift + 1; other mark in buttons keep I -->
<omakase-mark-in-button marker-track-id="chapters" shortcut="Shift+1"></omakase-mark-in-button>
```

- **Which components.** The attribute works on buttons and toggles, whose shortcut clicks them, and on an `editable` `<omakase-time-display>`, whose shortcut edits the time. That includes buttons without a default shortcut, such as `<omakase-detach-toggle>` or a time skip button with any `unit` and `amount`. It's ignored on components with more than one action, such as `<omakase-playback-rate-selector>` and `<omakase-volume-range>`.
- **Effect on the action's key.** The component isn't triggered by its action's key anymore, while other components of the same action still are. On an `<omakase-play-button>`, the attribute only replaces the play / pause key; `K` still resets the playback rate and pauses. On an `<omakase-mute-button>`, it only replaces the mute / unmute key; the volume keys still work.
- **Key strings.** Only a single key string is supported, not several keys or a key object. An empty attribute (`shortcut=""`) means no key, like `null` in `keyboardShortcuts`. An invalid key string is reported in the console and ignored.
- **Precedence.** A component's key takes precedence over the control bar's action keys, including remapped ones. The component's shortcut follows the same rules as the others: it does nothing while the component or its shortcut is disabled, a time skip button's key repeats while held down, and it doesn't work in a control bar with `keyboardShortcutsEnabled` set to `false`.
- **Runtime changes.** Changing the attribute, or the `shortcut` property, at runtime takes effect on the next key press.

### Multiple Control Bars

When several control bars are shown at once, each key press is handled by only one of them: the first created control bar where the key is bound to a shortcut, that contains the matching control, where that control is currently enabled and its shortcut isn't disabled. For example, with two control bars that both contain an `<omakase-mark-in-button>`, `I` acts on the first control bar's button, unless it's disabled or has its shortcut disabled, in which case it acts on the second one's.

Set `shortcut-disabled` on a single control to hand only its shortcut over to the next control bar, or set `keyboardShortcutsEnabled` to `false` to disable all shortcuts of a control bar, handing them over to the next control bar:

```javascript
const secondaryControlBar = new ControlBar(
  {
    controlBarHTMLElementId: 'secondary-control-bar',
    templateHTMLElementId: 'secondary-control-bar-template',
    keyboardShortcutsEnabled: false,
  },
  omakasePlayer
);
```
