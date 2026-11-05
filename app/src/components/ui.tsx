import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp } from "react-native";
import { colors, elevation, radius, space, type } from "../theme";
import { statusLabel, type MeetingStatus } from "../api";

type ButtonVariant = "primary" | "ink" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, ink: colors.ink, ghost: colors.surface, danger: colors.danger }[variant];
  const fg = { primary: colors.onPrimary, ink: colors.onInk, ghost: colors.text, danger: colors.onDanger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed && variant === "primary" ? colors.primaryPressed : bg },
        variant === "ghost" && styles.ghost,
        pressed && { transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : <Text style={[type.label, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={[type.title, { marginBottom: space.sm }]}>{children}</Text>;
}

export function StatusPill({ status }: { status: MeetingStatus }) {
  const color =
    status === "ready" ? colors.success : status === "failed" ? colors.danger : colors.warning;
  const busy = status === "uploaded" || status === "transcribing" || status === "summarizing";
  return (
    <View style={styles.pill}>
      {busy ? (
        <ActivityIndicator size="small" color={color} style={{ transform: [{ scale: 0.6 }] }} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
      <Text style={[type.caption, { color }]}>{statusLabel[status]}</Text>
    </View>
  );
}

/** Brand mark: the name itself, CIXCLE, with the X in the accent green. */
export function Logo({ size = 28 }: { size?: number }) {
  const text = { fontFamily: type.headingMd.fontFamily, fontSize: size * 0.8, lineHeight: size, letterSpacing: size * 0.04, color: colors.ink };
  return (
    <Text style={text} accessibilityLabel="CIXCLE">
      CI<Text style={{ color: colors.accent }}>X</Text>CLE
    </Text>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[type.bodySm, { color: colors.textSubtle, textAlign: "center", padding: space.lg }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: { borderWidth: 1, borderColor: colors.border },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    ...elevation.e2,
  },
  pill: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
});
