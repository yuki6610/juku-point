"use client";
import React from "react";

export default function Skirt({ color = "#475569" }) {
  return (
    <group position={[0, -0.25, 0]}>
      {/* スカート部分（円柱） */}
      <mesh>
        <cylinderGeometry args={[0.75, 0.9, 1.0, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
