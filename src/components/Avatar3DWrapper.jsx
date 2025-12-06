"use client";

import React from "react";
import BaseAvatar from "@/models/avatar/BaseAvatar";
import FaceSimple from "@/models/avatar/FaceSimple";
import HairShort from "@/models/avatar/parts/HairShort";
import HairLong from "@/models/avatar/parts/HairLong";
import Skirt from "@/models/avatar/parts/Skirt";

export default function Avatar3DWrapper({ avatarType = "base", avatarColors = {} }) {
  return (
    <group position={[0, 0, 0]}>
      {/* 本体（BaseAvatar） */}
      <BaseAvatar colors={avatarColors} />

      {/* 顔パーツ */}
      <FaceSimple />

      {/* 髪型切り替え */}
      {avatarType === "short" && <HairShort />}
      {avatarType === "long" && <HairLong />}

      {/* スカート装備は任意 */}
      {avatarType === "skirt" && <Skirt />}
    </group>
  );
}
