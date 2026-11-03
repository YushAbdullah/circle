import { Alert, Platform, type AlertButton } from "react-native";

/**
 * Alert.alert does nothing in a web browser, so the web version uses the
 * browser's own pop-ups. With two or more buttons, OK picks the main
 * (non-cancel) button and Cancel picks the cancel button.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length < 2) {
    globalThis.alert?.(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  // Browsers only have OK/Cancel, so offer each choice in turn; the first OK wins.
  const cancel = buttons.find((b) => b.style === "cancel");
  const choices = buttons.filter((b) => b !== cancel);
  for (const b of choices) {
    const question = choices.length === 1 ? text : `${text}\n\n${b.text ?? "OK"}?`;
    if (globalThis.confirm?.(question)) {
      b.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}
