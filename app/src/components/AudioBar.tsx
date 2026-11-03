import { forwardRef, useImperativeHandle } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioSource } from "expo-audio";

// Play through the loudspeaker, even with the iPhone's silent switch on.
const playbackMode = () =>
  setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false }).catch(() => {});
import { formatDuration } from "../api";
import { colors, elevation, radius, space, type } from "../theme";

export interface AudioBarHandle {
  seekAndPlay: (sec: number) => void;
}

export const AudioBar = forwardRef<AudioBarHandle, { source: AudioSource; fallbackDuration?: number | null }>(
  function AudioBar({ source, fallbackDuration }, ref) {
    const player = useAudioPlayer(source, { updateInterval: 250 });
    const status = useAudioPlayerStatus(player);
    const duration = status.duration || fallbackDuration || 0;
    const progress = duration ? Math.min(1, status.currentTime / duration) : 0;

    useImperativeHandle(ref, () => ({
      seekAndPlay: async (sec: number) => {
        await playbackMode();
        await player.seekTo(sec);
        player.play();
      },
    }));

    return (
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause" : "Play"}
          onPress={async () => {
            if (status.playing) return player.pause();
            await playbackMode();
            player.play();
          }}
          style={styles.play}
        >
          <Text style={[type.title, { color: colors.onInk }]}>{status.playing ? "❚❚" : "▶"}</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={[type.caption, { fontVariant: ["tabular-nums"] }]}>
            {formatDuration(status.currentTime) || "0:00"} / {formatDuration(duration) || "--:--"}
          </Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    ...elevation.e1,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  track: { height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceTint, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.accent },
});
