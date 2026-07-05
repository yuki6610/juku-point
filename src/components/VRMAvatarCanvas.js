"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RotatingAvatar from "./RotatingAvatar";

export default function VRMAvatarCanvas({
  url,
  height = 320,
}) {
  if (!url) return null;

  return (
    <div
      style={{
        width: "100%",
        height,
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
        }}
        performance={{ min: 0.5 }}
        camera={{
          position: [0, 1.4, 2.2],
          fov: 35,
        }}
      >
        <ambientLight intensity={2} />
        <directionalLight position={[2, 5, 2]} intensity={2} />

        <RotatingAvatar
          url={url}
          scale={1.2}
        />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
