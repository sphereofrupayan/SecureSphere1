const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const WEBRTC_PROGUARD_RULES = `
# SecureSphere: Prevent R8 missing-class failure for org.webrtc.Dav1dDecoder$Natives
-dontwarn org.webrtc.**
-keep class org.webrtc.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
`;

module.exports = function withWebRtcProguard(config) {
  return withDangerousMod(config, [
    "android",
    async modConfig => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro"
      );
      let contents = "";
      if (fs.existsSync(proguardPath)) {
        contents = fs.readFileSync(proguardPath, "utf8");
      }
      if (!contents.includes("-dontwarn org.webrtc.**")) {
        fs.writeFileSync(proguardPath, `${contents.trimEnd()}\n${WEBRTC_PROGUARD_RULES}`, "utf8");
      }
      return modConfig;
    },
  ]);
};
