import React from "react";
import { Image, StyleSheet, View } from "react-native";

const LOGO_ASSET = require("../../assets/icon.png");

interface BrandShieldProps {
  size?: number;
}

export function BrandShield({ size = 44 }: BrandShieldProps) {
  const radius = Math.round(size * 0.27);
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      <Image
        source={LOGO_ASSET}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.36)",
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
});
