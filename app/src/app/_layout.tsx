import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import { ActivityIndicator, View } from "react-native";
import { colors, fonts } from "../theme";
import { loadSettings } from "../api";

export default function RootLayout() {
  const [loaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold });
  const first = useSegments()[0];

  // Not logged in yet: show the log-in screen.
  useEffect(() => {
    if (!loaded || first === "login" || first === "info" || first === "contact") return;
    loadSettings().then((s) => {
      if (!s.token) router.replace("/login");
    });
  }, [loaded, first]);
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surfaceMuted },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.semibold },
          contentStyle: { backgroundColor: colors.surfaceMuted },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Home", headerShown: false }} />
        <Stack.Screen name="record" options={{ title: "New recording", headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="meeting/[id]" options={{ title: "" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="login" options={{ title: "Log in", headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="info/[page]" options={{ title: "" }} />
        <Stack.Screen name="contact" options={{ title: "Contact us" }} />
      </Stack>
    </>
  );
}
