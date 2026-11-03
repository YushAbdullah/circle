import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from "expo-audio";
import { api, formatDuration } from "../api";
import { toPcm16kMono } from "../pcm";
import { Button } from "../components/ui";
import { colors, elevation, fonts, radius, space, type } from "../theme";

type Phase = "idle" | "starting" | "recording" | "saving";
type LiveState = "connecting" | "live" | "offline";

export default function Record() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [finals, setFinals] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [live, setLive] = useState<LiveState>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const startedAt = useRef(0);
  const finalsRef = useRef<string[]>([]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const recordingRef = useRef(false);

  // Raw microphone audio: written to a WAV file on the phone (the stored recording)
  // and, at the same time, streamed to the server for live captions.
  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (buf) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(toPcm16kMono(buf.data, buf.sampleRate, buf.channels));
    },
  });

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      wsRef.current?.close();
      if (recordingRef.current) {
        stream.stopFileRecordingAsync().catch(() => {});
        stream.stop();
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    },
    [],
  );

  const connectLive = async () => {
    setLive("connecting");
    try {
      const ws = new WebSocket(await api.liveUrl());
      ws.binaryType = "arraybuffer";
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as { type: string; text?: string; message?: string };
        if (msg.type === "ready") setLive("live");
        else if (msg.type === "partial") setPartial(msg.text ?? "");
        else if (msg.type === "final" && msg.text) {
          finalsRef.current = [...finalsRef.current, msg.text];
          setFinals(finalsRef.current);
          setPartial("");
        } else if (msg.type === "error") setLive("offline");
      };
      ws.onerror = () => setLive("offline");
      ws.onclose = () => setLive((s) => (s === "live" || s === "connecting" ? "offline" : s));
      wsRef.current = ws;
    } catch {
      setLive("offline");
    }
  };

  const start = async () => {
    setPhase("starting");
    if (!stream) {
      setPhase("idle");
      Alert.alert("Not supported", "Live recording isn't available on this device.");
      return;
    }
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Microphone needed", "Allow microphone access in your phone settings to record meetings.");
        setPhase("idle");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      // Keep recording with the screen locked (needs the installed app, not Expo Go).
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true }).catch(
        () => {},
      );
      await stream.start();
      await stream.startFileRecordingAsync({ directory: "document", format: "wav" });
      recordingRef.current = true;
      startedAt.current = Date.now();
      setPhase("recording");
      connectLive();
    } catch (e) {
      console.warn("Could not start recording", e);
      stream?.stop();
      setPhase("idle");
      Alert.alert("Could not start recording", (e as Error).message);
    }
  };

  const finish = async () => {
    setPhase("saving");
    let file: { uri: string; duration: number } | null = null;
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      file = await stream.stopFileRecordingAsync();
      stream.stop();
      recordingRef.current = false;
      setTimeout(() => ws?.close(), 1500);

      const liveText = [...finalsRef.current, partial].filter(Boolean).join("\n");
      await api.upload(
        { uri: file.uri, name: `meeting-${Date.now()}.wav`, mimeType: "audio/wav" },
        { title: title.trim() || undefined, durationSec: file.duration, liveText },
      );
      router.back();
    } catch (e) {
      setPhase(file ? "saving" : "recording");
      Alert.alert(
        "Upload failed",
        `${(e as Error).message}\n\nThe recording is saved on this phone${file ? "" : " and still running"}.`,
        file
          ? [
              { text: "Discard", style: "destructive", onPress: () => router.back() },
              { text: "Try again", onPress: () => retryUpload(file!) },
            ]
          : undefined,
      );
    }
  };

  const retryUpload = async (file: { uri: string; duration: number }) => {
    try {
      await api.upload(
        { uri: file.uri, name: `meeting-${Date.now()}.wav`, mimeType: "audio/wav" },
        { title: title.trim() || undefined, durationSec: file.duration, liveText: finalsRef.current.join("\n") },
      );
      router.back();
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message, [
        { text: "Discard", style: "destructive", onPress: () => router.back() },
        { text: "Try again", onPress: () => retryUpload(file) },
      ]);
    }
  };

  const close = () => {
    if (phase === "idle") return router.back();
    Alert.alert("Discard recording?", "This recording will be lost.", [
      { text: "Keep recording", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const recording = phase === "recording" || phase === "saving";

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={type.label}>{phase === "idle" ? "Close" : "Discard"}</Text>
        </Pressable>
        {recording ? (
          <View style={styles.liveTag}>
            <View style={[styles.dot, { backgroundColor: colors.danger }]} />
            <Text style={[type.label, { fontVariant: ["tabular-nums"] }]}>{formatDuration(elapsed) || "0:00"}</Text>
          </View>
        ) : null}
      </View>

      {!recording ? (
        <View style={styles.center}>
          <Text style={styles.timer}>0:00</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Meeting title (optional)"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
          />
          <Text style={[type.bodySm, { textAlign: "center", marginTop: space.md }]}>
            Put the phone in the middle of the table. You'll see what people say live, and the full report with speaker
            names comes after you stop.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: space.md }}>
          <View style={styles.captionHeader}>
            <Text style={type.title}>Live captions</Text>
            <Text style={[type.caption, { color: live === "live" ? colors.success : live === "offline" ? colors.warning : colors.textSubtle }]}>
              {live === "live" ? "● Live" : live === "offline" ? "Captions offline, still recording" : "Connecting…"}
            </Text>
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.captions}
            contentContainerStyle={{ padding: space.md, gap: space.sm }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {finals.length === 0 && !partial ? (
              <Text style={[type.bodySm, { color: colors.textSubtle }]}>Start talking. Captions appear here.</Text>
            ) : null}
            {finals.map((line, i) => (
              <Text key={i} style={[type.body, { color: colors.text }]}>
                {line}
              </Text>
            ))}
            {partial ? <Text style={[type.body, { color: colors.textSubtle }]}>{partial}</Text> : null}
          </ScrollView>
        </View>
      )}

      <View style={styles.controls}>
        {recording ? (
          <Button label="Stop & save" variant="ink" onPress={finish} loading={phase === "saving"} style={{ flex: 1 }} />
        ) : (
          <Button label="Start recording" onPress={start} loading={phase === "starting"} style={{ flex: 1 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.md },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...elevation.e1,
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  timer: { fontFamily: fonts.semibold, fontSize: 72, letterSpacing: -1.5, color: colors.text, fontVariant: ["tabular-nums"] },
  input: {
    marginTop: space.lg,
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    ...elevation.e1,
  },
  captionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: space.sm },
  captions: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, ...elevation.e2 },
  controls: { flexDirection: "row", gap: space.sm, padding: space.md, paddingBottom: space.xl },
});
