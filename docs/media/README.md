# Omakase Player Chroming

This guide provides documentation on customizing and polishing chroming of the Omakase Player. It covers component structure, styling, and various implementation scenarios, allowing you to tailor the Omakase Player UI to your specific design and functional needs.

---

## What is Player Chroming?

"Chroming" refers to the visual interface layered on top of a media player and includes following capabilities

 * player controls such as play/pause, scrubber, volume and fullscreen
 * overlays such as help, BITC display
 * tracks selector 
 * various specific components as e.g.  marker bar

It's essentially the UI that wraps the core video/audio content, providing interactivity.

---

## Media Chrome Components

Omakase Player uses the [Media Chrome](https://www.media-chrome.org/) library as a base for media chroming. You can use all media chrome components in your custom chroming. Here is a list of media chrome components that are used by Omakase Player for the default chroming theme:

#### `<media-controller>`

[documentation](https://www.media-chrome.org/docs/en/components/media-controller)

#### `<media-control-bar>`

[documentation](https://www.media-chrome.org/docs/en/components/media-control-bar)

#### `<media-play-button>`

[documentation](https://www.media-chrome.org/docs/en/components/media-play-button)

#### `<media-fullscreen-button>`

[documentation](https://www.media-chrome.org/docs/en/components/media-fullscreen-button)

---

## Omakase Components

In addition to Media Chrome components, Omakase Player also uses custom Omakase components developed for the default chroming:

#### `<omakase-time-display>`

For displaying the current timecode, based on the [media-time-display](https://www.media-chrome.org/docs/en/components/media-time-display) component.

#### `<omakase-time-range>`

For the time range scrubber, based on the [media-time-range](https://www.media-chrome.org/docs/en/components/media-time-range) component.

#### `<omakase-preview-thumbnail>`

For displaying the thumbnail on hovering over the time range, based on the [media-preview-thumbnail](https://www.media-chrome.org/docs/en/components/media-preview-thumbnail) component.

#### `<omakase-volume-range>`

For controlling the output volume, based on the [media-volume-range](https://www.media-chrome.org/docs/en/components/media-volume-range) component.

#### `<omakase-mute-button>`

For muting/unmuting the output volume, based on the [media-mute-button](https://www.media-chrome.org/docs/en/components/media-mute-button) component.

---

### Omakase Dropdown Components

Omakase dropdown components are used to display the playback rate dropdown and main/sidecar audio and text dropdown in the default chroming.

#### `<omakase-dropdown>`

Container for the dropdown list(s). Content can be aligned to `left`, `center` or `right`, using the `align` attribute (default is `left`). Will be closed by clicking outside it, unless the `floating` attribute is set.

#### `<omakase-dropdown-toggle>`

Toggle for the dropdown. Requires the `dropdown` attribute to specify the id of the `<omakase-dropdown>` element.

#### `<omakase-dropdown-list>`

For displaying a list inside the `<omakase-dropdown>` component. Title can be defined using the `title` attribute (if not defined, the title will not be displayed). Width (in pixels) can be defined using the `width` attribute (default is 100px). List type can be set to `default`, `radio` or `checkbox` using the `type` attribute.

#### `<omakase-dropdown-option>`

A single dropdown option. Has `value` and `selected` attributes, similar to an HTML `<option>` tag.

---

### Omakase Marker Components

Omakase marker components are used to display the marker bar containing one or more marker tracks.

#### `<omakase-marker-bar>`

Container for the marker tracks.

#### `<omakase-marker-track>`

A single marker track. Should not be defined explicitly. (Omakase Player will create it inside the `<omakase-marker-bar>` element after calling the `createMarkerTrack` method.)

---

## Omakase Player Chroming Configuration

Omakase Player Chroming configuration should be passed during instantiation, similar to other configuration parameters:

```javascript
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    ...
  }
});
```

Chroming configuration for updatable parameters can be changed after instantiation:

```javascript
omakasePlayer.config = {
  playerChroming: {
    ...
  }
};
```

The following attributes are supported in the `PlayerChroming` object:

| Field   | Description  | Type      | Required | Updatable | Comments   |
|---------|--------------|-----------|----------|-----------|------------|
| `theme`  | Chroming theme determines how the player will be chromed.   | Constrained values: `CHROMELESS`, `DEFAULT`, `STAMP`, `CUSTOM` | Yes   | No | Default type is `DEFAULT`. `CHROMELESS` type renders the player without any chroming. |
| `themeConfig`  | Theme specific configuration     | `ThemeConfig`   | No  | No  | Configuration with attributes depending on `theme`.   |
| `thumbnailUrl`  | URL for the thumbnails (used for preview in media chrome time range)  | `string`    | No  | Yes |         |
| `thumbnailSelectionFn` | Function that allows custom handler for getting a thumbnail for given time | `function(time: number) ⇒ URL`       | No  | No     |                                                                                                    |
| `watermark`    |    | `string`   | No   | Yes    | Text string or string containing SVG XML content  |
| `watermarkVisibility` | Specifies if watermark is always visible, even when video is playing | Constrained values: `ALWAYS_ON`, `AUTO_HIDE`  | No  | No     | Default is `ALWAYS_ON`
| `styleUrl` | Specifies URL for the style customization css file | `string`       | No  | No   |   
| `fullscreenChroming` | Specifies if the fullscreen player will show chromed or default browser video controls | Constrained values: `ENABLED`, `DISABLED`       | No  | No    | Default is `ENABLED` except for `CHROMELESS` and `STAMP` themes                                                                                              |


---

The following attributes are supported in the `themeConfig` object for the `DEFAULT` theme:

| Field | Description | Type | Updatable | Comment |
|-------|-------------|------|-----------|---------|
| `controlBarVisibility`   | Specifies controls visibility | Constrained values: `DISABLED`, `ENABLED`, `FULLSCREEN_ONLY` | Yes | Default is `ENABLED`
| `controlBar` | Specifies list of enabled controls in control bar | Constrained values: `PLAY`, `FRAME_FORWARD`, `TEN_FRAMES_FORWARD`, `FRAME_BACKWARD`, `TEN_FRAMES_BACKWARD`, `BITC`, `FULLSCREEN`, `CAPTIONS`, `VOLUME`, `SCRUBBER`, `TRACKSELECTOR`, `PLAYBACK_RATE`, `DETACH` | Yes | Default: all controls
| `floatingControls`       | Specifies list of enabled floating controls | `TRACKSELECTOR`, `HELP_MENU`, `PLAYBACK_CONTROLS` | No | Default: `HELP_MENU`, `PLAYBACK_CONTROLS`
| `playbackRates` | Sets the available playback rates in menu | `number[]` | No | Default: `[0.25,0.5,0.75,1,2,4,8]`
| `trackSelectorAutoClose` | If `false`, track selection menu will keep open until explicitly closed. If `true` it will close on track selection or when clicking outside of the menu | `boolean` | No | Default: `true`
| `htmlTemplateId`   | Id of the template used for customization slots | `string` | No

---

The following attributes are supported in the `themeConfig` object for the `CUSTOM` theme:

| Field  | Description | Type | Updatable | Comment |
|--------|-------------|------|-----------|---------|
| `htmlTemplateId` | Id of the custom template used for player chroming | `string` | No | Required

---

The following attributes are supported in the `themeConfig` object for the `STAMP` theme:

| Field | Description | Type | Updatable | Comment |
|-------|-------------|------|-----------|---------|
| `floatingControls` | Specifies list of enabled floating controls | Constrained values: `PROGRESS_BAR`, `AUDIO_TOGGLE`, `TIME`, `PLAYBACK_CONTROLS`, `FULLSCREEN` | No | Default: `PROGRESS_BAR`, `AUDIO_TOGGLE`, `TIME`, `PLAYBACK_CONTROLS`
| `alwaysOnFloatingControls`   | Specifies floating control that will stay always visible | Constrained values: `PROGRESS_BAR`, `AUDIO_TOGGLE`, `TIME`, `PLAYBACK_CONTROLS`, `FULLSCREEN` | No | Default: `PROGRESS_BAR`, `AUDIO_TOGGLE`, `TIME`
| `stampScale` | Specifies how the video will fill the container | Constrained values: `FILL`, `FIT` | Yes | Default: `FIT`
| `timeFormat`       | Specifies mode of time floating component | Constrained values: `TIMECODE`, `COUNTDOWN_TIMER`, `MEDIA_TIME` | Yes | Default: `MEDIA_TIME`
| `htmlTemplateId`   | Id of the template used for customization slots | `string` | No |

The following attributes are supported in the `themeConfig` object for the `AUDIO` theme:

| Field | Description | Type | Updatable | Comment |
|-------|-------------|------|-----------|---------|
| `controlBarVisibility` | Specifies controls visibility | Constrained values: `DISABLED`, `ENABLED`| Yes | Default: `ENABLED`
| `controlBar` | Specifies list of enabled controls in control bar | Constrained values: `PLAY`, `BITC`, `CAPTIONS`, `VOLUME`, `SCRUBBER`, `TRACKSELECTOR`, `PLAYBACK_RATE` | Yes | Default: all controls
| `floatingControls` | Specifies list of enabled floating controls | `HELP_MENU`, `PLAYBACK_CONTROLS` | No | Default: all controls
| `playbackRates` | Sets the available playback rates in menu | `number[]` | No | Default: `[0.5,0.75,1,2]`
| `playerSize` | Audio player size | Constrained values: `FULL`, `COMPACT`| Yes | Default: `FULL`
| `visualization` | Audio player visualization | Constrained values: `ENABLED`, `DISABLED`| No | Default: `DISABLED`
| `visualizationConfig` | Audio player visualization configuration | `object` | No | Described in table below
| `htmlTemplateId`   | Id of the template used for customization slots | `string` | No |

The following attributes are supported in the `visualizationConfig` object for the `AUDIO` theme with `visualization` set to `ENABLED`:

| Field | Description | Type | Updatable | Comment |
|-------|-------------|------|-----------|---------|
| `strokeColor` | Specifies the border color of the bars | string | No | Default: `#9968BF`
| `fillColors` | Specifies the fill gradient colors of the bars | string[] | No | Default: [`#F79433`, `#88B840`, `#CC6984`, `#662D91`]

The following attributes are supported in the `themeConfig` object for the `EDITORIAL` theme:

| Field | Description | Type | Updatable | Comment |
|-------|-------------|------|-----------|---------|
| `floatingControls` | Specifies list of enabled floating controls | Constrained values: `PROGRESS_BAR`, `TIME`, `PLAYBACK_CONTROLS`, `HELP_MENU`, `AUDIO_TOGGLE`, `FULLSCREEN` | No | Default: all controls
| `alwaysOnFloatingControls`   | Specifies floating control that will stay always visible | Constrained values: `PROGRESS_BAR`, `TIME`, `PLAYBACK_CONTROLS` | No | Default: `TIME`
| `timeFormat`       | Specifies mode of time floating component | Constrained values: `TIMECODE`, `MEDIA_TIME` | Yes | Default: `TIMECODE`
| `controlBarPosition` | Specifies the position of the control bar relative to the video | Constrained values: `OVER_VIDEO`, `UNDER_VIDEO` | Yes | Default: `OVER_VIDEO` |
| `htmlTemplateId`   | Id of the template used for customization slots | `string` | No |

## Default Theme

Here's the default Omakase Player media chroming (with one marker track):

![Default Media Chroming](./chroming-default.png)

Visibility and behaviour of some elements of the default chroming theme can be modified with configuration. Some code samples are shown below:

```js
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    theme: PlayerChromingTheme.Default,
    thumbnailUrl: 'https://byomakase.org/thumbs.vtt',
    watermark: 'DEMO_SAMPLE',
    themeConfig: {
      controlBarVisibility: ControlBarVisibility.Enabled,
      controlBar: [DefaultThemeControl.Play, DefaultThemeControl.Scrubber, DefaultThemeControl.Volume, DefaultThemeControl.Trackselector, DefaultThemeControl.Fullscreen],
      trackSelectorAutoClose: false
    }
  }
});
```

```js
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    theme: PlayerChromingTheme.Default,
    themeConfig: {
      controlBarVisibility: ControlBarVisibility.Disabled,
      floatingControls: [DefaultThemeFloatingControl.PlaybackControls]
    }
  }
});
```

---

## Chromeless Theme

Omakase player can be initiated without chroming, by using the `CHROMELESS` theme.

```js
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    theme: PlayerChromingTheme.Chromeless
  }
});
```

---

## Stamp Theme

Stamp theme is a specialized theme focused on micro presentation (i.e. when showing multiple smaller videos on the same page).

```js
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    theme: PlayerChromingTheme.Stamp,
    themeConfig: {
      alwaysOnFloatingControls: [StampThemeFloatingControl.PlaybackControls],
      stampScale: StampThemeScale.Fit,
      timeFormat: StampTimeFormat.Timecode,
    }
  },
});
```

---

## Editorial Theme

Editorial theme is a theme with few controls in the player, geared towards scenarios in which more complex controls are implemented outside of the player (i.e. in some form of toolbar)

```js
let omakasePlayer = new OmakasePlayer({
  playerChroming: {
    theme: PlayerChromingTheme.Editorial,
    themeConfig: {
      alwaysOnFloatingControls: [EditorialThemeFloatingControl.PlaybackControls, EditorialThemeFloatingControl.Time],
      timeFormat: EditorialTimeFormat.Timecode,
    }
  },
});
```

---

## Custom Theme

You can use a combination of Media Chrome components, Omakase components, custom Web Components or plain HTML for custom chroming. You can also set up multiple Omakase Player instances with different chroming for each one. Here's an example of setting up an Omakase Player with customized chroming:

```html
<div id="omakase-player"></div>
<template id="custom-template">
  <media-control-bar>
    <omakase-marker-bar></omakase-marker-bar>
    <omakase-time-range></omakase-time-range>
  </media-control-bar>
</template>
```

```js
let omakasePlayer = new OmakasePlayer({
  playerHTMLElementId: 'omakase-player',
  playerChroming: {
    theme: 'CUSTOM',
    themeConfig: {
      htmlTemplateId: 'custom-template'
    }
  }
});
```

---

## Styling

Player chroming style can be customised by passing a css file url. The parameter `styleUrl` can be an array to provide multiple css files.

```js
let omakasePlayer = new OmakasePlayer({
  playerHTMLElementId: 'omakase-player',
  playerChroming: {
    styleUrl: './style.css'
  }
});
```

The CSS structure of the `DEFAULT` theme is shown below:

![Omakase Player CSS structure](./default-theme-diagram.svg)

The CSS structure of the `AUDIO` theme is shown below:

![Omakase Player CSS structure](./audio-theme-diagram.svg)

The CSS structure of the `STAMP` theme is shown below:

![Omakase Player CSS structure](./stamp-theme-diagram.svg)

The CSS structure of the `EDITORIAL` theme is shown below:

![Omakase Player CSS structure](./editorial-theme-diagram.svg)

Media Chrome components and Omakase components based on Media Chrome are easy to style with CSS variables. For the list of CSS variables, refer to the [Media Chrome styling reference](https://www.media-chrome.org/docs/en/reference/styling).

Here's a style customization example:

```css
omakase-time-range {
  height: 4px;
  --media-range-thumb-width: 0;
  --media-range-bar-color: red;
  --media-time-range-hover-height: 10px;
}
```

Here's what the custom chroming example combined with the styling example should look like:

![Custom Media Chroming](./chroming-custom.png)

---

## Custom slots

You can insert your own custom HTML into specified areas of certain themes. The available slots for the `DEFAULT` and `AUDIO` themes are:

| Slot                     | Position                                                                                                 |
|--------------------------|----------------------------------------------------------------------------------------------------------|
| `start-container`        | Left side of the control bar, after the playback speed dropdown toggle (1)   |
| `end-container`          | Right side of the control bar, before the audio/text selection dropdown toggle (2) |
| `top-left`               | Top left corner of the player, over the watermark area (3) |
| `top-right`              | Top right corner of the player, under the help button (4) |
| `dropdown-container`     | Above the control (5)                   |

![Custom slots in default theme](./chroming-default-slots.png)

The available slots for the `STAMP` and `EDITORIAL` themes are:

| Slot                     | Position                                                                                                 |
|--------------------------|----------------------------------------------------------------------------------------------------------|
| `top-right`              | Top right corner of the player, under the help/mute/unmute button (1)   |

![Custom slots in stamp theme](./chroming-stamp-slots.png)

Here is an example of adding a custom dropdown to the `DEFAULT` theme using custom slots:

```javascript
let omakasePlayer = new OmakasePlayer({
  playerHTMLElementId: 'omakase-player',
  playerChroming: {
    theme: 'DEFAULT',
    themeConfig: {
      htmlTemplateId: 'omakase-chroming-slots'
    }
  }
});
```

```html
<template id="omakase-chroming-slots">
  <omakase-dropdown slot="dropdown-container" id="quality">
    <omakase-dropdown-list class="quality-dropdown-list" title="Quality" width="100">
      <omakase-dropdown-option value="auto" selected>Auto</omakase-dropdown-option>
      <omakase-dropdown-option value="360">360p</omakase-dropdown-option>
      <omakase-dropdown-option value="720">720p</omakase-dropdown-option>
      <omakase-dropdown-option value="1080">1080p</omakase-dropdown-option>
    </omakase-dropdown-list>
  </omakase-dropdown>
  <omakase-dropdown-toggle slot="start-container" dropdown="quality"></omakase-dropdown-toggle>
</template>
```

```javascript
omakasePlayer.getPlayerChromingElement<OmakaseDropdownList>('.quality-dropdown-list').selectedOption$.subscribe((option) => {
  if (option) {
    omakasePlayer.loadVideo(`https://my-server.com/myvideo-${option.value}.m3u8`)
  }
});
```

## Conditional templates

Player chroming can have conditional sub-templates that are either hidden or only shown in full screen. Code example is shown below:

```html
<template id="default">
  <media-controller>
    <slot name="media" slot="media"></slot>
    <template if="!fullscreen">
        <media-control-bar>
            <media-play-button></media-play-button>
            <media-time-display show-duration></media-time-display>
            <media-time-range></media-time-range>
            <media-playback-rate-button></media-playback-rate-button>
            <media-mute-button></media-mute-button>
            <media-volume-range></media-volume-range>
        </media-control-bar>
    </template>
      <template if="fullscreen">
        <media-control-bar>
            <media-play-button></media-play-button>
        </media-control-bar>
    </template>
  </media-controller>
</template>
```

For more information on conditional templates, refer to the [Media Chrome conditionals reference](https://www.media-chrome.org/docs/en/themes#conditionals)
