import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { api, loadSettings, logOut, type Account } from "../api";
import { Button, Card } from "../components/ui";
import { colors, fonts, radius, space, type } from "../theme";

/** Self-service account deletion (PDPA): needs the password and typing DELETE. */
export default function DeleteAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => setAccount(s.account ?? null));
  }, []);

  const ready = !!password && confirm.trim().toUpperCase() === "DELETE";

  const remove = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({ email: account.email, password });
      await logOut();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={type.headingLg}>Delete my account</Text>
      <Card style={{ marginTop: space.lg }}>
        <Text style={type.body}>
          This permanently deletes {account ? <Text style={{ fontFamily: fonts.semibold }}>{account.email}</Text> : "your account"}{" "}
          and all your meetings, recordings, transcripts and reports. It can't be undone.
        </Text>
        <Text style={[type.title, { marginTop: space.lg, marginBottom: space.xs }]}>Your password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
        <Text style={[type.title, { marginTop: space.md, marginBottom: space.xs }]}>Type DELETE to confirm</Text>
        <TextInput value={confirm} onChangeText={setConfirm} autoCapitalize="characters" style={styles.input} />
        {error ? <Text style={[type.bodySm, { color: colors.danger, marginTop: space.md }]}>{error}</Text> : null}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button label="Delete my account forever" variant="danger" onPress={remove} loading={busy} disabled={!ready || !account} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space.xxl, width: "100%", maxWidth: 560, alignSelf: "center" },
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
