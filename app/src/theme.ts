// Tokens from docs/design.md ("Fealty" mint system), adapted for mobile.
export const colors = {
  primary: "#6BE683",
  onPrimary: "#003503",
  primaryPressed: "#55D86C",
  accent: "#1CBB6C",
  surface: "#FFFFFF",
  surfaceMuted: "#F6FEF6",
  surfaceTint: "#E3F8E6",
  ink: "#262828",
  onInk: "#FFFFFF",
  border: "#DDEBDF",
  text: "#0F1A12",
  textMuted: "#4E544F",
  textSubtle: "#5F655F",
  success: "#1A7F55",
  warning: "#9A6A00",
  danger: "#C42A36",
  onDanger: "#FFFFFF",
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 8, md: 12, lg: 24, xl: 40, full: 9999 };

export const fonts = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
};

export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 48, letterSpacing: -0.9, color: colors.text },
  headingLg: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 40, letterSpacing: -0.6, color: colors.text },
  headingMd: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: colors.text },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.textMuted },
  bodySm: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.24, color: colors.textSubtle },
} as const;

// Soft, green-tinted shadows (never neutral black).
export const elevation = {
  e1: {
    shadowColor: "#102814",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  e2: {
    shadowColor: "#102814",
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  e3: {
    shadowColor: "#102814",
    shadowOpacity: 0.14,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 24 },
    elevation: 8,
  },
};
