// @vitest-environment jsdom
import {describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';

// see slate-player-controller.test.ts
vi.mock('../../src/media', () => ({}));

import {ChromingMediaStore} from '../../src/chroming/chroming-media-store';
import {PlayerEventType, type PlayerEvent} from '../../src/player/player-event';
import type {PlayerApi, PlayerPlayback} from '../../src/player';

const createMediaStore = () => {
  let handlers: ((state: any) => void)[] = [];
  let state: any = {mediaPaused: true, mediaEnded: false, mediaIsFullscreen: false};
  return {
    handlers,
    setState: (nextState: object) => {
      state = {...state, ...nextState};
      handlers.forEach((handler) => handler(state));
    },
    dispatch: vi.fn(),
    getState: () => state,
    subscribe: vi.fn((handler: (state: any) => void) => {
      handlers.push(handler);
      handler(state);
      return () => handlers.splice(handlers.indexOf(handler), 1);
    }),
  };
};

const createPlayer = (playback: Partial<PlayerPlayback>, isMainMediaLoaded = true) => {
  let onEvent$ = new Subject<PlayerEvent>();
  let player = {
    onEvent$,
    isMainMediaLoaded,
    playerSession: {playback},
    play: vi.fn(),
    pause: vi.fn(),
  };
  return player;
};

describe('ChromingMediaStore', () => {
  it('subscribes to wrapped store right away and keeps the subscription until destroyed', () => {
    let mediaStore = createMediaStore();
    let store = new ChromingMediaStore(mediaStore);
    expect(mediaStore.handlers.length).toBe(1);

    let unsubscribe = store.subscribe(() => {});
    unsubscribe();
    expect(mediaStore.handlers.length).toBe(1);

    store.destroy();
    expect(mediaStore.handlers.length).toBe(0);
  });

  it('takes playback state from the player and the rest of state from wrapped store', () => {
    let mediaStore = createMediaStore();
    let store = new ChromingMediaStore(mediaStore);
    let states: any[] = [];
    store.subscribe((state) => states.push(state));
    expect(states.at(-1)).toMatchObject({mediaPaused: true, mediaEnded: false});

    let player = createPlayer({playing: true, ended: false});
    store.player = player as unknown as PlayerApi;
    expect(states.at(-1)).toMatchObject({mediaPaused: false, mediaEnded: false});

    // media element pauses, ie. while playing detached or seeking in steps
    mediaStore.setState({mediaPaused: true, mediaIsFullscreen: true});
    expect(states.at(-1)).toMatchObject({mediaPaused: false, mediaIsFullscreen: true});

    player.onEvent$.next({type: PlayerEventType.PLAYER_PLAYBACK_CHANGE, data: {playerPlayback: {playing: false, ended: true} as PlayerPlayback}});
    expect(states.at(-1)).toMatchObject({mediaPaused: true, mediaEnded: true});
    expect(store.getState()).toMatchObject({mediaPaused: true, mediaEnded: true, mediaIsFullscreen: true});

    player.isMainMediaLoaded = false;
    player.onEvent$.next({type: PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED, data: {mainMediaId: 'main'}});
    expect(states.at(-1)).toMatchObject({mediaPaused: true, mediaEnded: false});
  });

  it('plays and pauses the player on playback requests, dispatches other requests to wrapped store', () => {
    let mediaStore = createMediaStore();
    let store = new ChromingMediaStore(mediaStore);
    let player = createPlayer({playing: false});
    store.player = player as unknown as PlayerApi;

    store.dispatch({type: 'mediaplayrequest'});
    expect(player.play).toHaveBeenCalled();
    store.dispatch({type: 'mediapauserequest'});
    expect(player.pause).toHaveBeenCalled();
    expect(mediaStore.dispatch).not.toHaveBeenCalled();

    store.dispatch({type: 'mediaenterfullscreenrequest'});
    expect(mediaStore.dispatch).toHaveBeenCalledWith({type: 'mediaenterfullscreenrequest'});

    player.isMainMediaLoaded = false;
    store.dispatch({type: 'mediaplayrequest'});
    expect(player.play).toHaveBeenCalledTimes(1);
  });
});
