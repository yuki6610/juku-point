"use client";
import React from "react";

export default function BaseAvatar({ colors = {} }) {
  const skin = colors.skinColor || "#f5d0c5";
  const body = colors.bodyColor || "#3b82f6";

  return (
    <group>
      {/* 頭 */}
      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color={skin} />
      </mesh>

      {/* 胴体 */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.0, 1.2, 0.6]} />
        <meshStandardMaterial color={body} />
      </mesh>

      {/* 腕 */}
      <mesh position={[0.8, 0.5, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.3]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-0.8, 0.5, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.3]} />
        <meshStandardMaterial color={body} />
      </mesh>

      {/* 足 */}
      <mesh position={[0.35, -0.4, 0]}>
        <boxGeometry args={[0.45, 1.2, 0.45]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-0.35, -0.4, 0]}>
        <boxGeometry args={[0.45, 1.2, 0.45]} />
        <meshStandardMaterial color={body} />
      </mesh>
    </group>
  );
}
