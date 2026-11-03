import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api, loadSettings, saveSettings, type Settings } from "../api";
import { Button, Card } from "../components/ui";
import { colors, fonts, radius, space, type } from "../theme";

export default function SettingsScreen() {
  const [s, setS] = useState<Settings>({ serverUrl: "", token: "", vocabulary: "" });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings().then(setS);
  }, []);

  const save = async () => {
    await saveSettings(s);
    setTesting(true);
    try {
      const h = await api.health();
      await api.list(); // also checks the access token
      const notes = [
        h.demoMode
          ? "Demo mode: add ELEVENLABS_API_KEY on the server for real transcription. Every recording returns a sample for now."
          : h.transcriptOnly
            ? "Real transcripts are on. Add ANTHROPIC_API_KEY on the server to also get AI reports."
            : "Real transcription and AI reports are on.",
      ];
      if (h.storage === "local") {
        notes.push("Warning: meetings are stored on the server's own disk. On free hosting they are deleted when it sleeps. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to keep them.");
      }
      Alert.alert("Connected", notes.join("\n\n"));
      router.back();
    } catch (e) {
      Alert.alert("Could not connect", (e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <Card>
        <Field
          label="Server address"
          hint="e.g. https://circle-server.example.com or http://192.168.1.20:4000"
          value={s.serverUrl}
          onChangeText={(v) => setS({ ...s, serverUrl: v })}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Field
          label="Access token"
          hint="The APP_TOKEN set on the server"
          value={s.token}
          onChangeText={(v) => setS({ ...s, token: v })}
          autoCapitalize="none"
          secureTextEntry
        />
      </Card>
      <Card>
        <Field
          label="Custom words"
          hint="Names, company terms or slang the AI should listen for, separated by commas. e.g. Yusri, CIRCLE, tapau, KL Sentral"
          value={s.vocabulary}
          onChangeText={(v) => setS({ ...s, vocabulary: v })}
          multiline
        />
      </Card>
      <Button label="Save" onPress={save} loading={testing} />
    </ScrollView>
  );
}

function Field({ label, hint, ...props }: { label: string; hint: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={type.title}>{label}</Text>
      <Text style={[type.caption, { marginBottom: space.sm }]}>{hint}</Text>
      <TextInput {...props} style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: "top" }]} placeholderTextColor={colors.textSubtle} />
    </View>
  );
}

const styles = StyleSheet.create({
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
