import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { adminApi } from "@/api";
import { Button, Card, FeedbackBanner, Input, ScreenContainer, StatusBadge } from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { colors, radii, spacing, typography } from "@/theme";
import type { AdminUserRecord } from "@/types";
import { isApiError } from "@/types";

export default function AdminConsoleScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(
    null
  );

  // Reset password modal state
  const [pwdTarget, setPwdTarget] = useState<AdminUserRecord | null>(null);
  const [pwdDraft, setPwdDraft] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminApi.getAdminUsers();
      setUsers(list);
    } catch (err) {
      setFeedback({
        tone: "error",
        text: isApiError(err) ? err.message : "Unable to load accounts.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) {
      void loadUsers();
    }
  }, [loadUsers, user?.isAdmin]);

  if (!user?.isAdmin) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.deniedWrap}>
          <Ionicons name="shield-half-outline" size={44} color={colors.danger} />
          <Text style={styles.title}>Admin Access Required</Text>
          <Text style={styles.subtitle}>
            Only authenticated administrators can manage user accounts and exports.
          </Text>
          <Button label="Go Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  const handleCreateUser = async () => {
    setFeedback(null);
    const uname = newUsername.trim();
    if (uname.length < 3 || newPassword.length < 6) {
      setFeedback({
        tone: "error",
        text: "Username must be 3–30 chars and password at least 6 chars.",
      });
      return;
    }
    setCreating(true);
    try {
      const res = await adminApi.createAdminUser({ username: uname, password: newPassword });
      setNewUsername("");
      setNewPassword("");
      setFeedback({ tone: "success", text: res.message });
      await loadUsers();
    } catch (err) {
      setFeedback({
        tone: "error",
        text: isApiError(err) ? err.message : "Unable to create user.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!pwdTarget) return;
    if (pwdDraft.length < 6) {
      setFeedback({ tone: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setSavingPwd(true);
    try {
      const res = await adminApi.updateAdminUserPassword(pwdTarget.id, pwdDraft);
      setPwdTarget(null);
      setPwdDraft("");
      setFeedback({ tone: "success", text: res.message });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: isApiError(err) ? err.message : "Unable to update password.",
      });
    } finally {
      setSavingPwd(false);
    }
  };

  const handleToggleRole = (target: AdminUserRecord) => {
    const nextIsAdmin = !Boolean(target.is_admin);
    Alert.alert(
      nextIsAdmin ? "Promote to Admin" : "Remove Admin Role",
      `${nextIsAdmin ? "Grant administrator privileges to" : "Revoke administrator privileges from"} ${target.username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              const res = await adminApi.updateAdminUserRole(target.id, nextIsAdmin);
              setFeedback({ tone: "success", text: res.message });
              await loadUsers();
            } catch (err) {
              setFeedback({
                tone: "error",
                text: isApiError(err) ? err.message : "Unable to change role.",
              });
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = (target: AdminUserRecord) => {
    Alert.alert("Delete Account", `Permanently delete user "${target.username}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await adminApi.deleteAdminUser(target.id);
            setFeedback({ tone: "success", text: res.message });
            await loadUsers();
          } catch (err) {
            setFeedback({
              tone: "error",
              text: isApiError(err) ? err.message : "Unable to delete user.",
            });
          }
        },
      },
    ]);
  };

  const handleExport = async (format: "csv" | "pdf") => {
    setExporting(format);
    setFeedback(null);
    try {
      await adminApi.exportAdminDatabase(format);
      setFeedback({ tone: "success", text: `Exported ${format.toUpperCase()} database report.` });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: isApiError(err) ? err.message : `Unable to export ${format.toUpperCase()}.`,
      });
    } finally {
      setExporting(null);
    }
  };

  const friendCount = users.filter(u => !u.is_admin).length;

  return (
    <ScreenContainer scroll keyboardAware edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>Admin Console</Text>
          <Text style={styles.subtitle}>Manage SecureSphere accounts & exports</Text>
        </View>
        <StatusBadge label="Admin" tone="primary" />
      </View>

      {feedback ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone={feedback.tone}
            message={feedback.text}
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : null}

      {/* Stats */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{users.length}</Text>
          <Text style={styles.statLabel}>Total Accounts</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{friendCount}</Text>
          <Text style={styles.statLabel}>Member Accounts</Text>
        </Card>
      </View>

      {/* Database Exports */}
      <Card variant="elevated" style={styles.cardGap}>
        <Text style={styles.sectionHeading}>Database Exports</Text>
        <Text style={styles.muted}>
          Download accounts metadata and room chat logs from SQLite (password hashes are never
          exported).
        </Text>
        <View style={styles.exportRow}>
          <View style={styles.flexOne}>
            <Button
              label="Export CSV"
              variant="secondary"
              loading={exporting === "csv"}
              onPress={() => void handleExport("csv")}
              icon={<Ionicons name="document-text-outline" size={17} color={colors.text} />}
            />
          </View>
          <View style={styles.flexOne}>
            <Button
              label="Export PDF"
              variant="secondary"
              loading={exporting === "pdf"}
              onPress={() => void handleExport("pdf")}
              icon={<Ionicons name="document-outline" size={17} color={colors.text} />}
            />
          </View>
        </View>
      </Card>

      {/* Create Friend Account */}
      <Card variant="elevated" style={styles.cardGap}>
        <Text style={styles.sectionHeading}>Create Account</Text>
        <View style={styles.formStack}>
          <Input
            label="Username"
            placeholder="3–30 chars (letters, numbers, _, ., -)"
            leftIcon="person-add-outline"
            autoCapitalize="none"
            value={newUsername}
            onChangeText={setNewUsername}
          />
          <Input
            label="Password"
            placeholder="At least 6 characters"
            leftIcon="lock-closed-outline"
            isPassword
            autoCapitalize="none"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Button
            label="Create Account"
            loading={creating}
            onPress={() => void handleCreateUser()}
          />
        </View>
      </Card>

      {/* User Directory */}
      <Card>
        <Text style={styles.sectionHeading}>Registered Accounts ({users.length})</Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryBright} style={{ paddingVertical: 20 }} />
        ) : (
          <View style={styles.userList}>
            {users.map(u => (
              <View key={u.id} style={styles.userRow}>
                <View style={styles.flexOne}>
                  <View style={styles.userTitleRow}>
                    <Text style={styles.userName}>{u.username}</Text>
                    <StatusBadge
                      label={u.is_admin ? "Admin" : "Member"}
                      tone={u.is_admin ? "primary" : "neutral"}
                    />
                  </View>
                  <Text style={styles.muted}>ID #{u.id}</Text>
                </View>

                <View style={styles.userActions}>
                  <Pressable
                    onPress={() => {
                      setPwdTarget(u);
                      setPwdDraft("");
                    }}
                    style={styles.miniBtn}
                    accessibilityLabel="Reset password"
                  >
                    <Ionicons name="key-outline" size={16} color={colors.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleToggleRole(u)}
                    style={styles.miniBtn}
                    accessibilityLabel="Toggle admin role"
                  >
                    <Ionicons
                      name={u.is_admin ? "shield" : "shield-outline"}
                      size={16}
                      color={colors.primaryBright}
                    />
                  </Pressable>
                  {!u.is_admin ? (
                    <Pressable
                      onPress={() => handleDeleteUser(u)}
                      style={[styles.miniBtn, styles.miniDanger]}
                      accessibilityLabel="Delete user"
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Reset Password Modal */}
      <Modal
        visible={Boolean(pwdTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setPwdTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionHeading}>
              Reset Password for {pwdTarget?.username}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={pwdDraft}
              onChangeText={setPwdDraft}
              autoFocus
            />
            <View style={styles.exportRow}>
              <View style={styles.flexOne}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setPwdTarget(null)}
                />
              </View>
              <View style={styles.flexOne}>
                <Button
                  label="Update"
                  loading={savingPwd}
                  onPress={() => void handleResetPassword()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  backBtn: {
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
    ...typography.title,
    fontSize: 20,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  gap: {
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    ...typography.hero,
    color: colors.primaryBright,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  cardGap: {
    marginBottom: spacing.lg,
    gap: spacing.sm + 2,
  },
  sectionHeading: {
    ...typography.heading,
    fontSize: 16,
    color: colors.text,
  },
  muted: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  exportRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  formStack: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  userList: {
    marginTop: spacing.sm,
    gap: spacing.sm + 2,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  userName: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  userActions: {
    flexDirection: "row",
    gap: 6,
  },
  miniBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  miniDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  deniedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalInput: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
});
