import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { showAlert } from "../../alert";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { AudioSource } from "expo-audio";
import { api, formatDuration, statusLabel, type Meeting, type Translation } from "../../api";
import { AskAI } from "../../components/AskAI";
import { AudioBar, type AudioBarHandle } from "../../components/AudioBar";
import { PromptModal } from "../../components/PromptModal";
import { Button, Card, Empty, SectionTitle, StatusPill } from "../../components/ui";
import { colors, elevation, radius, space, type } from "../../theme";

// Speaker accent dots: mint, ink, then derived greens/greys (decorative only, never text colour).
const SPEAKER_DOTS = [colors.primary, colors.ink, colors.accent, "#9AA59C", "#B7E4C0", "#5F655F"];

type Tab = "report" | "transcript" | "ask";
const TAB_LABEL: Record<Tab, string> = { report: "Report", transcript: "Conversation", ask: "Ask AI" };
const LANGS = [
  { key: null, label: "Original" },
  { key: "English", label: "English" },
  { key: "Malay", label: "Bahasa Melayu" },
] as const;
const NO_AI_PREFIX = "The transcript is ready. Add ";

export default function MeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [source, setSource] = useState<AudioSource | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "title" } | { kind: "speaker"; speaker: string } | null>(null);
  const audioRef = useRef<AudioBarHandle>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [translating, setTranslating] = useState(false);

  const chooseLanguage = async (language: string | null) => {
    setLang(language);
    if (!language || !m) return setTranslation(null);
    const cached = m.translations?.[language];
    if (cached) return setTranslation(cached);
    setTranslating(true);
    setTranslation(null);
    try {
      setTranslation(await api.translate(m.id, language));
    } catch (e) {
      setLang(null);
      showAlert("Translation failed", (e as Error).message);
    } finally {
      setTranslating(false);
    }
  };

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
      "RECOMMENDATIONS",
      ...(report.recommendations?.length ? report.recommendations.map((r) => `• ${r}`) : ["• None"]),
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
    showAlert("Delete", "What do you want to delete?", [
      ...(m.audioDeleted
        ? []
        : [
            {
              text: "Recording only (keep report)",
              onPress: async () => {
                try {
                  setM(await api.deleteAudio(m.id));
                } catch (e) {
                  showAlert("Couldn't delete", (e as Error).message);
                }
              },
            },
          ]),
      {
        text: "Whole meeting",
        style: "destructive" as const,
        onPress: async () => {
          await api.remove(m.id);
          router.back();
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ]);

  const hasAiReport = !!report && !report.summary.startsWith(NO_AI_PREFIX);
  const tr = lang ? translation : null;
  const view = report
    ? {
        summary: tr?.summary ?? report.summary,
        keyPoints: tr?.keyPoints.length ? tr.keyPoints : report.keyPoints,
        decisions: tr?.decisions.length ? tr.decisions : report.decisions,
        recommendations: tr?.recommendations.length ? tr.recommendations : report.recommendations ?? [],
        actionItems: report.actionItems.map((a, i) => ({ ...a, task: tr?.actionItems[i] ?? a.task })),
      }
    : null;
  const speakerCount = Object.keys(speakers).length;

  const processing = m.status !== "ready" && m.status !== "failed";

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => setRenaming({ kind: "title" })} accessibilityHint="Rename meeting">
          <Text style={type.headingLg}>{m.title}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
          <Text style={type.caption}>{new Date(m.createdAt).toLocaleString()}</Text>
          {report?.languages.length ? <Text style={type.caption}>{report.languages.join(" · ")}</Text> : null}
          <StatusPill status={m.status} />
        </View>

        {report ? (
          <View style={styles.stats}>
            <Stat value={formatDuration(m.durationSec) || "–"} label="Length" />
            <Stat value={String(speakerCount || "–")} label={speakerCount === 1 ? "Speaker" : "Speakers"} />
            <Stat value={String(report.actionItems.length)} label="Actions" />
          </View>
        ) : null}

        {m.audioDeleted ? (
          <Text style={[type.caption, { paddingHorizontal: space.xs }]}>Recording deleted. The transcript and report are kept.</Text>
        ) : source ? (
          <AudioBar ref={audioRef} source={source} fallbackDuration={m.durationSec} />
        ) : null}

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
            {(["report", "transcript", "ask"] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
                <Text style={[type.label, { color: tab === t ? colors.text : colors.textMuted }]}>{TAB_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {utterances.length && hasAiReport && tab !== "ask" ? (
          <View style={styles.langRow}>
            <Text style={type.caption}>Translate</Text>
            {LANGS.map((l) => {
              const active = lang === l.key;
              return (
                <Pressable
                  key={l.label}
                  onPress={() => chooseLanguage(l.key)}
                  disabled={translating}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[type.caption, { color: active ? colors.onInk : colors.text }]}>{l.label}</Text>
                </Pressable>
              );
            })}
            {translating ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>
        ) : null}

        {tab === "report" && report && view ? (
          <>
            <Card>
              <SectionTitle>Summary</SectionTitle>
              <Text style={type.body}>{view.summary}</Text>
              {!hasAiReport ? (
                <View style={{ marginTop: space.md }}>
                  <Button label="Write AI report" variant="ink" onPress={async () => { await api.reprocess(m.id); load(); }} />
                </View>
              ) : null}
            </Card>
            {view.recommendations.length ? (
              <View style={styles.recommend}>
                <Text style={[type.title, { color: colors.onInk, marginBottom: space.sm }]}>✦  CIRCLE recommends</Text>
                {view.recommendations.map((r, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space.sm, marginBottom: space.sm }}>
                    <Text style={[type.label, { color: colors.primary }]}>{i + 1}</Text>
                    <Text style={[type.body, { color: "#E6EEE8", flex: 1 }]}>{r}</Text>
                  </View>
                ))}
                <Pressable onPress={() => setTab("ask")} hitSlop={8}>
                  <Text style={[type.label, { color: colors.primary }]}>Discuss with AI →</Text>
                </Pressable>
              </View>
            ) : hasAiReport ? (
              <Pressable onPress={() => setTab("ask")} style={styles.recommendCta}>
                <Text style={type.title}>✦  Ask AI for recommendations</Text>
                <Text style={type.caption}>Talk through next steps by voice or text</Text>
              </Pressable>
            ) : null}
            {view.actionItems.length ? (
              <Card>
                <SectionTitle>Action items</SectionTitle>
                {view.actionItems.map((a, i) => (
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
            <ListCard title="Key points" items={view.keyPoints} />
            <ListCard title="Decisions" items={view.decisions} empty="No decisions recorded." />
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
              <Button label="Delete…" variant="ghost" onPress={confirmDelete} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}

        {tab === "transcript" ? (
          <>
            <Text style={type.caption}>
              {m.audioDeleted ? "Tap a name to rename that speaker." : "Tap a line to play it. Tap a name to rename that speaker."}
            </Text>
            {utterances.map((u, i) => (
              <Pressable key={i} onPress={() => !m.audioDeleted && audioRef.current?.seekAndPlay(u.start)} style={styles.utterance}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 }}>
                  <View style={[styles.speakerDot, { backgroundColor: speakers[u.speaker]?.dot }]} />
                  <Pressable onPress={() => setRenaming({ kind: "speaker", speaker: u.speaker })} hitSlop={8}>
                    <Text style={type.title}>{speakers[u.speaker]?.name ?? u.speaker}</Text>
                  </Pressable>
                  <Text style={type.caption}>{formatDuration(u.start)}</Text>
                </View>
                {tr?.utterances[i] && tr.utterances[i] !== u.text ? (
                  <>
                    <Text style={[type.body, { color: colors.text }]}>{tr.utterances[i]}</Text>
                    <Text style={[type.caption, { marginTop: 4 }]}>{u.text}</Text>
                  </>
                ) : (
                  <Text style={[type.body, { color: colors.text }]}>{u.text}</Text>
                )}
              </Pressable>
            ))}
          </>
        ) : null}
        {/* Kept mounted so the chat survives switching tabs. */}
        {utterances.length ? (
          <View style={{ display: tab === "ask" ? "flex" : "none" }}>
            <AskAI meetingId={m.id} />
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.headingMd}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
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
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: space.md, ...elevation.e1 },
  langRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  recommend: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: space.lg, ...elevation.e2 },
  recommendCta: { backgroundColor: colors.surfaceTint, borderRadius: radius.lg, padding: space.lg, gap: 4 },
});
