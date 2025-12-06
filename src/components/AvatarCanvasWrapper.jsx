"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense } from "react";
import { MeshoptDecoder } from "three-stdlib";
import { DRACOLoader } from "three-stdlib";

useGLTF.preload("/draco/"); // デコーダー先読み

export default function AvatarCanvasWrapper({ url }) {
  if (!url) return <p>アバターが設定されていません</p>;

  // Ready Player Me 軽量化クエリ
  const optimizedUrl = url.includes("?")
    ? url + "&quality=low"
    : url + "?quality=low";

  return (
    <div className="avatar-canvas-wrapper">
      <Canvas
        camera={{ position: [0, 1.4, 3] }}
        gl={{
          antialias: false,
          powerPreference: "low-power",
        }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 3, 5]} intensity={1.2} />

        <Suspense fallback={null}>
          <OptimizedModel url={optimizedUrl} />
        </Suspense>

        <OrbitControls enableZoom={false} />
      </Canvas>
    </div>
  );
}

function OptimizedModel({ url }) {
  const { scene } = useGLTF(url, true, true, (loader) => {
    // Meshopt（メッシュ圧縮）
    loader.setMeshoptDecoder(MeshoptDecoder);

    // Draco（ジオメトリ圧縮）
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    loader.setDRACOLoader(dracoLoader);
  });

  return <primitive object={scene} scale={1.2} />;
}
