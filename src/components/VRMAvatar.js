"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

export default function VRMAvatar({ url, scale = 1.2 }) {
  const { scene, invalidate } = useThree();
  const vrmRef = useRef(null);

  useEffect(() => {
    if (!url) return;

    const loader = new GLTFLoader();

    loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm;

          if (!vrm) {
            console.error("VRMが取得できません");
            return;
          }

          vrm.scene.position.set(0, -1.2, 0);
          vrm.scene.scale.setScalar(scale);

          scene.add(vrm.scene);

          vrmRef.current = vrm;
          invalidate();
        },
        undefined,
        (err) => {
          console.error("読み込み失敗", err);
        }
      );

    return () => {
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }
    };
  }, [url, scene, scale, invalidate]);

  useFrame((_, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
  });

  return null;
}
