"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import VRMAvatar from "./VRMAvatar";

export default function RotatingAvatar({ url, ...props }) {
  const ref = useRef();
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let intervalId;

    const updateLoop = () => {
      window.clearInterval(intervalId);
      if (document.hidden) return;

      intervalId = window.setInterval(invalidate, 1000 / 15);
    };

    updateLoop();
    document.addEventListener("visibilitychange", updateLoop);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", updateLoop);
    };
  }, [invalidate]);

  useFrame(({ clock }) => {
    if (ref.current) {
      const time = clock.getElapsedTime();
      ref.current.rotation.y = Math.sin(time * 0.45) * 0.12;
      ref.current.position.y = Math.sin(time * 1.7) * 0.008;
    }
  });

  return (
    <group ref={ref}>
      <VRMAvatar url={url} {...props} />
    </group>
  );
}
