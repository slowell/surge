// Design tokens shared by every screen. M2 builds the UI primitives on top of these.
export const colors = {
  bg: "#0E0F13",
  surface: "#181A21",
  text: "#F4F5F7",
  textMuted: "#9AA0AE",
  accent: "#7CF2C4",
  danger: "#FF6B6B",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

export const type = {
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  body: { fontSize: 16, fontWeight: "400" },
  caption: { fontSize: 13, fontWeight: "500" },
} as const;
