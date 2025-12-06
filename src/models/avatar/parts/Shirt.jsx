"use client";
import React from "react";

export default function Shirt({ color = "#3b82f6" }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.0, 1.2, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
