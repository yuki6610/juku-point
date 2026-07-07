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
          vrm.scene.position.set(0, -1.2, 0);
          vrm.scene.scale.setScalar(scale);
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
