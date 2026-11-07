import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { Button, Card, Logo } from "../components/ui";
import { colors, elevation, fonts, radius, space, type } from "../theme";

type Mode = "login" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setInviteRequired(!!h.inviteRequired))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (mode === "signup" && !agreed) {
      setError("Please tick the box to agree to the Terms, Privacy Policy and AI Use Policy.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await api.signUp({ name, email, password, inviteCode, acceptedTerms: agreed });
      else await api.logIn({ email, password });
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === "signup";

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Logo />
            <Pressable
              onPress={() => {
                setMode(signup ? "login" : "signup");
                setError(null);
              }}
              hitSlop={12}
              accessibilityRole="button"
            >
              <Text style={[type.label, { color: colors.textMuted }]}>{signup ? "Log in" : "Create account"}</Text>
            </Pressable>
          </View>

          {signup ? <Hero /> : null}

          <Text style={[type.headingLg, { marginTop: signup ? space.xl : space.lg }]}>
            {signup ? "Create your account" : "Welcome back"}
          </Text>
          <Text style={[type.body, { marginTop: space.sm, marginBottom: space.lg }]}>
            {signup
              ? "It's free and takes a minute. No app to install."
              : "Log in to see your meetings, transcripts and reports."}
          </Text>

          <Card>
            {signup ? <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" /> : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              hint={signup ? "At least 8 characters" : undefined}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoComplete={signup ? "new-password" : "current-password"}
              secureTextEntry
              onSubmitEditing={submit}
            />
            {signup && inviteRequired ? (
              <Field
                label="Invite code"
                hint="Ask the person who shared CIXCLE with you"
                value={inviteCode}
                onChangeText={setInviteCode}
                autoCapitalize="none"
              />
            ) : null}
            {signup ? (
              <Pressable
                onPress={() => setAgreed(!agreed)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                style={styles.agreeRow}
              >
                <View style={[styles.box, agreed && styles.boxOn]}>{agreed ? <Text style={styles.tick}>✓</Text> : null}</View>
                <Text style={[type.bodySm, { flex: 1 }]}>
                  I am 18 or older and agree to the{" "}
                  <Text style={styles.link} onPress={() => router.push("/info/terms")}>Terms of Service</Text>,{" "}
                  <Text style={styles.link} onPress={() => router.push("/info/privacy")}>Privacy Policy (PDPA)</Text> and{" "}
                  <Text style={styles.link} onPress={() => router.push("/info/ai")}>AI Use Policy</Text>. I consent to CIXCLE
                  processing my data as described, including by providers outside Malaysia.
                </Text>
              </Pressable>
            ) : null}
            {error ? <Text style={[type.bodySm, { color: colors.danger, marginBottom: space.md }]}>{error}</Text> : null}
            <Button label={signup ? "Create account" : "Log in"} onPress={submit} loading={busy} />
          </Card>

          <Pressable
            onPress={() => {
              setMode(signup ? "login" : "signup");
              setError(null);
            }}
            hitSlop={12}
            style={{ marginTop: space.lg, alignSelf: "center" }}
            accessibilityRole="button"
          >
            <Text style={type.label}>{signup ? "Already have an account? Log in" : "New here? Create an account"}</Text>
          </Pressable>
          <View style={styles.footer}>
            {[
              ["about", "About"],
              ["plans", "Plans"],
              ["terms", "Terms"],
              ["privacy", "Privacy"],
              ["ai", "AI use"],
              ["contact", "Contact us"],
            ].map(([key, label]) => (
              <Text
                key={key}
                style={[type.caption, styles.link]}
                onPress={() => router.push(key === "contact" ? "/contact" : `/info/${key}`)}
              >
                {label}
              </Text>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const FEATURES = [
  "Live captions while people talk, even in slang",
  "Full transcript showing who said what",
  "AI report with decisions and next steps",
  "Translate to English or Bahasa Melayu",
  "Works in your phone browser, no app to install",
];

function Hero() {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipBig}>100%</Text>
          <Text style={type.bodySm}>free to start</Text>
        </View>
        <View style={[styles.chip, { transform: [{ rotate: "1.2deg" }] }]}>
          <Text style={styles.chipBig}>1 tap</Text>
          <Text style={type.bodySm}>to record a meeting</Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>Never lose track of a meeting again.</Text>
      <View style={styles.underline} />
      <Text style={[type.body, styles.heroLead]}>
        CIXCLE records your meeting, writes the transcript and gives you a clear AI report. Malay, English and Manglish
        all okay.
      </Text>
      <View style={{ gap: space.sm + 4, marginTop: space.lg }}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.check}>✓</Text>
            <Text style={[type.body, { color: colors.text, flex: 1 }]}>{f}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={type.title}>{label}</Text>
      {hint ? <Text style={[type.caption, { marginBottom: space.xs }]}>{hint}</Text> : null}
      <TextInput {...props} style={styles.input} placeholderTextColor={colors.textSubtle} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm + 4, marginBottom: space.lg },
  chip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    ...elevation.e1,
  },
  chipBig: { fontFamily: fonts.semibold, fontSize: 22, color: colors.text },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 48, letterSpacing: -1.2, color: colors.text },
  underline: { height: 6, width: 190, borderRadius: 3, backgroundColor: colors.primary, marginTop: 6 },
  heroLead: { fontSize: 18, lineHeight: 28, marginTop: space.md },
  featureRow: { flexDirection: "row", gap: space.sm + 4, alignItems: "flex-start" },
  check: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.accent, width: 20 },
  agreeRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", marginBottom: space.md },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.onPrimary, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 16 },
  link: { color: colors.success, textDecorationLine: "underline" },
  footer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.md, marginTop: space.xl },
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: space.md, paddingTop: space.xl, width: "100%", maxWidth: 480, alignSelf: "center" },
  input: {
    marginTop: space.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
});
