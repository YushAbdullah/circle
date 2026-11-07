import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { showAlert } from "../alert";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { router } from "expo-router";
import { api, type ChatMessage, type Usage } from "../api";
import { CircleWaves, type WaveState } from "./CircleWaves";
import { colors, elevation, radius, space, type } from "../theme";

const SUGGESTIONS = [
  "What should I do next?",
  "Risks we missed?",
  "Ringkasan dalam BM",
  "Draft a follow-up message",
];

/** Hands-free listening: how loud counts as talking, and how long a pause ends a turn. */
const PAUSE_MS = 1300;
const MIN_SPEECH_MS = 250;
const NO_SPEECH_MS = 20000;
const MAX_TURN_MS = 60000;

/**
 * "Ask CIXCLE": talk with the AI about this meeting, by typing or by voice.
 * Live talk is hands-free, like a call: it listens, notices when you pause, answers out loud, then listens again.
 */
export function AskAI({ meetingId }: { meetingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  // Refs so the listening loop always sees the latest values.
  const liveRef = useRef(false);
  const busyRef = useRef(false); // starting or stopping the microphone
  const vad = useRef({ started: 0, speech: false, loudSince: 0, lastLoud: 0, floor: -160 });

  const refreshUsage = () => api.usage().then(setUsage).catch(() => {});
  useEffect(() => {
    refreshUsage();
  }, []);

  const aiLeft = usage?.limited && usage.aiMax ? Math.max(0, usage.aiMax - (usage.aiUsed ?? 0)) : null;
  const outOfQuestions = aiLeft === 0;

  const endLive = (why: string | null = null, keepSpeaking = false) => {
    liveRef.current = false;
    setLive(false);
    setNote(why);
    if (!keepSpeaking) stopSpeaking();
    if (recorder.isRecording) stopMic(false);
  };

  useEffect(() => {
    // The last free answer is still read out; live talk just stops after it.
    if (outOfQuestions && liveRef.current) endLive(null, true);
  }, [outOfQuestions]);

  // When an answer finishes playing during live talk, listen again.
  useEffect(() => {
    if (!playerStatus.playing && playerStatus.didJustFinish) {
      setSpeakingIndex(null);
      if (liveRef.current) startMic();
    }
  }, [playerStatus.playing, playerStatus.didJustFinish]);

  // If a spoken answer never starts (no voice key, bad network), don't get stuck: carry on listening.
  const startedPlaying = useRef(false);
  useEffect(() => {
    if (playerStatus.playing) startedPlaying.current = true;
  }, [playerStatus.playing]);
  useEffect(() => {
    if (speakingIndex === null) return;
    startedPlaying.current = false;
    const t = setTimeout(() => {
      if (startedPlaying.current) return;
      player.pause();
      setSpeakingIndex(null);
      if (liveRef.current) startMic();
    }, 12000);
    return () => clearTimeout(t);
  }, [speakingIndex]);

  // Stop everything when leaving the screen.
  useEffect(
    () => () => {
      liveRef.current = false;
      if (recorder.isRecording) recorder.stop().catch(() => {});
    },
    [],
  );

  const speak = async (text: string, index: number) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.replace(await api.speechSource(text));
      player.play();
      setSpeakingIndex(index);
    } catch {
      setSpeakingIndex(null);
      if (liveRef.current) startMic();
    }
  };

  const stopSpeaking = () => {
    player.pause();
    setSpeakingIndex(null);
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking || outOfQuestions) return;
    setDraft("");
    setNote(null);
    const next = [...messagesRef.current, { role: "user" as const, content: q }];
    messagesRef.current = next;
    setMessages(next);
    setThinking(true);
    try {
      const { reply, usage: u } = await api.chat(meetingId, next);
      if (u) setUsage(u);
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      messagesRef.current = withReply;
      setMessages(withReply);
      if (liveRef.current || voiceReplies) speak(reply, withReply.length - 1);
    } catch (e) {
      const withErr = [...next, { role: "assistant" as const, content: `⚠️ ${(e as Error).message}` }];
      messagesRef.current = withErr;
      setMessages(withErr);
      refreshUsage();
      if (liveRef.current) endLive();
    } finally {
      setThinking(false);
    }
  };

  const startMic = async () => {
    if (busyRef.current || recorder.isRecording) return;
    busyRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        endLive();
        showAlert("Microphone needed", "Allow microphone access in iPhone Settings to talk with CIXCLE AI.");
        return;
      }
      stopSpeaking();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      vad.current = { started: Date.now(), speech: false, loudSince: 0, lastLoud: 0, floor: -160 };
    } catch (e) {
      endLive();
      showAlert("Couldn't start the microphone", (e as Error).message);
    } finally {
      busyRef.current = false;
    }
  };

  /** Stop the microphone; when `submit`, turn what was said into a question and send it. */
  const stopMic = async (submit: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    let uri: string | null = null;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      uri = recorder.uri;
    } catch {
      // Already stopped.
    } finally {
      busyRef.current = false;
    }
    if (!submit || !uri) return;
    setHearing(true);
    try {
      const text = await api.transcribeQuestion(uri);
      setHearing(false);
      if (text) await send(text);
      else if (liveRef.current) startMic();
      else showAlert("Didn't catch that", "Try speaking a little closer to the phone.");
    } catch (e) {
      setHearing(false);
      if (liveRef.current) endLive();
      showAlert("Couldn't hear the question", (e as Error).message);
    }
  };

  // Live talk: watch the microphone level, and end the turn when you pause after speaking.
  useEffect(() => {
    if (!liveRef.current || !recState.isRecording || busyRef.current) return;
    const v = vad.current;
    const now = Date.now();
    const db = recState.metering ?? -160;
    if (db > -159) {
      // Track the room's background level, so a noisy room needs a louder voice.
      v.floor = v.floor <= -159 ? db : v.speech ? v.floor : v.floor * 0.95 + Math.min(db, v.floor + 6) * 0.05;
    }
    const threshold = Math.min(-26, Math.max(-48, v.floor + 14));
    if (db > threshold) {
      if (!v.loudSince) v.loudSince = now;
      v.lastLoud = now;
      if (now - v.loudSince >= MIN_SPEECH_MS) v.speech = true;
    } else {
      v.loudSince = 0;
    }
    if (v.speech && now - v.lastLoud > PAUSE_MS) stopMic(true);
    else if (now - v.started > MAX_TURN_MS) stopMic(v.speech);
    else if (!v.speech && now - v.started > NO_SPEECH_MS) endLive("Live talk paused because it was quiet. Tap Start live talk to carry on.");
  }, [recState.durationMillis, recState.metering, recState.isRecording]);

  const startLive = () => {
    if (outOfQuestions) return;
    setNote(null);
    liveRef.current = true;
    setLive(true);
    startMic();
  };

  /** Tap while the AI is talking: cut it short and listen to you instead. */
  const interrupt = () => {
    if (!liveRef.current || speakingIndex === null) return;
    stopSpeaking();
    startMic();
  };

  const listening = recState.isRecording;
  const wave: WaveState = listening ? "listening" : thinking || hearing ? "thinking" : speakingIndex !== null ? "speaking" : "idle";
  const status = live
    ? listening
      ? vad.current.speech
        ? "Listening… pause when you're done"
        : "Listening… just talk"
      : hearing
        ? "Hearing you…"
        : thinking
          ? "Thinking…"
          : speakingIndex !== null
            ? "Speaking… tap the circle to interrupt"
            : "Live talk on"
    : listening
      ? "Listening…"
      : hearing
        ? "Hearing your question…"
        : thinking
          ? "Thinking…"
          : speakingIndex !== null
            ? "Speaking…"
            : "Talk hands-free or type below";

  const liveButton = (big: boolean) =>
    outOfQuestions ? null : (
      <Pressable
        onPress={() => (live ? endLive() : startLive())}
        style={({ pressed }) => [big ? styles.livePill : styles.liveSmall, live && styles.liveOn, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={live ? "End live talk" : "Start live talk"}
      >
        <Text style={[big ? type.title : type.label, { color: live ? colors.onInk : colors.onPrimary }]}>
          {live ? (big ? "■  End live talk" : "■ End") : big ? "🎙  Start live talk" : "🎙 Live"}
        </Text>
      </Pressable>
    );

  return (
    <View style={styles.chat}>
      {messages.length === 0 && !thinking && !hearing ? (
        // Before the first question: a big glowing ring, like a voice assistant.
        <View style={styles.heroHeader}>
          {aiLeft !== null ? (
            <View style={[styles.quota, { position: "absolute", top: space.md, right: space.md }]}>
              <Text style={[type.caption, { color: colors.onInk }]}>{aiLeft} left</Text>
            </View>
          ) : null}
          <Pressable onPress={live ? interrupt : startLive} accessibilityLabel={live ? "Interrupt" : "Start live talk"}>
            <CircleWaves size={170} state={wave} />
          </Pressable>
          <Text style={[type.headingMd, { color: colors.onInk, marginTop: space.md }]}>CIXCLE AI</Text>
          <Text style={[type.bodySm, { color: "#C9D3CB", textAlign: "center" }]}>{status}</Text>
          <View style={{ marginTop: space.md }}>{liveButton(true)}</View>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={interrupt} disabled={speakingIndex === null || !live} accessibilityLabel="Interrupt">
            <CircleWaves size={64} state={wave} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[type.headingMd, { color: colors.onInk }]}>CIXCLE AI</Text>
            <Text style={[type.bodySm, { color: "#C9D3CB" }]}>{status}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            {aiLeft !== null ? (
              <View style={styles.quota}>
                <Text style={[type.caption, { color: colors.onInk }]}>{aiLeft} left</Text>
              </View>
            ) : null}
            {liveButton(false)}
          </View>
        </View>
      )}
      {note ? <Text style={[type.caption, styles.note]}>{note}</Text> : null}

      <View style={styles.thread}>
        {messages.length === 0 ? (
          <AiRow>
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[type.body, { color: colors.text }]}>
                Hi! I've read this meeting. Ask me for a recap, next steps or advice, in English, Malay or Manglish. Tap Start live talk and just speak, I'll answer out loud. Or type below.
              </Text>
            </View>
          </AiRow>
        ) : null}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <View key={i} style={[styles.bubble, styles.userBubble]}>
              <Text style={[type.body, { color: colors.onInk }]}>{msg.content}</Text>
            </View>
          ) : (
            <AiRow key={i}>
              <View style={[styles.bubble, styles.aiBubble, msg.content.startsWith("⚠️") && { backgroundColor: "#FDECEE" }]}>
                <Text style={[type.body, { color: colors.text }]}>{msg.content}</Text>
                {!msg.content.startsWith("⚠️") ? (
                  <Pressable
                    onPress={() => (speakingIndex === i ? stopSpeaking() : speak(msg.content, i))}
                    hitSlop={8}
                    style={{ marginTop: space.sm, alignSelf: "flex-start" }}
                  >
                    <Text style={[type.caption, { color: colors.success }]}>{speakingIndex === i ? "■ Stop" : "▶ Listen"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </AiRow>
          ),
        )}

        {thinking || hearing ? (
          <AiRow>
            <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={type.bodySm}>{hearing ? "Hearing your question…" : "Thinking…"}</Text>
            </View>
          </AiRow>
        ) : null}
      </View>

      {outOfQuestions ? (
        <View style={styles.limit}>
          <Text style={type.title}>You've used this month's free AI questions</Text>
          <Text style={[type.bodySm, { marginTop: 4 }]}>
            The free plan includes {usage?.aiMax} {usage?.aiMax === 1 ? "question" : "questions"} a month. They reset next month. For unlimited use, ask us about the Business plan.
          </Text>
          <Pressable onPress={() => router.push("/business")} style={styles.limitBtn} accessibilityRole="button">
            <Text style={[type.label, { color: colors.onInk }]}>Ask about the Business plan</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollChips onPick={send} disabled={thinking || hearing || live} />
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={live ? "Live talk on, just speak" : "Message CIXCLE AI"}
              placeholderTextColor={colors.textSubtle}
              style={[type.body, styles.input]}
              multiline
              editable={!live}
              onSubmitEditing={() => send(draft)}
            />
            {draft.trim() ? (
              <Pressable onPress={() => send(draft)} style={[styles.round, { backgroundColor: colors.ink }]} accessibilityLabel="Send">
                <Text style={[type.title, { color: colors.onInk }]}>↑</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => (live ? endLive() : startLive())}
                style={[styles.round, { backgroundColor: live ? colors.danger : colors.primary }]}
                accessibilityLabel={live ? "End live talk" : "Start live talk"}
              >
                <Text style={[type.title, { color: live ? colors.onDanger : colors.onPrimary }]}>{live ? "■" : "🎙"}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.voiceRow}>
        <Text style={type.caption}>Read answers aloud</Text>
        <Switch
          value={voiceReplies}
          onValueChange={(v) => {
            setVoiceReplies(v);
            if (!v) stopSpeaking();
          }}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>
    </View>
  );
}

function AiRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, maxWidth: "92%" }}>
      <View style={styles.avatar}>
        <View style={styles.avatarDot} />
      </View>
      <View style={{ flexShrink: 1 }}>{children}</View>
    </View>
  );
}

