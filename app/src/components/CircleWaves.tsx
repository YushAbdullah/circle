import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";

export type WaveState = "idle" | "listening" | "thinking" | "speaking";

const useNative = Platform.OS !== "web";

// CIXCLE mint palette for the glowing strands (design.md: primary, accent, plus lighter/teal tints).
const MINT = ["#6BE683", "#1CBB6C", "#B7F5C4", "#3FD6A6", "#8EF0A2", "#26C98A", "#D6FBDD"];
const RED = ["#FF6B78", "#C42A36", "#FFB3BA", "#FF8A94", "#E0454F", "#FFD0D4", "#F2606B"];

// Each strand is a slightly squashed ellipse (whole turns per cycle, so the loop is seamless); rotating them at different speeds
// makes their outlines cross and weave, like a glowing sound-wave ring.
const STRANDS = [
  { w: 1.0, h: 0.86, turn: 1, speed: 1, opacity: 0.95 },
  { w: 0.86, h: 1.0, turn: -1, speed: 2, opacity: 0.8 },
  { w: 0.98, h: 0.8, turn: 1, speed: 1, opacity: 0.7 },
  { w: 0.84, h: 0.96, turn: -1, speed: 1, opacity: 0.65 },
  { w: 1.0, h: 0.9, turn: -1, speed: 3, opacity: 0.55 },
  { w: 0.9, h: 0.82, turn: 1, speed: 2, opacity: 0.5 },
  { w: 0.94, h: 0.98, turn: 1, speed: 3, opacity: 0.45 },
];

/**
 * The CIXCLE AI ring: glowing mint strands that weave around a circle.
 * Calm when idle, faster and brighter while thinking or speaking, red while listening.
 */
export function CircleWaves({ size = 56, state = "idle" }: { size?: number; state?: WaveState }) {
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  const busy = state !== "idle";
  const period = state === "idle" ? 14000 : state === "thinking" ? 6000 : 4500;

  useEffect(() => {
    spin.setValue(0);
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: useNative }));
    const half = state === "idle" ? 2200 : 700;
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(breathe, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    s.start();
    b.start();
    return () => {
      s.stop();
      b.stop();
    };
  }, [period, state, spin, breathe]);

  const palette = state === "listening" ? RED : MINT;
  const stroke = Math.max(1, size / 70);
  const glow = palette[0];

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`CIXCLE AI, ${state}`}>
      {/* Soft halo behind the ring. */}
      <Animated.View
        style={{
          position: "absolute",
          width: size * 0.9,
          height: size * 0.9,
          borderRadius: size,
          backgroundColor: glow,
          opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: busy ? [0.05, 0.12] : [0.03, 0.07] }),
        }}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: busy ? [0.9, 1] : [0.94, 0.99] }) }],
        }}
      >
        {STRANDS.map((st, i) => {
          const turns = st.turn * st.speed;
          return (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                width: size * 0.86 * st.w,
                height: size * 0.86 * st.h,
                borderRadius: size,
                borderWidth: stroke * (i === 0 ? 1.6 : 1),
                borderColor: palette[i % palette.length],
                opacity: st.opacity,
                shadowColor: glow,
                shadowOpacity: 0.9,
                shadowRadius: size / 14,
                shadowOffset: { width: 0, height: 0 },
                transform: [
                  { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: [`${i * 26}deg`, `${i * 26 + 360 * turns}deg`] }) },
                ],
              }}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}
