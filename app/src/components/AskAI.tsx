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

/** "Ask CIXCLE": talk with the AI about this meeting, by typing or by voice. */
export function AskAI({ meetingId }: { meetingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  const refreshUsage = () => api.usage().then(setUsage).catch(() => {});
  useEffect(() => {
    refreshUsage();
  }, []);

  const aiLeft = usage?.limited && usage.aiMax ? Math.max(0, usage.aiMax - (usage.aiUsed ?? 0)) : null;
  const outOfQuestions = aiLeft === 0;

  useEffect(() => {
    if (!playerStatus.playing && playerStatus.didJustFinish) setSpeakingIndex(null);
  }, [playerStatus.playing, playerStatus.didJustFinish]);

  const speak = async (text: string, index: number) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.replace(await api.speechSource(text));
      player.play();
      setSpeakingIndex(index);
    } catch {
      setSpeakingIndex(null);
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
      if (voiceReplies) speak(reply, withReply.length - 1);
    } catch (e) {
      const withErr = [...next, { role: "assistant" as const, content: `⚠️ ${(e as Error).message}` }];
      messagesRef.current = withErr;
      setMessages(withErr);
      refreshUsage();
    } finally {
      setThinking(false);
    }
  };

  const toggleMic = async () => {
    if (outOfQuestions) return;
    if (recState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) return;
      setHearing(true);
      try {
        const text = await api.transcribeQuestion(uri);
        if (text) await send(text);
        else showAlert("Didn't catch that", "Try speaking a little closer to the phone.");
      } catch (e) {
        showAlert("Couldn't hear the question", (e as Error).message);
      } finally {
        setHearing(false);
      }
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showAlert("Microphone needed", "Allow microphone access in iPhone Settings to ask by voice.");
      return;
    }
    stopSpeaking();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const listening = recState.isRecording;
  const wave: WaveState = listening ? "listening" : thinking || hearing ? "thinking" : speakingIndex !== null ? "speaking" : "idle";
  const status = listening
    ? "Listening… tap ■ when you finish"
    : hearing
      ? "Hearing your question…"
      : thinking
        ? "Thinking…"
        : speakingIndex !== null
          ? "Speaking…"
          : "Ask anything about this meeting";

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
          <CircleWaves size={170} state={wave} />
          <Text style={[type.headingMd, { color: colors.onInk, marginTop: space.md }]}>CIXCLE AI</Text>
          <Text style={[type.bodySm, { color: "#C9D3CB", textAlign: "center" }]}>{status}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <CircleWaves size={64} state={wave} />
          <View style={{ flex: 1 }}>
            <Text style={[type.headingMd, { color: colors.onInk }]}>CIXCLE AI</Text>
            <Text style={[type.bodySm, { color: "#C9D3CB" }]}>{status}</Text>
          </View>
          {aiLeft !== null ? (
            <View style={styles.quota}>
              <Text style={[type.caption, { color: colors.onInk }]}>{aiLeft} left</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.thread}>
        {messages.length === 0 ? (
          <AiRow>
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[type.body, { color: colors.text }]}>
                Hi! I've read this meeting. Ask me for a recap, next steps or advice, in English, Malay or Manglish. Type below or tap 🎙 to talk.
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
          <ScrollChips onPick={send} disabled={thinking || hearing || listening} />
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={listening ? "Listening…" : "Message CIXCLE AI"}
              placeholderTextColor={colors.textSubtle}
              style={[type.body, styles.input]}
              multiline
              editable={!listening}
              onSubmitEditing={() => send(draft)}
            />
            {draft.trim() ? (
              <Pressable onPress={() => send(draft)} style={[styles.round, { backgroundColor: colors.ink }]} accessibilityLabel="Send">
                <Text style={[type.title, { color: colors.onInk }]}>↑</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={toggleMic}
                disabled={hearing || thinking}
                style={[styles.round, { backgroundColor: listening ? colors.danger : colors.primary }, (hearing || thinking) && { opacity: 0.4 }]}
                accessibilityLabel={listening ? "Stop and send" : "Ask by voice"}
              >
                <Text style={[type.title, { color: listening ? colors.onDanger : colors.onPrimary }]}>{listening ? "■" : "🎙"}</Text>
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
  limitBtn: { marginTop: space.md, alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
});
