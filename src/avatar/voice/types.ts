import type { VisemeCue } from '../model/visemes';
import type { SpeakRequest } from '../types';

export type SpeechResult = {
  /** Playable file when the provider synthesizes audio. System TTS may omit this. */
  audioUri?: string;
  durationMs?: number;
  visemes?: VisemeCue[];
};

/**
 * One implementation per engine. The avatar never calls a TTS SDK directly.
 * First planned adapter is on-device system speech. A later adapter can be
 * an offline neural voice that also returns a viseme track.
 */
export type VoiceProvider = {
  readonly id: string;
  speak(request: SpeakRequest): Promise<SpeechResult>;
  stop(): Promise<void>;
};
