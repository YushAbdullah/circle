import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api, loadSettings } from "../api";
import { Button, Card } from "../components/ui";
import { colors, fonts, radius, space, type } from "../theme";

const TEAM_SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];
const MEETINGS = ["Under 10", "10–50", "50–200", "200+"];
const NEEDS = ["Longer meetings", "Unlimited Ask AI", "Team sharing", "Custom words", "Invoices", "Data in Malaysia"];

/** Business plan enquiry: a short form that is sent to the CIXCLE owner. Works without logging in. */
export default function Business() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [teamSize, setTeamSize] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<string | null>(null);
  const [needs, setNeeds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
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

  const toggleNeed = (n: string) => setNeeds((list) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]));

  const send = async () => {
    setError(null);
    if (!name.trim() || !company.trim()) return setError("Please fill in your name and company.");
    setBusy(true);
    try {
      const message = [
        "BUSINESS PLAN ENQUIRY",
        `Company: ${company.trim()}`,
        `Contact: ${name.trim()}`,
        `Phone / WhatsApp: ${phone.trim() || "-"}`,
        `Team size: ${teamSize ?? "-"}`,
        `Meetings per month: ${meetings ?? "-"}`,
        `Needs: ${needs.length ? needs.join(", ") : "-"}`,
        "",
        notes.trim() || "(no extra notes)",
      ].join("\n");
      await api.contact({ name: name.trim(), email: email.trim(), topic: "Business plan", message });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={[type.caption, { color: colors.primary, letterSpacing: 1.2 }]}>CIXCLE BUSINESS</Text>
        <Text style={[type.headingLg, { color: colors.onInk, marginTop: space.xs }]}>The full version for your team</Text>
        <Text style={[type.bodySm, { color: "#C9D3CB", marginTop: space.sm }]}>
          Tell us about your company and we'll send you a plan and price that fits. No payment now.
        </Text>
      </View>

      {sent ? (
        <Card style={{ marginTop: space.lg }}>
          <Text style={type.title}>Thank you, we've got it!</Text>
          <Text style={[type.body, { marginTop: space.sm }]}>We'll contact you at {email} with a proposal soon.</Text>
          <Button label="Back" variant="ink" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ marginTop: space.lg }} />
        </Card>
      ) : (
        <Card style={{ marginTop: space.lg }}>
          <Label text="Your name" />
          <TextInput value={name} onChangeText={setName} style={styles.input} autoComplete="name" />
          <Label text="Company" />
          <TextInput value={company} onChangeText={setCompany} style={styles.input} autoComplete="organization" />
          <Label text="Work email" />
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Label text="Phone or WhatsApp (optional)" />
          <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" autoComplete="tel" />

          <Label text="Team size" />
          <Chips options={TEAM_SIZES} selected={teamSize ? [teamSize] : []} onPress={setTeamSize} />
          <Label text="Meetings per month" />
          <Chips options={MEETINGS} selected={meetings ? [meetings] : []} onPress={setMeetings} />
          <Label text="What do you need? (pick any)" />
          <Chips options={NEEDS} selected={needs} onPress={toggleNeed} />

          <Label text="Anything else?" />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. weekly sales meetings in Malay and English, budget, start date"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />
          {error ? <Text style={[type.bodySm, { color: colors.danger, marginTop: space.md }]}>{error}</Text> : null}
          <Button label="Send enquiry" onPress={send} loading={busy} style={{ marginTop: space.lg }} />
        </Card>
      )}
    </ScrollView>
  );
}

function Chips({ options, selected, onPress }: { options: string[]; selected: string[]; onPress: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable key={o} onPress={() => onPress(o)} accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[type.bodySm, { color: on ? colors.onPrimary : colors.text }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={[type.title, { marginTop: space.md, marginBottom: space.xs }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space.xxl, width: "100%", maxWidth: 560, alignSelf: "center" },
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
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
