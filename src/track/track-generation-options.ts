import {type AudioObservationTrackGenerationOptions, TrackType} from '../media';

/** Maps some {@link TrackType} to its concrete generation-options type. */
export type TrackGenerationOptionsMap = {
  /** Generation options for audio observation tracks. */
  [TrackType.AUDIO]: AudioObservationTrackGenerationOptions;
};
/**
 * Discriminated union of some track generation-options types.
 * The optional `trackType` field narrows the union to the options for a specific track type.
 */
export type TrackGenerationOptions = {
  [T in keyof TrackGenerationOptionsMap]: {
    trackType?: T;
  } & TrackGenerationOptionsMap[T];
}[keyof TrackGenerationOptionsMap];
