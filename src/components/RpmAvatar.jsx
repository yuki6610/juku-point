"use client";

import { useGLTF } from "@react-three/drei";

const DEFAULT_AVATAR_URL = "https://models.readyplayer.me/698697a06eb4878bb8524841.glb";

export default function RpmAvatar({ url, scale = 1.2 }) {
  const safeUrl = url || DEFAULT_AVATAR_URL;
  if (!safeUrl) return null;

  const { scene } = useGLTF(safeUrl);

  scene.position.set(0, -1.2, 0);
  scene.scale.setScalar(scale);

  return <primitive object={scene} />;
}
