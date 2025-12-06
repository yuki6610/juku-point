"use client";

import { useGLTF } from "@react-three/drei";

/**
 * Ready Player Me アバターを読み込むモデルコンポーネント
 * - Canvas は含まない（外側で描画する）
 * - scale / position は適宜調整可能
 */
export default function RpmAvatar({ url, scale = 1.2 }) {
  const { scene } = useGLTF(url);

  // モデルが巨大なので下にオフセット
  scene.position.set(0, -1.2, 0);

  return <primitive object={scene} scale={scale} />;
}
