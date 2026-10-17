# @usamanawaz/react-native-ai-avatar

A 3D avatar for Expo and React Native. It blinks, looks toward the camera, changes expression, and moves its mouth while the device speaks.

Works with Expo SDK 57 on Android, iOS, and web.

## Install

The package is not on the npm registry yet. Install it from GitHub, then add the Expo modules it needs:

```bash
npm install github:Usama1661/ai-avatar-repo
npx expo install expo-gl expo-asset expo-file-system expo-speech three @react-three/fiber jpeg-js
```

`expo-gl` includes native code. Use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) if Expo Go does not include it. On web, `react-dom` and `react-native-web` are also required.

## Metro

Add `glb` as an asset, and load Three from its ESM build. The CommonJS build calls `process.emitWarning` and crashes in React Native.

```js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gltf');

const threeEsmEntry = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeEsmEntry };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
```

## Use

```tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import { AIAvatar, type AIAvatarHandle } from '@usamanawaz/react-native-ai-avatar';

export function Screen() {
  const avatar = useRef<AIAvatarHandle>(null);

  return (
    <View style={{ flex: 1 }}>
      <AIAvatar
        ref={avatar}
        model="male"
        outfit="casual"
        expression="neutral"
        enableBlinking
        enableHeadMovement
        enableEyeMovement
      />
      <Button title="Speak" onPress={() => avatar.current?.speak('Hello. How can I help you today?')} />
      <Button title="Stop" onPress={() => avatar.current?.stop()} />
    </View>
  );
}
```

`speak` uses the system voice and resolves when speech ends. `stop` cuts it off.

## Props

| Prop | Default | What it does |
| --- | --- | --- |
| `model` | `"male"` | Bundled character. `"female"` is reserved and not included yet. |
| `outfit` | none | `"casual"` wears the black crew-neck. Leave it unset for the default male model. |
| `expression` | `"neutral"` | `neutral`, `happy`, `sad`, `angry`, `surprised`, or `thinking`. |
| `enableBlinking` | `true` | Blinks on its own. |
| `enableHeadMovement` | `true` | Small idle motion. While speaking, the head stays aimed at the camera. |
| `enableEyeMovement` | `true` | Eyes look toward the person in front of the phone. |
| `voice` | system speech | Your own `VoiceProvider`, if you do not want `expo-speech`. |
| `style` | | Style for the avatar frame. The frame needs a height, or `flex: 1` inside a parent that has one. |

## Notes

Lip sync follows the words from on-device speech. It is timed from spelling and word boundaries, not from a phoneme track.

Give the avatar a tall area. A face-and-chest framing is built in, and a short box will crop the head.

If the panel stays a flat color on the iOS Simulator, run the same build on a phone. Simulator OpenGL often cannot draw this scene.
