"use client";
import React from "react";

export default function FaceSimple({ colors = {} }) {
  const skin = colors.skinColor || "#f5d0c5";

  return (
    <group>
      {/* 左目 */}
      <mesh position={[-0.2, 1.4, 0.52]}>
        <sphereGeometry args={[0.05]} />
        <meshStandardMaterial color="#000" />
      </mesh>

      {/* 右目 */}
      <mesh position={[0.2, 1.4, 0.52]}>
        <sphereGeometry args={[0.05]} />
        <meshStandardMaterial color="#000" />
      </mesh>

      {/* 口 */}
      <mesh position={[0, 1.25, 0.52]}>
        <boxGeometry args={[0.25, 0.05, 0.05]} />
        <meshStandardMaterial color="#b91c1c" />
      </mesh>
    </group>
  );
}
