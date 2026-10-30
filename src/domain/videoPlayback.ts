export const VIDEO_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function supportedPlaybackRate(value: number): value is (typeof VIDEO_PLAYBACK_RATES)[number] {
  return VIDEO_PLAYBACK_RATES.some(rate => rate === value);
}
