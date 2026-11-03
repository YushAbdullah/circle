import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { api, formatDuration } from "../api";
import { Button } from "../components/ui";
import { colors, elevation, fonts, radius, space, type } from "../theme";

type Phase = "idle" | "recording" | "paused" | "saving";

export default function Record() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: "document" });
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const started = useRef(false);

  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Microphone needed", "Allow microphone access in your phone settings to record meetings.");
        router.back();
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      // Keep recording when the screen locks. Needs a development/production build, not Expo Go.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true }).catch(
        () => {},
      );
    })();
    return () => {
      if (started.current) recorder.stop().catch(() => {});
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []);

  const start = async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = true;
    setPhase("recording");
  };

  const togglePause = () => {
    if (phase === "recording") {
      recorder.pause();
      setPhase("paused");
    } else {
      recorder.record();
      setPhase("recording");
    }
  };

  const finish = async () => {
    const durationSec = state.durationMillis / 1000;
    setPhase("saving");
    try {
      await recorder.stop();
      started.current = false;
      const uri = recorder.uri;
      if (!uri) throw new Error("The recording could not be saved.");
      await api.upload(
        { uri, name: `meeting-${Date.now()}.m4a`, mimeType: "audio/mp4" },
        { title: title.trim() || undefined, durationSec },
      );
      router.back();
    } catch (e) {
      setPhase("paused");
      Alert.alert("Upload failed", `${(e as Error).message}\n\nYour recording is still on this phone. Try again when you're back online.`);
    }
  };

  const discard = () => {
    if (phase === "idle") return router.back();
    Alert.alert("Discard recording?", "This recording will be lost.", [
      { text: "Keep recording", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const live = phase === "recording";

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Pressable onPress={discard} hitSlop={12} accessibilityRole="button">
          <Text style={type.label}>{phase === "idle" ? "Close" : "Discard"}</Text>
        </Pressable>
        <Text style={[type.caption, { color: live ? colors.danger : colors.textSubtle }]}>
          {live ? "● REC" : phase === "paused" ? "PAUSED" : ""}
        </Text>
      </View>

      <View style={styles.center}>
        <View style={[styles.glow, live && { backgroundColor: colors.surfaceTint }]} />
        <Text style={styles.timer} accessibilityLabel="Recording time">
          {formatDuration(state.durationMillis / 1000) || "0:00"}
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Meeting title (optional)"
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
        />
        <Text style={[type.bodySm, { textAlign: "center", marginTop: space.md }]}>
          Put the phone in the middle of the table. Speakers are separated automatically.
        </Text>
      </View>

      <View style={styles.controls}>
        {phase === "idle" ? (
          <Button label="Start recording" onPress={start} style={{ flex: 1 }} />
        ) : (
          <>
            <Button
              label={phase === "paused" ? "Resume" : "Pause"}
              variant="ghost"
              onPress={togglePause}
              disabled={phase === "saving"}
              style={{ flex: 1 }}
            />
            <Button label="Stop & save" variant="ink" onPress={finish} loading={phase === "saving"} style={{ flex: 1.3 }} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  top: { flexDirection: "row", justifyContent: "space-between", padding: space.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  glow: { position: "absolute", width: 320, height: 320, borderRadius: radius.full },
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
  controls: { flexDirection: "row", gap: space.sm, padding: space.md, paddingBottom: space.xl },
});
