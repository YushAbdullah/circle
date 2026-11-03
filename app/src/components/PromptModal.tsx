import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "./ui";
import { colors, fonts, radius, space, type } from "../theme";

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function PromptModal({
  visible,
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initial: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text style={type.headingMd}>{title}</Text>
          <TextInput value={value} onChangeText={setValue} autoFocus style={styles.input} onSubmitEditing={() => onSubmit(value)} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button label="Save" onPress={() => onSubmit(value)} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(15,26,18,0.4)", justifyContent: "center", padding: space.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md },
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
