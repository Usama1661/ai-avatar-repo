import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AvatarAnimator } from './animation/animator';
import { avatarModelSource } from './model/catalog';
import { AvatarStage } from './rendering/AvatarStage';
import { createExpoSpeechProvider } from './speech/ExpoSpeechProvider';
import type { AvatarModelId, ExpressionName } from './types';
import type { VoiceProvider } from './voice/types';

export type AIAvatarProps = {
  model?: AvatarModelId;
  enableBlinking?: boolean;
  enableHeadMovement?: boolean;
  enableEyeMovement?: boolean;
  expression?: ExpressionName;
  style?: StyleProp<ViewStyle>;
  voice?: VoiceProvider;
};

export type AIAvatarHandle = {
  /** Speaks with the system voice and an approximate mouth rhythm. Resolves when speech ends or is stopped. */
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
};

export const AIAvatar = forwardRef<AIAvatarHandle, AIAvatarProps>(function AIAvatar(
  {
    model = 'male',
    enableBlinking = true,
    enableHeadMovement = true,
    enableEyeMovement = true,
    expression = 'neutral',
    style,
    voice,
  },
  ref,
) {
  const animatorRef = useRef<AvatarAnimator | null>(null);
  if (animatorRef.current === null) animatorRef.current = new AvatarAnimator();
  const animator = animatorRef.current;
  const voiceRef = useRef<VoiceProvider>(voice ?? createExpoSpeechProvider());
  const runRef = useRef(0);

  useEffect(() => {
    animator.setExpression(expression);
  }, [animator, expression]);

  useEffect(() => {
    animator.setFlags({
      blink: enableBlinking,
      head: enableHeadMovement,
      eyes: enableEyeMovement,
    });
  }, [animator, enableBlinking, enableEyeMovement, enableHeadMovement]);

  useEffect(() => {
    if (voice) voiceRef.current = voice;
  }, [voice]);

  useImperativeHandle(
    ref,
    () => ({
      async speak(text: string) {
        const spoken = text.trim();
        if (!spoken) return;
        const run = ++runRef.current;
        await voiceRef.current.stop();
        if (run !== runRef.current) return;
        animator.beginSpeech(spoken);
        try {
          await voiceRef.current.speak({ text: spoken });
        } finally {
          if (run === runRef.current) animator.endSpeech();
        }
      },
      async stop() {
        runRef.current += 1;
        animator.endSpeech();
        await voiceRef.current.stop();
      },
    }),
    [animator],
  );

  const source = avatarModelSource(model);
  if (source === null) {
    return (
      <View style={[styles.missing, style]}>
        <Text style={styles.missingTitle}>{model === 'female' ? 'Female' : 'Male'} avatar</Text>
        <Text style={styles.missingBody}>This model is not bundled yet.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, style]}>
      <AvatarStage source={source} animator={animator} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 320,
  },
  missing: {
    flex: 1,
    minHeight: 320,
    borderRadius: 16,
    backgroundColor: '#243044',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  missingTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
  },
  missingBody: {
    color: '#d5deea',
    fontSize: 15,
    textAlign: 'center',
  },
});
