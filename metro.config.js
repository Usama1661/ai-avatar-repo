const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('glb', 'gltf');

// three@0.186's "require" export is a Node CJS shim that calls process.emitWarning
// at load time. React Native's process polyfill has no emitWarning, so the app
// crashes during startup with "undefined is not a function". Load the ESM build,
// which Metro can bundle and which does not touch process.
const threeEsmEntry = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const libraryEntry = path.resolve(__dirname, 'src/avatar/index.ts');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeEsmEntry };
  }

  // The demo imports the public package name. It is this project, not an installed copy.
  if (moduleName === '@usamanawaz/react-native-ai-avatar') {
    return { type: 'sourceFile', filePath: libraryEntry };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
