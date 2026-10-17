import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import type { PerspectiveCamera } from 'three';

import type { AvatarAnimator } from '../animation/animator';
import { loadAvatar, type LoadedAvatar } from '../model/loadAvatar';
import { applyPose } from './applyPose';

type AvatarStageProps = {
  source: number;
  animator: AvatarAnimator;
};

export function AvatarStage({ source, animator }: AvatarStageProps) {
  const [avatar, setAvatar] = useState<LoadedAvatar | null>(null);
  const [status, setStatus] = useState('Loading avatar…');

  useEffect(() => {
    let active = true;
    let loaded: LoadedAvatar | null = null;
    setAvatar(null);
    setStatus('Loading avatar…');
    loadAvatar(source, (progress) => {
      if (active) setStatus(progress);
    })
      .then((next) => {
        if (!active) {
          next.dispose();
          return;
        }
        loaded = next;
        setAvatar(next);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus(reason instanceof Error ? reason.message : 'Could not load the avatar.');
      });
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, [source]);

  const loading = status.endsWith('…');

  return (
    <View style={styles.frame}>
      {avatar ? (
        <Canvas
          style={styles.canvas}
          // MSAA is unreliable on the iOS Simulator's OpenGL stack.
          gl={{ antialias: false }}
          camera={{ fov: 32, near: 0.01, far: 40, position: [0, 0.85, 3.2] }}
          onCreated={({ gl }) => {
            const context = gl.getContext();
            console.log(
              `avatar gl ${context.drawingBufferWidth}x${context.drawingBufferHeight}`,
            );
          }}
        >
          <color attach="background" args={['#dce6f2']} />
          <hemisphereLight args={['#f7f1ea', '#9eb0c8', 0.7]} />
          <ambientLight intensity={0.35} color="#f3eee8" />
          <directionalLight position={[0.45, 2.2, 1.6]} intensity={1.65} color="#fff4ea" />
          <directionalLight position={[-1.1, 1.4, 0.9]} intensity={0.5} color="#d5e3f6" />
          <directionalLight position={[0.15, 1.7, -1.4]} intensity={0.55} color="#ffe8d6" />
          <AvatarModel avatar={avatar} animator={animator} />
        </Canvas>
      ) : (
        <View style={styles.status}>
          {loading ? <ActivityIndicator color="#243044" /> : null}
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}
    </View>
  );
}

function AvatarModel({ avatar, animator }: { avatar: LoadedAvatar; animator: AvatarAnimator }) {
  const camera = useThree((state) => state.camera);
  const framed = useRef(false);

  useFrame((state) => {
    applyPose(avatar, animator.sample(state.clock.elapsedTime));
    if (!framed.current) {
      framed.current = avatar.frameCamera(camera as PerspectiveCamera);
    }
  });

  return <primitive object={avatar.scene} />;
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 320,
    borderRadius: 16,
    // overflow:hidden on an iOS parent clips the OpenGL layer, so the view
    // stays the background color even while the GL context is rendering.
    backgroundColor: '#dce6f2',
  },
  canvas: {
    flex: 1,
  },
  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  statusText: {
    color: '#243044',
    fontSize: 15,
    textAlign: 'center',
  },
});
