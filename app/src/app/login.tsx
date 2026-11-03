import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { Button, Card, Logo } from "../components/ui";
import { colors, fonts, radius, space, type } from "../theme";

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
          <Logo />
          <Text style={[type.headingLg, { marginTop: space.lg }]}>{signup ? "Create your account" : "Welcome back"}</Text>
          <Text style={[type.body, { marginTop: space.sm, marginBottom: space.lg }]}>
            Record meetings in Malay, English or Manglish. CIRCLE writes the transcript and the report.
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
                hint="Ask the person who shared CIRCLE with you"
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
                  <Text style={styles.link} onPress={() => router.push("/info/ai")}>AI Use Policy</Text>. I consent to CIRCLE
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
