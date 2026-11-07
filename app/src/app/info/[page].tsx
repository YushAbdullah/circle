import { ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { PAGES, type PageKey } from "../../legal";
import { Button, Card } from "../../components/ui";
import { space, type } from "../../theme";

/** About, Plans, Terms, Privacy and AI pages (open without logging in). */
export default function InfoPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const p = PAGES[page as PageKey] ?? PAGES.about;
  return (
    <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl, gap: space.md, width: "100%", maxWidth: 640, alignSelf: "center" }}>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ gap: space.sm, marginBottom: space.sm }}>
        <Text style={type.headingLg}>{p.title}</Text>
        {p.intro ? <Text style={type.body}>{p.intro}</Text> : null}
      </View>
      {p.sections.map((s, i) => (
        <Card key={i}>
          {s.heading ? <Text style={[type.title, { marginBottom: space.sm }]}>{s.heading}</Text> : null}
          <View style={{ gap: space.sm }}>
            {s.body.map((line, j) => (
              <Text key={j} style={type.body}>
                {line}
              </Text>
            ))}
          </View>
        </Card>
      ))}
      {page === "plans" ? (
        <Button label="Get the Business plan: fill in the form" variant="ink" onPress={() => router.push("/business")} />
      ) : null}
    </ScrollView>
  );
}
