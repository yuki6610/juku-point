// src/components/RotatingAvatar.js
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import RpmAvatar from "./RpmAvatar";

export default function RotatingAvatar({ url, ...props }) {
  const ref = useRef();

  // 毎フレーム回転（0.01 は速度）
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.01;
    }
  });

  return (
    <group ref={ref}>
      <RpmAvatar url={url} {...props} />
    </group>
  );
}
