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
        <Canvas style={styles.canvas} camera={{ fov: 30, near: 0.05, far: 20, position: [0, 1.5, 1.2] }}>
          <color attach="background" args={['#e7eef6']} />
          <ambientLight intensity={0.42} color="#f3eee8" />
          <directionalLight position={[0.35, 2.1, 1.7]} intensity={1.55} color="#fff4ea" />
          <directionalLight position={[-1.2, 1.3, 0.8]} intensity={0.42} color="#d5e3f6" />
          <directionalLight position={[0.1, 1.9, -1.5]} intensity={0.7} />
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
    if (!framed.current) {
      avatar.frameCamera(camera as PerspectiveCamera);
      framed.current = true;
    }
    applyPose(avatar, animator.sample(state.clock.elapsedTime));
  });

  return <primitive object={avatar.scene} />;
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e7eef6',
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
