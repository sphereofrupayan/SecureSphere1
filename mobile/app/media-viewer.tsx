import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { API_ENDPOINTS, mediaApi } from "@/api";
import { Button, Card, FeedbackBanner, ScreenContainer } from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { colors, radii, spacing, typography } from "@/theme";
import { formatFileSize } from "@/utils/format";

export default function MediaViewerScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{
    mediaId: string;
    originalName?: string;
    mimeType?: string;
    mediaKind?: string;
    fileSize?: string;
    uploaderUsername?: string;
  }>();

  const mediaId = String(params.mediaId || "");
  const originalName = String(params.originalName || "Attachment");
  const mimeType = String(params.mimeType || "application/octet-stream");
  const mediaKind = String(params.mediaKind || "file");
  const fileSize = Number(params.fileSize || 0);

  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!mediaId || !["code", "document"].includes(mediaKind)) return;
    let active = true;
    setLoadingPreview(true);
    void (async () => {
      try {
        const text = await mediaApi.fetchMediaTextPreview(mediaId);
        if (active) setTextPreview(text);
      } catch (err) {
        if (active) {
          setFeedback({
            tone: "error",
            text: err instanceof Error ? err.message : "Preview unavailable.",
          });
        }
      } finally {
        if (active) setLoadingPreview(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mediaId, mediaKind]);

  const handleDownloadShare = async () => {
    setDownloading(true);
    setFeedback(null);
    try {
      await mediaApi.downloadAndShareAuthenticatedFile(
        `${API_ENDPOINTS.mediaById(mediaId)}?download=1`,
        originalName,
        mimeType
      );
      setFeedback({ tone: "success", text: "File ready." });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Unable to download file.",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScreenContainer padded={false} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title} numberOfLines={1}>
            {originalName}
          </Text>
          <Text style={styles.subtitle}>
            {formatFileSize(fileSize)}
            {params.uploaderUsername ? ` · Uploaded by ${params.uploaderUsername}` : ""}
          </Text>
        </View>
      </View>

      {feedback ? (
        <View style={styles.bannerWrap}>
          <FeedbackBanner
            tone={feedback.tone}
            message={feedback.text}
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : null}

      <View style={styles.stage}>
        {mediaKind === "image" && token ? (
          <Image
            source={{
              uri: mediaApi.getMediaAbsoluteUrl(mediaId),
              headers: { Authorization: `Bearer ${token}` },
            }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        ) : loadingPreview ? (
          <ActivityIndicator size="large" color={colors.primaryBright} />
        ) : textPreview !== null ? (
          <ScrollView style={styles.codeScroll} contentContainerStyle={styles.codeWrap}>
            <Text style={styles.codeText} selectable>
              {textPreview}
            </Text>
          </ScrollView>
        ) : (
          <Card style={styles.fileCard}>
            <Ionicons name="document-outline" size={44} color={colors.primaryBright} />
            <Text style={styles.fileName}>{originalName}</Text>
            <Text style={styles.fileMeta}>{mimeType}</Text>
            <Text style={styles.fileMeta}>{formatFileSize(fileSize)}</Text>
          </Card>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          label="Download / Share File"
          loading={downloading}
          onPress={() => void handleDownloadShare()}
          icon={<Ionicons name="share-outline" size={18} color={colors.onPrimary} />}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  bannerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  fullImage: {
    width: "100%",
    height: "100%",
    borderRadius: radii.md,
  },
  codeScroll: {
    width: "100%",
    flex: 1,
    backgroundColor: colors.surfaceInset,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeWrap: {
    padding: spacing.md,
  },
  codeText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  fileCard: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
  },
  fileName: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  fileMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
