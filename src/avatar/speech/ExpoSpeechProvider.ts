import * as Speech from 'expo-speech';

import type { VoiceProvider } from '../voice/types';

/**
 * On-device system voice. It reports when speech starts and ends, not which
 * phoneme is playing. Mouth shapes stay in the animation clock.
 */
export function createExpoSpeechProvider(): VoiceProvider {
  return {
    id: 'expo-speech',
    speak(request) {
      return new Promise((resolve, reject) => {
        Speech.speak(request.text, {
          voice: request.voiceId,
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
