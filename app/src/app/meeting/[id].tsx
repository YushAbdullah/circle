import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { AudioSource } from "expo-audio";
import { api, formatDuration, statusLabel, type Meeting } from "../../api";
import { AudioBar, type AudioBarHandle } from "../../components/AudioBar";
import { PromptModal } from "../../components/PromptModal";
import { Button, Card, Empty, SectionTitle, StatusPill } from "../../components/ui";
import { colors, radius, space, type } from "../../theme";

// Speaker accent dots: mint, ink, then derived greens/greys (decorative only, never text colour).
const SPEAKER_DOTS = [colors.primary, colors.ink, colors.accent, "#9AA59C", "#B7E4C0", "#5F655F"];

type Tab = "report" | "transcript";

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [source, setSource] = useState<AudioSource | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "title" } | { kind: "speaker"; speaker: string } | null>(null);
  const audioRef = useRef<AudioBarHandle>(null);

  const load = useCallback(async () => {
    try {
      const meeting = await api.get(id);
      setM(meeting);
      setError(null);
      return meeting;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    api.audioSource(id).then(setSource);
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const meeting = await load();
      if (meeting && meeting.status !== "ready" && meeting.status !== "failed") timer = setTimeout(tick, 3000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [id, load]);

  const speakers = useMemo(() => {
    const ids = Array.from(new Set((m?.transcript?.utterances ?? []).map((u) => u.speaker)));
    return Object.fromEntries(ids.map((s, i) => [s, { name: m?.speakerNames[s] ?? `Speaker ${i + 1}`, dot: SPEAKER_DOTS[i % SPEAKER_DOTS.length] }]));
  }, [m]);

  if (!m) {
    return <View style={styles.screen}>{error ? <Empty text={error} /> : <Empty text="Loading…" />}</View>;
  }

  const report = m.report;
  const utterances = report?.cleanedUtterances ?? m.transcript?.utterances ?? [];

  const saveRename = async (value: string) => {
    const v = value.trim();
    const target = renaming;
    setRenaming(null);
    if (!v || !target) return;
    const patch = target.kind === "title" ? { title: v } : { speakerNames: { [target.speaker]: v } };
    setM(await api.rename(m.id, patch));
  };

  const shareReport = () => {
    if (!report) return;
    const lines = [
      m.title,
      new Date(m.createdAt).toLocaleString(),
      "",
      "SUMMARY",
      report.summary,
      "",
      "KEY POINTS",
      ...report.keyPoints.map((p) => `• ${p}`),
      "",
      "DECISIONS",
      ...(report.decisions.length ? report.decisions.map((d) => `• ${d}`) : ["• None recorded"]),
      "",
      "ACTION ITEMS",
      ...(report.actionItems.length ? report.actionItems.map((a) => `• ${a.task} (${a.owner}, ${a.due})`) : ["• None"]),
      "",
      "TRANSCRIPT",
      ...utterances.map((u) => `[${formatDuration(u.start)}] ${speakers[u.speaker]?.name ?? u.speaker}: ${u.text}`),
    ];
    Share.share({ title: m.title, message: lines.join("\n") });
  };

  const confirmDelete = () =>
    Alert.alert("Delete meeting?", "The recording, transcript and report will be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.remove(m.id);
          router.back();
        },
      },
    ]);

  const processing = m.status !== "ready" && m.status !== "failed";

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl, gap: space.md }}>
        <Pressable onPress={() => setRenaming({ kind: "title" })} accessibilityHint="Rename meeting">
          <Text style={type.headingLg}>{m.title}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
          <Text style={type.caption}>{new Date(m.createdAt).toLocaleString()}</Text>
          {report?.languages.length ? <Text style={type.caption}>{report.languages.join(" · ")}</Text> : null}
          <StatusPill status={m.status} />
        </View>

        {source ? <AudioBar ref={audioRef} source={source} fallbackDuration={m.durationSec} /> : null}

        {processing ? (
          <Card style={{ backgroundColor: colors.surfaceTint, shadowOpacity: 0 }}>
            <Text style={type.title}>{statusLabel[m.status]}…</Text>
            <Text style={type.bodySm}>
              This usually takes a minute or two. You can leave this screen; it keeps working in the background.
            </Text>
          </Card>
        ) : null}

        {!utterances.length && m.liveText ? (
          <Card>
            <SectionTitle>Live captions</SectionTitle>
            <Text style={type.body}>{m.liveText}</Text>
          </Card>
        ) : null}

        {m.status === "failed" ? (
          <Card>
            <Text style={[type.title, { color: colors.danger }]}>Processing failed</Text>
            <Text style={[type.bodySm, { marginVertical: space.sm }]}>{m.error}</Text>
            <Button label="Try again" variant="ink" onPress={async () => { await api.reprocess(m.id); load(); }} />
          </Card>
        ) : null}

        {utterances.length ? (
          <View style={styles.tabs}>
            {(["report", "transcript"] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
                <Text style={[type.label, { color: tab === t ? colors.text : colors.textMuted }]}>
                  {t === "report" ? "Report" : "Conversation"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {tab === "report" && report ? (
          <>
            <Card>
              <SectionTitle>Summary</SectionTitle>
              <Text style={type.body}>{report.summary}</Text>
              {report.summary.startsWith("The transcript is ready. Add ") ? (
                <View style={{ marginTop: space.md }}>
                  <Button label="Write AI report" variant="ink" onPress={async () => { await api.reprocess(m.id); load(); }} />
                </View>
              ) : null}
            </Card>
            {report.actionItems.length ? (
              <Card>
                <SectionTitle>Action items</SectionTitle>
                {report.actionItems.map((a, i) => (
                  <View key={i} style={styles.action}>
                    <View style={styles.check} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.title}>{a.task}</Text>
                      <Text style={type.caption}>
                        {a.owner} · {a.due}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
            <ListCard title="Key points" items={report.keyPoints} />
            <ListCard title="Decisions" items={report.decisions} empty="No decisions recorded." />
            {report.glossary.length ? (
              <Card style={{ backgroundColor: colors.surfaceTint, shadowOpacity: 0 }}>
                <SectionTitle>Slang & dialect</SectionTitle>
                {report.glossary.map((g, i) => (
                  <Text key={i} style={[type.bodySm, { marginBottom: 4 }]}>
                    <Text style={{ color: colors.text, fontFamily: type.label.fontFamily }}>{g.term}</Text> — {g.meaning}
                  </Text>
                ))}
              </Card>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Share report" variant="ink" onPress={shareReport} style={{ flex: 1 }} />
              <Button label="Delete" variant="ghost" onPress={confirmDelete} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}

        {tab === "transcript" ? (
          <>
            <Text style={type.caption}>Tap a line to play it. Tap a name to rename that speaker.</Text>
            {utterances.map((u, i) => (
              <Pressable key={i} onPress={() => audioRef.current?.seekAndPlay(u.start)} style={styles.utterance}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 }}>
                  <View style={[styles.speakerDot, { backgroundColor: speakers[u.speaker]?.dot }]} />
                  <Pressable onPress={() => setRenaming({ kind: "speaker", speaker: u.speaker })} hitSlop={8}>
                    <Text style={type.title}>{speakers[u.speaker]?.name ?? u.speaker}</Text>
                  </Pressable>
                  <Text style={type.caption}>{formatDuration(u.start)}</Text>
                </View>
                <Text style={[type.body, { color: colors.text }]}>{u.text}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={renaming !== null}
        title={renaming?.kind === "speaker" ? "Rename speaker" : "Rename meeting"}
        initial={renaming?.kind === "speaker" ? speakers[renaming.speaker]?.name ?? "" : m.title}
        onCancel={() => setRenaming(null)}
        onSubmit={saveRename}
      />
    </View>
  );
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {items.length ? (
        items.map((p, i) => (
          <Text key={i} style={[type.body, { marginBottom: 6 }]}>
            •  {p}
          </Text>
        ))
      ) : (
        <Text style={type.bodySm}>{empty}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTint, borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  action: { flexDirection: "row", gap: space.md, alignItems: "flex-start", paddingVertical: space.sm },
  check: { width: 18, height: 18, marginTop: 3, borderRadius: 5, borderWidth: 1.5, borderColor: colors.accent },
  utterance: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md },
  speakerDot: { width: 10, height: 10, borderRadius: radius.full },
});
