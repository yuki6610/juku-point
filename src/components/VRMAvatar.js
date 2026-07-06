"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

function applyRelaxedPose(vrm) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;

  const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
  const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");

  if (leftUpperArm) leftUpperArm.rotation.z = -1.15;
  if (rightUpperArm) rightUpperArm.rotation.z = 1.15;
  if (leftLowerArm) leftLowerArm.rotation.z = -0.12;
  if (rightLowerArm) rightLowerArm.rotation.z = 0.12;
}

export default function VRMAvatar({ url, scale = 1.2, onLoad, onError }) {
  const { scene, invalidate } = useThree();
  const vrmRef = useRef(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const loader = new GLTFLoader();

    loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm;

          if (!vrm) {
            console.error("VRMが取得できません");
            onError?.(new Error("VRMデータを読み込めませんでした。"));
            return;
          }
          if (cancelled) {
            vrm.dispose?.();
            return;
          }

          vrm.scene.position.set(0, -1.2, 0);
          vrm.scene.scale.setScalar(scale);
          applyRelaxedPose(vrm);
          vrm.update(0);

          scene.add(vrm.scene);

          vrmRef.current = vrm;
          invalidate();
          onLoad?.();
        },
        undefined,
        (err) => {
          console.error("読み込み失敗", err);
          onError?.(err);
        }
      );

    return () => {
      cancelled = true;
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current.dispose?.();
        vrmRef.current = null;
      }
    };
  }, [url, scene, scale, invalidate, onLoad, onError]);

  useFrame((_, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
  });

  return null;
}
