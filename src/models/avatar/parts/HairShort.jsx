"use client";
import React from "react";

export default function HairShort({ color = "#3b3b3b" }) {
  return (
    <group position={[0, 1.55, 0]}>
      {/* 前髪 */}
      <mesh position={[0, -0.1, 0.42]}>
        <boxGeometry args={[1.1, 0.4, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* サイド */}
      <mesh position={[0.6, -0.2, 0]}>
        <boxGeometry args={[0.2, 0.8, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.6, -0.2, 0]}>
        <boxGeometry args={[0.2, 0.8, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* 後頭部（少し膨らみ） */}
      <mesh position={[0, -0.05, -0.3]}>
        <boxGeometry args={[1.0, 0.8, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
