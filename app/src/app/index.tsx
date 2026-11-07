import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { showAlert } from "../alert";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { api, formatDuration, NotConfiguredError, type MeetingListItem } from "../api";
import { Button, Card, Empty, Logo, StatusPill } from "../components/ui";
import { colors, elevation, radius, space, type } from "../theme";

export default function Home() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const list = await api.list();
      setMeetings(list);
      setError(null);
      // Keep refreshing while anything is still processing.
      if (pollRef.current) clearTimeout(pollRef.current);
      if (list.some((m) => m.status !== "ready" && m.status !== "failed")) {
        pollRef.current = setTimeout(() => load(true), 4000);
      }
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "notConfigured" : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        if (pollRef.current) clearTimeout(pollRef.current);
      };
    }, [load]),
  );
  useEffect(() => () => void (pollRef.current && clearTimeout(pollRef.current)), []);

  const totalMin = Math.round(meetings.reduce((t, m) => t + (m.durationSec ?? 0), 0) / 60);
  const openActions = meetings.reduce((t, m) => t + (m.actionCount ?? 0), 0);

  const askDelete = (item: MeetingListItem) =>
    showAlert("Delete this meeting?", `"${item.title}" will be permanently deleted: recording, transcript and report. This can't be undone.`, [
      { text: "Cancel", style: "cancel" as const },
      {
        text: "Delete",
        style: "destructive" as const,
        onPress: async () => {
          setMeetings((list) => list.filter((m) => m.id !== item.id));
          try {
            await api.remove(item.id);
          } catch (e) {
            showAlert("Couldn't delete", (e as Error).message);
          }
          load(true);
        },
      },
    ]);

  const uploadFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const f = res.assets[0];
    setUploading(true);
    try {
      await api.upload({ uri: f.uri, name: f.name, mimeType: f.mimeType ?? "audio/mp4" }, { title: f.name.replace(/\.[^.]+$/, "") });
      await load(true);
    } catch (e) {
      showAlert("Upload failed", (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Logo />
        <Pressable onPress={() => router.push("/settings")} hitSlop={12} accessibilityRole="button">
          <Text style={type.label}>Settings</Text>
        </Pressable>
      </View>

      <FlatList
        data={meetings}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, paddingBottom: 160, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <View style={styles.hero}>
              <Text style={[type.caption, { color: colors.primary, letterSpacing: 1.2 }]}>YOUR MEETING ASSISTANT</Text>
              <Text style={[type.headingLg, { color: colors.onInk, marginTop: space.xs }]}>Record. Understand. Act.</Text>
              <Text style={[type.bodySm, { color: "#C9D3CB", marginTop: space.sm }]}>
                Transcripts, reports, translation and AI advice. Malay, English and Manglish all okay.
              </Text>
              <View style={styles.heroStats}>
                <HeroStat value={String(meetings.length)} label="Meetings" />
                <HeroStat value={String(totalMin)} label="Minutes" />
                <HeroStat value={String(openActions)} label="Action items" />
              </View>
            </View>
            {meetings.length ? (
              <Text style={[type.title, { marginTop: space.lg }]}>Recent</Text>
            ) : null}
            {error === "notConfigured" ? (
              <Card style={{ marginTop: space.lg }}>
                <Text style={type.title}>Connect your server</Text>
                <Text style={[type.bodySm, { marginVertical: space.sm }]}>
                  Add the CIXCLE server address in Settings to start recording.
                </Text>
                <Button label="Open settings" variant="ink" onPress={() => router.push("/settings")} />
              </Card>
            ) : error ? (
              <Text style={[type.bodySm, { color: colors.danger, marginTop: space.md }]}>{error}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={!error && !loading ? <Empty text="No meetings yet. Tap Record to start." /> : undefined}
        ListFooterComponent={meetings.length ? <Text style={[type.caption, { textAlign: "center", marginTop: space.md }]}>Tap 🗑 to delete a meeting.</Text> : undefined}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/meeting/[id]", params: { id: item.id } })}
            onLongPress={() => askDelete(item)}
            style={({ pressed }) => [styles.row, pressed && { transform: [{ translateY: -2 }] }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={type.caption}>
                {new Date(item.createdAt).toLocaleString()}
                {item.durationSec ? `  ·  ${formatDuration(item.durationSec)}` : ""}
              </Text>
              {item.summary && !item.summary.startsWith("The transcript is ready. Add ") ? (
                <Text style={[type.bodySm, { marginTop: 4 }]} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
              {item.languages?.length || item.actionCount ? (
                <View style={styles.tags}>
                  {(item.languages ?? []).slice(0, 3).map((l) => (
                    <View key={l} style={styles.tag}>
                      <Text style={type.caption}>{l}</Text>
                    </View>
                  ))}
                  {item.actionCount ? (
                    <View style={[styles.tag, { backgroundColor: colors.surfaceTint }]}>
                      <Text style={[type.caption, { color: colors.success }]}>✓ {item.actionCount} actions</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: space.sm }}>
              <StatusPill status={item.status} />
              <Pressable
                onPress={() => askDelete(item)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
                style={({ pressed }) => [styles.trash, pressed && { opacity: 0.5 }]}
              >
                <Text style={{ fontSize: 16 }}>🗑</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Button label="Upload file" variant="ghost" onPress={uploadFile} loading={uploading} style={{ flex: 1 }} />
        <Button label="● Record" onPress={() => router.push("/record")} style={{ flex: 1.4 }} />
      </View>
    </SafeAreaView>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.headingMd, { color: colors.onInk }]}>{value}</Text>
      <Text style={[type.caption, { color: "#AEB9B0" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  trash: { padding: 6, borderRadius: radius.full, backgroundColor: colors.surfaceMuted },
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: space.lg, ...elevation.e2 },
  heroStats: {
    flexDirection: "row",
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.sm },
  tag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    ...elevation.e1,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    paddingBottom: space.xl,
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
