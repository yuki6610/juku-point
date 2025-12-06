"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import BaseMale from "@/components/models/BaseMale";
import BaseFemale from "@/components/models/BaseFemale";

export default function Avatar3D({ type = "male", colors = {} }) {
  const Model = {
    male: BaseMale,
    female: BaseFemale,
  }[type] || BaseMale;

  return (
    <Canvas camera={{ position: [0, 1.5, 4] }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 2]} />
      <Model colors={colors} />
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}
