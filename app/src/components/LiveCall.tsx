import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { api, type ChatMessage, type Usage } from "../api";
import { CircleWaves, type WaveState } from "./CircleWaves";
import { colors, space, type } from "../theme";

/** How long a pause ends your turn, and how long quiet pauses the call. */
const PAUSE_MS = 900;
const MIN_SPEECH_MS = 200;
const NO_SPEECH_MS = 25000;
const MAX_TURN_MS = 45000;

type Phase = "starting" | "listening" | "thinking" | "speaking" | "paused";

const useNative = Platform.OS !== "web";

/**
 * A full-screen voice call with CIXCLE AI: only the glowing circle, no buttons to press.
 * It listens, notices when you pause, answers out loud, then listens again on its own.
 * Each turn is still added to the chat so it can be read later.
 */
export function LiveCall({
  meetingId,
  visible,
  aiLeft,
  getHistory,
  onTurn,
  onUsage,
  onClose,
}: {
  meetingId: string;
  visible: boolean;
  aiLeft: number | null;
  getHistory: () => ChatMessage[];
  onTurn: (question: string, reply: string) => void;
  onUsage: (u: Usage) => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const ring = Math.min(width - 72, height * 0.42, 340);

  const [phase, setPhase] = useState<Phase>("starting");
  const [note, setNote] = useState<string | null>(null);
  const [heardSpeech, setHeardSpeech] = useState(false);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 80);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const activeRef = useRef(false);
  const phaseRef = useRef<Phase>("starting");
  const busyRef = useRef(false);
  const startedPlaying = useRef(false);
  const vad = useRef({ started: 0, speech: false, loudSince: 0, lastLoud: 0, floor: -160 });
  const level = useRef(new Animated.Value(0)).current;

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---- Microphone ----
  const startMic = async () => {
    if (!activeRef.current || busyRef.current || recorder.isRecording) return;
    busyRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setNote("Allow microphone access in your phone's settings to talk with CIXCLE AI.");
        go("paused");
        return;
      }
      player.pause();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      vad.current = { started: Date.now(), speech: false, loudSince: 0, lastLoud: 0, floor: -160 };
      setHeardSpeech(false);
      setNote(null);
      go("listening");
    } catch (e) {
      setNote(`Couldn't start the microphone: ${(e as Error).message}`);
      go("paused");
    } finally {
      busyRef.current = false;
    }
  };

  const stopMic = async (): Promise<string | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      return recorder.uri;
    } catch {
      return null;
    } finally {
      busyRef.current = false;
    }
  };

  // ---- One turn: what you said -> the AI's spoken reply ----
  const finishTurn = async () => {
    go("thinking");
    const uri = await stopMic();
    if (!activeRef.current) return;
    if (!uri) return startMic();
    try {
      const { question, reply, usage } = await api.talk(meetingId, uri, getHistory());
      if (usage) onUsage(usage);
      if (!activeRef.current) return;
      if (!question) return startMic(); // Nothing clear was said: just keep listening.
      onTurn(question, reply);
      await say(reply);
    } catch (e) {
      if (!activeRef.current) return;
      const msg = (e as Error).message;
      setNote(/free|limit|month/i.test(msg) ? msg : `Couldn't reach CIXCLE AI. ${msg}`);
      go("paused");
    }
  };

  const say = async (text: string) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      startedPlaying.current = false;
      player.replace(await api.speechSource(text));
      player.play();
      go("speaking");
    } catch {
      startMic();
    }
  };

  // When the answer finishes, listen again.
  useEffect(() => {
    if (playerStatus.playing) startedPlaying.current = true;
    if (!playerStatus.playing && playerStatus.didJustFinish && phaseRef.current === "speaking") startMic();
  }, [playerStatus.playing, playerStatus.didJustFinish]);

  // If a spoken answer never starts (voice service down), carry on listening instead of getting stuck.
  useEffect(() => {
    if (phase !== "speaking") return;
    const t = setTimeout(() => {
      if (!startedPlaying.current && phaseRef.current === "speaking") startMic();
    }, 10000);
    return () => clearTimeout(t);
  }, [phase]);

  // ---- Listening: watch the microphone level and end the turn when you pause ----
  useEffect(() => {
    if (!activeRef.current || phaseRef.current !== "listening" || !recState.isRecording || busyRef.current) return;
    const v = vad.current;
    const now = Date.now();
    const db = recState.metering ?? -160;
    if (db > -159) {
      // Learn the room's background level so a noisy room needs a louder voice.
      v.floor = v.floor <= -159 ? db : v.speech ? v.floor : v.floor * 0.95 + Math.min(db, v.floor + 6) * 0.05;
    }
    const threshold = Math.min(-26, Math.max(-48, v.floor + 14));
    // The circle swells with your voice.
    const lv = Math.max(0, Math.min(1, (db - threshold + 8) / 30));
    Animated.timing(level, { toValue: lv, duration: 90, useNativeDriver: useNative }).start();
    if (db > threshold) {
      if (!v.loudSince) v.loudSince = now;
      v.lastLoud = now;
      if (!v.speech && now - v.loudSince >= MIN_SPEECH_MS) {
        v.speech = true;
        setHeardSpeech(true);
      }
    } else {
      v.loudSince = 0;
    }
    if (v.speech && now - v.lastLoud > PAUSE_MS) finishTurn();
    else if (now - v.started > MAX_TURN_MS) (v.speech ? finishTurn() : pauseForQuiet());
    else if (!v.speech && now - v.started > NO_SPEECH_MS) pauseForQuiet();
  }, [recState.durationMillis, recState.metering, recState.isRecording]);

  const pauseForQuiet = async () => {
    go("paused");
    setNote("Paused because it was quiet. Tap the circle to talk again.");
    await stopMic();
  };

  // While the AI talks, the circle pulses like a voice.
  useEffect(() => {
    if (phase === "speaking") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(level, { toValue: 0.55, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
          Animated.timing(level, { toValue: 0.2, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: useNative }),
          Animated.timing(level, { toValue: 0.7, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
          Animated.timing(level, { toValue: 0.15, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: useNative }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    if (phase !== "listening") Animated.timing(level, { toValue: 0, duration: 200, useNativeDriver: useNative }).start();
  }, [phase]);

  // ---- Start and end the call ----
  useEffect(() => {
    if (visible) {
      activeRef.current = true;
      setNote(null);
      go("starting");
      api.health().catch(() => {}); // Wake the server while the microphone starts.
      startMic();
    } else {
      activeRef.current = false;
    }
  }, [visible]);

  useEffect(
    () => () => {
      activeRef.current = false;
      if (recorder.isRecording) recorder.stop().catch(() => {});
    },
    [],
  );

  const end = async () => {
    activeRef.current = false;
    player.pause();
    if (recorder.isRecording) await stopMic();
    go("starting");
    onClose();
  };

  /** Tap the circle: cut the AI short and talk, or carry on after a pause. */
  const tapCircle = () => {
    if (phaseRef.current === "speaking") {
      player.pause();
      startMic();
    } else if (phaseRef.current === "paused") {
      if (aiLeft === 0) return;
      startMic();
    }
  };

  const wave: WaveState =
    phase === "listening" ? "listening" : phase === "thinking" || phase === "starting" ? "thinking" : phase === "speaking" ? "speaking" : "idle";
  const status =
    phase === "starting"
      ? "Connecting…"
      : phase === "listening"
        ? heardSpeech
          ? "Listening…"
          : "Go ahead, I'm listening"
        : phase === "thinking"
          ? "Thinking…"
          : phase === "speaking"
            ? "Speaking"
            : "Paused";
  const hint =
    phase === "speaking"
      ? "Tap the circle to cut in"
      : phase === "paused"
        ? note ?? "Tap the circle to talk"
        : phase === "listening"
          ? "English, Malay or Manglish. Just pause when you're done."
          : " ";

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={end} presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={[type.title, { color: colors.onInk }]}>CIXCLE AI</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={[type.caption, { color: colors.onInk }]}>{aiLeft !== null ? `Live · ${aiLeft} left` : "Live"}</Text>
          </View>
        </View>

        <View style={styles.middle}>
          <Pressable onPress={tapCircle} accessibilityLabel={phase === "speaking" ? "Cut in" : "Talk"}>
            <Animated.View style={{ transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
              <CircleWaves size={ring} state={wave} />
            </Animated.View>
          </Pressable>
          <Text style={[type.headingLg, { color: colors.onInk, marginTop: space.xl, textAlign: "center" }]}>{status}</Text>
          <Text style={[type.bodySm, { color: "#9FB0A4", marginTop: space.sm, textAlign: "center", minHeight: 40 }]}>{hint}</Text>
        </View>

        <View style={styles.bottom}>
          <Pressable onPress={end} style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.8 }]} accessibilityLabel="End call">
            <Text style={{ color: colors.onDanger, fontSize: 26, lineHeight: 28 }}>✕</Text>
          </Pressable>
          <Text style={[type.caption, { color: "#9FB0A4", marginTop: space.sm }]}>End</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0E0D", paddingHorizontal: space.lg, paddingTop: space.xxl, paddingBottom: space.xl },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  middle: { flex: 1, alignItems: "center", justifyContent: "center" },
  bottom: { alignItems: "center" },
  endBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
});
