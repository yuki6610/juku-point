"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense } from "react";

// Ready Player Me の GLB を読み込むモデル
function RpmAvatar({ url }) {
  // Drei の GLTF ローダーで読み込み
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// マイページなどから呼び出す用のラッパー
export default function RpmAvatarCanvas({ url }) {
  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          color: "#64748b",
        }}
      >
        アバターが未設定です
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: 260,
      }}
    >
      <Canvas camera={{ position: [0, 1.5, 3] }}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[2, 3, 5]} intensity={1.1} />

        <Suspense fallback={null}>
          <RpmAvatar url={url} />
        </Suspense>

        <OrbitControls enableZoom={false} />
      </Canvas>
    </div>
  );
}
