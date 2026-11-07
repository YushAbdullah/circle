import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export type WaveState = "idle" | "listening" | "thinking" | "speaking";

const RINGS = 3;
const useNative = Platform.OS !== "web";

/**
 * The CIXCLE AI orb: a solid circle with rings that ripple outwards.
 * Calm when idle, faster while thinking or speaking, red while listening.
 */
export function CircleWaves({ size = 56, state = "idle" }: { size?: number; state?: WaveState }) {
  // One clock drives every ring; each ring is offset by a third of a cycle.
  const clock = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const rings = useRef(
    Array.from({ length: RINGS }, (_, i) => {
      const o = i / RINGS;
      return o === 0
        ? clock.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
        : clock.interpolate({ inputRange: [0, 1 - o, 1 - o + 0.0001, 1], outputRange: [o, 1, 0, o] });
    }),
  ).current;

  const period = state === "idle" ? 3200 : state === "thinking" ? 1400 : 1000;

  useEffect(() => {
    clock.setValue(0);
    const loops = [
      Animated.loop(Animated.timing(clock, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: useNative })),
    ];
    const core = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 0, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loops.forEach((l) => l.start());
    core.start();
    return () => {
      loops.forEach((l) => l.stop());
      core.stop();
    };
  }, [period, clock, pulse]);

  const tint = state === "listening" ? colors.danger : colors.primary;
  const core = size * 0.46;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`CIXCLE AI, ${state}`}>
      {rings.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size,
              borderWidth: 2,
              borderColor: tint,
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
            },
          ]}
        />
      ))}
      <Animated.View
        style={{
          width: core,
          height: core,
          borderRadius: core,
          backgroundColor: tint,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, state === "idle" ? 1 : 1.12] }) }],
        }}
      />
    </View>
  );
}
