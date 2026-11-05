import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, loadSettings } from "../api";
import { Button, Card } from "../components/ui";
import { colors, fonts, radius, space, type } from "../theme";

const TOPICS = ["Question or feedback", "Privacy / PDPA request", "Delete my account", "Pro or Team plan", "Report a problem"];

/** Contact form: the server emails it to the CIXCLE owner. Works without logging in. */
export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.account) {
        setName((n) => n || s.account!.name);
        setEmail((e) => e || s.account!.email);
      }
    });
  }, []);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.contact({ name, email, topic, message });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={type.headingLg}>Contact us</Text>
      <Text style={[type.body, { marginTop: space.sm, marginBottom: space.lg }]}>
        Questions, privacy (PDPA) requests, deleting your account or interest in a paid plan. We reply by email.
      </Text>
      {sent ? (
        <Card>
          <Text style={type.title}>Message sent. Terima kasih!</Text>
          <Text style={[type.body, { marginTop: space.sm }]}>We'll reply to {email} as soon as we can.</Text>
        </Card>
      ) : (
        <Card>
          <Label text="Topic" />
          <View style={styles.topics}>
            {TOPICS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTopic(t)}
                accessibilityRole="radio"
                accessibilityState={{ selected: topic === t }}
                style={[styles.chip, topic === t && styles.chipOn]}
              >
                <Text style={[type.bodySm, { color: topic === t ? colors.onPrimary : colors.text }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Label text="Your name" />
          <TextInput value={name} onChangeText={setName} style={styles.input} autoComplete="name" />
          <Label text="Your email" />
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Label text="Message" />
          <TextInput value={message} onChangeText={setMessage} style={[styles.input, { minHeight: 140, textAlignVertical: "top" }]} multiline />
          {error ? <Text style={[type.bodySm, { color: colors.danger, marginTop: space.md }]}>{error}</Text> : null}
          <Button label="Send" onPress={send} loading={busy} style={{ marginTop: space.lg }} />
        </Card>
      )}
    </ScrollView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={[type.title, { marginTop: space.md, marginBottom: space.xs }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space.xxl, width: "100%", maxWidth: 560, alignSelf: "center" },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: {
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
