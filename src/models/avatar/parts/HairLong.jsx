"use client";
import React from "react";

export default function HairLong({ color = "#3b3b3b" }) {
  return (
    <group position={[0, 1.55, 0]}>
      {/* 前髪 */}
      <mesh position={[0, -0.1, 0.42]}>
        <boxGeometry args={[1.2, 0.5, 0.15]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* サイドのロング */}
      <mesh position={[0.75, -0.4, 0]}>
        <boxGeometry args={[0.3, 1.6, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.75, -0.4, 0]}>
        <boxGeometry args={[0.3, 1.6, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* 背中側の髪 */}
      <mesh position={[0, -0.4, -0.4]}>
        <boxGeometry args={[1.2, 1.8, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
