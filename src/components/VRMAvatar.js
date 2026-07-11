"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

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

          VRMUtils.rotateVRM0(vrm);
          vrm.scene.position.set(0, -1.05, 0);
          vrm.scene.scale.setScalar(scale);

          // VRMは初期状態がTポーズのモデルも多いため、自然な待機姿勢に整える。
          const humanoid = vrm.humanoid;
          const setRotation = (boneName, x, y, z) => {
            const bone = humanoid?.getNormalizedBoneNode(boneName);
            if (bone) bone.rotation.set(x, y, z);
            return bone;
          };

          const idleBones = {
            hips: humanoid?.getNormalizedBoneNode("hips"),
            chest: humanoid?.getNormalizedBoneNode("chest"),
            leftUpperArm: setRotation("leftUpperArm", 0.08, 0, 1.15),
            rightUpperArm: setRotation("rightUpperArm", 0.08, 0, -1.15),
            leftLowerArm: setRotation("leftLowerArm", 0, 0.08, 0.08),
            rightLowerArm: setRotation("rightLowerArm", 0, -0.08, -0.08),
          };

          vrmRef.current = { vrm, idleBones };
          vrm.update(0);

          scene.add(vrm.scene);
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
        scene.remove(vrmRef.current.vrm.scene);
        vrmRef.current.vrm.dispose?.();
        vrmRef.current = null;
      }
    };
  }, [url, scene, scale, invalidate, onLoad, onError]);

  useFrame(({ clock }, delta) => {
    if (vrmRef.current) {
      const { vrm, idleBones } = vrmRef.current;
      const time = clock.getElapsedTime();
      const breath = Math.sin(time * 1.7);
      const sway = Math.sin(time * 0.75);

      if (idleBones.chest) idleBones.chest.rotation.x = breath * 0.018;
      if (idleBones.hips) idleBones.hips.rotation.z = sway * 0.012;
      if (idleBones.leftUpperArm) {
        idleBones.leftUpperArm.rotation.z = 1.15 + breath * 0.012;
      }
      if (idleBones.rightUpperArm) {
        idleBones.rightUpperArm.rotation.z = -1.15 - breath * 0.012;
      }

      vrm.update(delta);
    }
  });

  return null;
}
