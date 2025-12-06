"use client";
import React from "react";

export default function Hoodie({ color = "#22c55e" }) {
  return (
    <group>
      {/* 本体 */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.05, 1.15, 0.65]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* フード（後ろ） */}
      <mesh position={[0, 1.25, -0.3]}>
        <boxGeometry args={[0.9, 0.7, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
