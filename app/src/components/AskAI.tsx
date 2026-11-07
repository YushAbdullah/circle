import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { router } from "expo-router";
import { api, type ChatMessage, type Usage } from "../api";
import { CircleWaves, type WaveState } from "./CircleWaves";
import { LiveCall } from "./LiveCall";
import { colors, elevation, radius, space, type } from "../theme";

const SUGGESTIONS = [
  "What should I do next?",
  "Risks we missed?",
  "Ringkasan dalam BM",
  "Draft a follow-up message",
];

/**
 * "Ask CIXCLE": chat with the AI about this meeting by typing, or tap Live talk for a
 * full-screen, hands-free voice call. Call turns are added to this chat too.
 */
export function AskAI({ meetingId }: { meetingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [calling, setCalling] = useState(false);

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  const refreshUsage = () => api.usage().then(setUsage).catch(() => {});
  useEffect(() => {
    refreshUsage();
    // Bring back the saved conversation, so the chat (and the AI) carries on where you left off.
    api
      .get(meetingId)
      .then((m) => {
        if (m.chat?.length && !messagesRef.current.length) setThread(m.chat);
      })
      .catch(() => {});
  }, [meetingId]);

  const startFresh = () => {
    stopSpeaking();
    setThread([]);
    api.clearChat(meetingId).catch(() => {});
  };

  const aiLeft = usage?.limited && usage.aiMax ? Math.max(0, usage.aiMax - (usage.aiUsed ?? 0)) : null;
  const outOfQuestions = aiLeft === 0;

  useEffect(() => {
    if (!playerStatus.playing && playerStatus.didJustFinish) setSpeakingIndex(null);
  }, [playerStatus.playing, playerStatus.didJustFinish]);

  const setThread = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

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
    setThread(next);
    setThinking(true);
    try {
      const { reply, usage: u } = await api.chat(meetingId, next);
      if (u) setUsage(u);
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      setThread(withReply);
      if (voiceReplies) speak(reply, withReply.length - 1);
    } catch (e) {
      setThread([...next, { role: "assistant" as const, content: `⚠️ ${(e as Error).message}` }]);
      refreshUsage();
    } finally {
      setThinking(false);
    }
  };

  const startCall = () => {
    if (outOfQuestions) return;
    stopSpeaking();
    setCalling(true);
  };

  const wave: WaveState = thinking ? "thinking" : speakingIndex !== null ? "speaking" : "idle";
  const status = thinking ? "Thinking…" : speakingIndex !== null ? "Speaking…" : "Tap the circle to talk live";

  return (
    <View style={styles.chat}>
      <LiveCall
        meetingId={meetingId}
        visible={calling}
        aiLeft={aiLeft}
        getHistory={() => messagesRef.current}
        onTurn={(question, reply) =>
          setThread([...messagesRef.current, { role: "user", content: question }, { role: "assistant", content: reply }])
        }
        onUsage={setUsage}
        onClose={() => {
          setCalling(false);
          refreshUsage();
        }}
      />
      {messages.length === 0 && !thinking ? (
        // Before the first question: a big glowing ring, like a voice assistant. Tap it to start a live call.
        <View style={styles.heroHeader}>
          {aiLeft !== null ? (
            <View style={[styles.quota, { position: "absolute", top: space.md, right: space.md }]}>
              <Text style={[type.caption, { color: colors.onInk }]}>{aiLeft} left</Text>
            </View>
          ) : null}
          <Pressable onPress={startCall} accessibilityLabel="Start live talk">
            <CircleWaves size={170} state={wave} />
          </Pressable>
          <Text style={[type.headingMd, { color: colors.onInk, marginTop: space.md }]}>CIXCLE AI</Text>
          <Text style={[type.bodySm, { color: "#C9D3CB", textAlign: "center" }]}>{status}</Text>
          {outOfQuestions ? null : (
            <Pressable onPress={startCall} style={({ pressed }) => [styles.livePill, { marginTop: space.md }, pressed && { opacity: 0.8 }]}>
              <Text style={[type.title, { color: colors.onPrimary }]}>🎙  Start live talk</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={startCall} accessibilityLabel="Start live talk">
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
            {outOfQuestions ? null : (
              <Pressable onPress={startCall} style={({ pressed }) => [styles.liveSmall, pressed && { opacity: 0.8 }]}>
                <Text style={[type.label, { color: colors.onPrimary }]}>🎙 Live</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View style={styles.thread}>
        {messages.length === 0 ? (
          <AiRow>
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[type.body, { color: colors.text }]}>
                Hi! I've read this meeting. Ask me for a recap, next steps or advice, in English, Malay or Manglish. Tap Start live talk to talk with me hands-free, or type below.
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

        {thinking ? (
          <AiRow>
            <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={type.bodySm}>Thinking…</Text>
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
          <ScrollChips onPick={send} disabled={thinking} />
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message CIXCLE AI"
              placeholderTextColor={colors.textSubtle}
              style={[type.body, styles.input]}
              multiline
              onSubmitEditing={() => send(draft)}
            />
            {draft.trim() ? (
              <Pressable onPress={() => send(draft)} style={[styles.round, { backgroundColor: colors.ink }]} accessibilityLabel="Send">
                <Text style={[type.title, { color: colors.onInk }]}>↑</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={startCall}
                style={[styles.round, { backgroundColor: colors.primary }]}
                accessibilityLabel="Start live talk"
              >
                <Text style={[type.title, { color: colors.onPrimary }]}>🎙</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.voiceRow}>
        {messages.length ? (
          <Pressable onPress={startFresh} hitSlop={8} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.success }]}>↺ Start fresh</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text style={[type.caption, { marginRight: space.sm }]}>Read typed answers aloud</Text>
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
  limitBtn: { marginTop: space.md, alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
});
