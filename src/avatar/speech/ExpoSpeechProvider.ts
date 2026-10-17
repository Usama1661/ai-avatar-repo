import * as Speech from 'expo-speech';

import type { SpeakRequest } from '../types';
import type { VoiceProvider } from '../voice/types';

export type ExpoSpeakRequest = SpeakRequest & {
  onBoundary?: (event: { charIndex: number; charLength: number }) => void;
};

/**
 * On-device system voice. Word boundaries keep mouth shapes aligned with
 * speech; phoneme-accurate tracks still come from the animator.
 */
export function createExpoSpeechProvider(): VoiceProvider {
  return {
    id: 'expo-speech',
    speak(request) {
      const spoken = request as ExpoSpeakRequest;
      return new Promise((resolve, reject) => {
        Speech.speak(spoken.text, {
          voice: spoken.voiceId,
          rate: 0.92,
          onBoundary: (event: { charIndex?: number; charLength?: number } | unknown) => {
            const native = event as { charIndex?: number; charLength?: number };
            if (typeof native.charIndex === 'number') {
              spoken.onBoundary?.({
                charIndex: native.charIndex,
                charLength: native.charLength ?? 1,
              });
            }
          },
          onDone: () => resolve({}),
          onStopped: () => resolve({}),
          onError: (error) => reject(error),
        });
      });
    },
    async stop() {
      await Speech.stop();
    },
  };
}
