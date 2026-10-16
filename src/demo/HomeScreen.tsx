import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  AIAvatar,
  EXPRESSION_PRESETS,
  type AIAvatarHandle,
  type ExpressionName,
} from '@usamanawaz/react-native-ai-avatar';

const EXPRESSIONS = Object.keys(EXPRESSION_PRESETS) as ExpressionName[];

export function HomeScreen() {
  const avatarRef = useRef<AIAvatarHandle>(null);
  const runRef = useRef(0);
  const [text, setText] = useState('Hello! How can I help you today?');
  const [expression, setExpression] = useState<ExpressionName>('neutral');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSpeak() {
    const spoken = text.trim();
    if (!spoken) return;
    const run = ++runRef.current;
    setSpeaking(true);
    setError(null);
    try {
      await avatarRef.current?.speak(spoken);
    } catch (reason) {
      if (run === runRef.current) {
        setError(reason instanceof Error ? reason.message : 'Speech failed.');
      }
    } finally {
      if (run === runRef.current) setSpeaking(false);
    }
  }

  function onStop() {
    runRef.current += 1;
    setSpeaking(false);
    void avatarRef.current?.stop();
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AIAvatar
        ref={avatarRef}
        model="male"
        enableBlinking
        enableHeadMovement
        enableEyeMovement
        expression={expression}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.expressions}>
        {EXPRESSIONS.map((name) => (
          <Pressable
            key={name}
            onPress={() => setExpression(name)}
            style={[styles.chip, expression === name ? styles.chipSelected : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: expression === name }}
          >
            <Text style={[styles.chipLabel, expression === name ? styles.chipLabelSelected : null]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What should the avatar say?"
        placeholderTextColor="#7d8ba0"
        style={styles.input}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable
          onPress={() => void onSpeak()}
          disabled={speaking || text.trim().length === 0}
          style={[styles.button, styles.speak, speaking ? styles.buttonDisabled : null]}
          accessibilityRole="button"
        >
          <Text style={styles.speakLabel}>{speaking ? 'Speaking' : 'Speak'}</Text>
        </Pressable>
        <Pressable onPress={onStop} style={[styles.button, styles.stop]} accessibilityRole="button">
          <Text style={styles.stopLabel}>Stop</Text>
        </Pressable>
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
    padding: 20,
    paddingTop: 64,
    gap: 12,
  },
  expressions: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c5d0de',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: '#243044',
    borderColor: '#243044',
  },
  chipLabel: {
    color: '#243044',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipLabelSelected: {
    color: '#ffffff',
  },
  input: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c5d0de',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#243044',
    textAlignVertical: 'top',
  },
  error: {
    color: '#9b2c2c',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speak: {
    backgroundColor: '#243044',
  },
  stop: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c5d0de',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  speakLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopLabel: {
    color: '#243044',
    fontSize: 16,
    fontWeight: '600',
  },
});