function ScrollChips({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <View style={styles.chips}>
      {SUGGESTIONS.map((q) => (
        <Pressable
          key={q}
          onPress={() => onPick(q)}
          disabled={disabled}
          style={({ pressed }) => [styles.chip, (pressed || disabled) && { opacity: 0.5 }]}
        >
          <Text style={type.caption}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...elevation.e2 },
  heroHeader: { alignItems: "center", backgroundColor: "#121514", paddingVertical: space.xl, paddingHorizontal: space.md },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: "#121514", padding: space.md },
  quota: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.12)" },
  thread: { padding: space.md, gap: space.md, backgroundColor: colors.surfaceMuted, minHeight: 220 },
  bubble: { borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...elevation.e1 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: "rgba(107,230,131,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarDot: { width: 14, height: 14, borderRadius: radius.full, backgroundColor: colors.primary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: space.md, paddingTop: space.md },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    margin: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 5,
    paddingLeft: space.md,
  },
  input: { flex: 1, maxHeight: 120, paddingVertical: 10, color: colors.text },
  round: { width: 42, height: 42, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  voiceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingBottom: space.sm },
  limit: { margin: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceTint },
  livePill: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: 24 },
  liveSmall: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  liveOn: { backgroundColor: colors.danger },
  note: { paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surfaceTint, color: colors.text },
  limitBtn: { marginTop: space.md, alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
});
