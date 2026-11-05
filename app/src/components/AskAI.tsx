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
import { api, type ChatMessage } from "../api";
import { colors, elevation, radius, space, type } from "../theme";

const SUGGESTIONS = [
  "What do you recommend I do next?",
  "What risks or gaps did we miss?",
  "Terangkan ringkasan dalam Bahasa Melayu",
  "Draft a follow-up message to the team",
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
    if (!q || thinking) return;
    setDraft("");
    const next = [...messagesRef.current, { role: "user" as const, content: q }];
    messagesRef.current = next;
    setMessages(next);
    setThinking(true);
    try {
      const { reply } = await api.chat(meetingId, next);
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      messagesRef.current = withReply;
      setMessages(withReply);
      if (voiceReplies) speak(reply, withReply.length - 1);
    } catch (e) {
      const withErr = [...next, { role: "assistant" as const, content: `⚠️ ${(e as Error).message}` }];
      messagesRef.current = withErr;
      setMessages(withErr);
    } finally {
      setThinking(false);
    }
  };

  const toggleMic = async () => {
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

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.hero}>
        <View style={styles.orb}>
          <View style={[styles.orbInner, listening && { backgroundColor: colors.danger }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.headingMd, { color: colors.onInk }]}>Ask CIXCLE</Text>
          <Text style={[type.bodySm, { color: "#C9D3CB" }]}>
            Talk about this meeting. Ask for advice, next steps or a recap in Malay or English.
          </Text>
        </View>
      </View>

      {messages.length === 0 ? (
        <View style={{ gap: space.sm }}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
              <Text style={type.label}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {messages.map((msg, i) => (
        <View key={i} style={[styles.bubble, msg.role === "user" ? styles.userBubble : styles.aiBubble]}>
          <Text style={[type.body, { color: msg.role === "user" ? colors.onInk : colors.text }]}>{msg.content}</Text>
          {msg.role === "assistant" && !msg.content.startsWith("⚠️") ? (
            <Pressable
              onPress={() => (speakingIndex === i ? stopSpeaking() : speak(msg.content, i))}
              hitSlop={8}
              style={{ marginTop: space.sm, alignSelf: "flex-start" }}
            >
              <Text style={[type.caption, { color: colors.success }]}>{speakingIndex === i ? "■ Stop" : "▶ Listen"}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {thinking || hearing ? (
        <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={type.bodySm}>{hearing ? "Listening to your question…" : "Thinking…"}</Text>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={listening ? "Listening… tap ■ when done" : "Ask about this meeting"}
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
      <View style={styles.voiceRow}>
        <Text style={type.bodySm}>Read answers aloud</Text>
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

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: space.lg,
    ...elevation.e2,
  },
  orb: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: "rgba(107,230,131,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  orbInner: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.primary },
  suggestion: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: space.md,
  },
  bubble: { borderRadius: radius.md, padding: space.md, maxWidth: "88%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...elevation.e1 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    paddingLeft: space.md,
  },
  input: { flex: 1, maxHeight: 120, paddingVertical: 10, color: colors.text },
  round: { width: 44, height: 44, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  voiceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xs },
});
