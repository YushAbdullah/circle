import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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

  const uploadFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const f = res.assets[0];
    setUploading(true);
    try {
      await api.upload({ uri: f.uri, name: f.name, mimeType: f.mimeType ?? "audio/mp4" }, { title: f.name.replace(/\.[^.]+$/, "") });
      await load(true);
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message);
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
            <Text style={type.headingLg}>Your meetings</Text>
            <Text style={[type.body, { marginTop: space.sm }]}>
              Record, and CIRCLE writes the transcript and report. Malay, English and Manglish all okay.
            </Text>
            {error === "notConfigured" ? (
              <Card style={{ marginTop: space.lg }}>
                <Text style={type.title}>Connect your server</Text>
                <Text style={[type.bodySm, { marginVertical: space.sm }]}>
                  Add the CIRCLE server address in Settings to start recording.
                </Text>
                <Button label="Open settings" variant="ink" onPress={() => router.push("/settings")} />
              </Card>
            ) : error ? (
              <Text style={[type.bodySm, { color: colors.danger, marginTop: space.md }]}>{error}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={!error && !loading ? <Empty text="No meetings yet. Tap Record to start." /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/meeting/[id]", params: { id: item.id } })}
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
              {item.summary ? (
                <Text style={[type.bodySm, { marginTop: 4 }]} numberOfLines={2}>
                  {item.summary}
                </Text>
              ) : null}
            </View>
            <StatusPill status={item.status} />
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

const styles = StyleSheet.create({
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
