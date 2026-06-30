"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import VRMAvatar from "./VRMAvatar";

export default function RotatingAvatar({ url, ...props }) {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.01;
    }
  });

  return (
    <group ref={ref}>
      <VRMAvatar url={url} {...props} />
    </group>
  );
}
