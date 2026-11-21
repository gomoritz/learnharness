/**
 * THEMES (theme wave, 2026-11-04): the color vocabulary the user picks,
 * imports and exports, and its translation into the shadcn tokens the
 * components already consume. Pure and browser-safe: the layout (first
 * paint), the provider, the Settings section and the themes API share it.
 *
 * A theme is 12 hex colors plus the variant it renders as (dark/light).
 * Built-in presets live here; custom ones are JSON files under
 * config.THEMES_DIR (the ThemeStore port). The settings record names a
 * light and a dark theme (slots, each with per-color OVERRIDES that survive
 * theme switches) and whether the light slot, the dark slot or the OS
 * decides what renders — see "Light/dark slots" below.
 */

import type { AppearanceSettings } from "./settings.ts";

/** The variant on screen: the `dark`/`light` class on <html>. */
export type ThemeMode = "dark" | "light";
/** Kept for the mode-aware renderers (graph canvas, mermaid). */
export type RenderedMode = ThemeMode;

/** The 12 theme colors, in the order the Settings grid shows them. */
export const THEME_COLOR_KEYS = [
	"background",
	"accent",
	"surface",
	"bold",
	"border",
	"italic",
	"text",
	"code",
	"textMuted",
	"error",
	"success",
	"warning",
] as const;

/** One of the twelve theme colors. */
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
/** A full palette: every key, each a #hex. */
export type ThemeColors = Record<ThemeColorKey, string>;

/** The keys whose override lives in `appearance.colors` — the other three
 *  keep their pre-theme homes (`background`, `mdRendering.boldColor` and
 *  `mdRendering.italicColor`). */
export const COLOR_OVERRIDE_KEYS = [
	"surface",
	"border",
	"text",
	"textMuted",
	"accent",
	"code",
	"error",
	"success",
	"warning",
] as const;

/** A key whose override lives in `appearance.colors`. */
export type ColorOverrideKey = (typeof COLOR_OVERRIDE_KEYS)[number];
/** `appearance.colors`: hex wins over the theme; null/absent = the theme's color. */
export type AppearanceColorOverrides = Partial<Record<ColorOverrideKey, string | null>>;

/** The file / JSON shape (import and export). */
export interface ThemeFile {
	name: string;
	mode: ThemeMode;
	colors: ThemeColors;
}

/** A theme in the catalog: a preset (`builtin`) or an imported file,
 *  addressed by its slug id. */
export interface Theme extends ThemeFile {
	id: string;
	builtin: boolean;
}

/** The theme a record without `appearance.theme` renders. */
export const DEFAULT_THEME_ID = "default";

/** #rgb / #rrggbb (case-insensitive). Mirrors settings.isHexColor without
 *  importing it (settings.ts imports this module's types). */
function isHex(value: unknown): value is string {
	return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Validate an imported theme: `{ ok: false, error }` names the first bad
 *  field so the import card can say what is wrong. Unknown keys drop. */
export function parseThemeFile(raw: unknown): { ok: true; theme: ThemeFile } | { ok: false, error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "theme must be a JSON object" };
	const r = raw as Record<string, unknown>;
	if (typeof r.name !== "string" || !r.name.trim()) return { ok: false, error: "name must be a non-empty string" };
	if (!themeIdFromName(r.name)) return { ok: false, error: "name must contain a letter or digit" };
	if (r.mode !== "dark" && r.mode !== "light") return { ok: false, error: 'mode must be "dark" or "light"' };
	if (!r.colors || typeof r.colors !== "object" || Array.isArray(r.colors)) {
		return { ok: false, error: "colors must be an object" };
	}
	const c = r.colors as Record<string, unknown>;
	const colors = {} as ThemeColors;
	for (const key of THEME_COLOR_KEYS) {
		if (!isHex(c[key])) return { ok: false, error: `colors.${key} must be a #hex color` };
		colors[key] = c[key];
	}
	return { ok: true, theme: { name: r.name.trim(), mode: r.mode, colors } };
}

/** The sanitizer form: the theme, or null when anything is off. */
export function sanitizeThemeFile(raw: unknown): ThemeFile | null {
	const parsed = parseThemeFile(raw);
	return parsed.ok ? parsed.theme : null;
}

/** "Rosé Pine Moon" → "rose-pine-moon". Empty when nothing survives. */
export function themeIdFromName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 64)
		.replace(/^-+|-+$/g, "");
}

/** Valid theme ids: the slug grammar themeIdFromName produces. */
export function isThemeId(value: unknown): value is string {
	return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}

function builtin(name: string, mode: ThemeMode, c: ThemeColors): Theme {
	return { id: themeIdFromName(name), name, mode, colors: c, builtin: true };
}

/** The presets, in grid order. Default = the app's original dark palette
 *  (app/globals.css carries it as literals; tests pin the two equal).
 *  Catppuccin: base/surface0/surface1, mauve accent, lavender/pink/peach
 *  emphasis; Latte takes mantle/surface0 instead, because surface0 on a
 *  light page reads as a heavy gray slab, and Frappé's bold is flamingo
 *  (owner, 2026-11-04).
 *  Rosé Pine: base/surface/highlight-med, iris accent, iris/rose/gold
 *  emphasis. Gruvbox Dark: medium (bg0/bg0_s/bg2) with the bright
 *  accents; orange accent, blue/purple/aqua emphasis. Ivory: warm ivory
 *  page, terracotta accent, blue/green/clay emphasis. Pastel: a gray-cream
 *  page with soft green, purple and orange inks. NvChad Onedark: base46's
 *  onedark. */
export const BUILTIN_THEMES: readonly Theme[] = [
	{
		id: DEFAULT_THEME_ID,
		name: "Default",
		mode: "dark",
		builtin: true,
		colors: {
			background: "#141414", surface: "#1c1c1c", border: "#434343", text: "#e6e6e6", textMuted: "#8d8d8d",
			accent: "#8d8d8d", bold: "#e6e6e6", italic: "#e6e6e6", code: "#e6e6e6",
			error: "#ef4444", success: "#22c55e", warning: "#f59e0b",
		},
	},
	builtin("Catppuccin Latte", "light", {
		background: "#eff1f5", surface: "#e6e9ef", border: "#ccd0da", text: "#4c4f69", textMuted: "#6c6f85",
		accent: "#8839ef", bold: "#7287fd", italic: "#ea76cb", code: "#fe640b",
		error: "#d20f39", success: "#40a02b", warning: "#df8e1d",
	}),
	builtin("Catppuccin Frappé", "dark", {
		background: "#303446", surface: "#414559", border: "#51576d", text: "#c6d0f5", textMuted: "#a5adce",
		accent: "#ca9ee6", bold: "#eebebe", italic: "#f4b8e4", code: "#ef9f76",
		error: "#e78284", success: "#a6d189", warning: "#e5c890",
	}),
	builtin("Catppuccin Macchiato", "dark", {
		background: "#24273a", surface: "#363a4f", border: "#494d64", text: "#cad3f5", textMuted: "#a5adcb",
		accent: "#c6a0f6", bold: "#b7bdf8", italic: "#f5bde6", code: "#f5a97f",
		error: "#ed8796", success: "#a6da95", warning: "#eed49f",
	}),
	builtin("Catppuccin Mocha", "dark", {
		background: "#1e1e2e", surface: "#313244", border: "#45475a", text: "#cdd6f4", textMuted: "#a6adc8",
		accent: "#cba6f7", bold: "#b4befe", italic: "#f5c2e7", code: "#fab387",
		error: "#f38ba8", success: "#a6e3a1", warning: "#f9e2af",
	}),
	builtin("Rosé Pine", "dark", {
		background: "#191724", surface: "#1f1d2e", border: "#403d52", text: "#e0def4", textMuted: "#908caa",
		accent: "#c4a7e7", bold: "#c4a7e7", italic: "#ebbcba", code: "#f6c177",
		error: "#eb6f92", success: "#9ccfd8", warning: "#f6c177",
	}),
	builtin("Rosé Pine Dawn", "light", {
		background: "#faf4ed", surface: "#fffaf3", border: "#dfdad9", text: "#575279", textMuted: "#797593",
		accent: "#907aa9", bold: "#907aa9", italic: "#d7827e", code: "#ea9d34",
		error: "#b4637a", success: "#56949f", warning: "#ea9d34",
	}),
	builtin("Gruvbox Dark", "dark", {
		background: "#282828", surface: "#32302f", border: "#504945", text: "#ebdbb2", textMuted: "#a89984",
		accent: "#fe8019", bold: "#83a598", italic: "#d3869b", code: "#8ec07c",
		error: "#fb4934", success: "#b8bb26", warning: "#fabd2f",
	}),
	builtin("Ivory", "light", {
		background: "#faf9f5", surface: "#f0eee6", border: "#e0ddd2", text: "#3d3d3a", textMuted: "#83827d",
		accent: "#d97757", bold: "#3266c9", italic: "#3f8f6b", code: "#c4613f",
		error: "#c43d3d", success: "#3f8f6b", warning: "#b8822a",
	}),
	builtin("Pastel", "light", {
		background: "#f2f0e8", surface: "#e8e6dc", border: "#d6d3c6", text: "#4a4842", textMuted: "#8f8b80",
		accent: "#4f8a46", bold: "#4f8a46", italic: "#8a5cb5", code: "#b8623b",
		error: "#c0533f", success: "#4f8a46", warning: "#b8862c",
	}),
	builtin("NvChad Onedark", "dark", {
		background: "#1e222a", surface: "#282c34", border: "#42464e", text: "#abb2bf", textMuted: "#565c64",
		accent: "#61afef", bold: "#c882e7", italic: "#a3b8ef", code: "#e7c787",
		error: "#e06c75", success: "#98c379", warning: "#e7c787",
	}),
];

/** The app's original dark palette, and the fallback for a missing id. */
export const DEFAULT_THEME: Theme = BUILTIN_THEMES[0]!;

/** Preset ids are reserved: imports never take them, DELETE refuses them. */
export function isBuiltinThemeId(id: string): boolean {
	return BUILTIN_THEMES.some((t) => t.id === id);
}

/** The active theme: the record's id among builtins and customs, or
 *  Default when the id is absent or its file is gone. */
export function resolveTheme(id: string | null | undefined, customs: readonly Theme[] = []): Theme {
	if (!id) return DEFAULT_THEME;
	return BUILTIN_THEMES.find((t) => t.id === id) ?? customs.find((t) => t.id === id) ?? DEFAULT_THEME;
}

// ─── Light/dark slots (2026-11-21) ──────────────────────────────────────────
//
// The record holds TWO themes — one light, one dark — each with its own
// overrides, and a mode choice: pin the light slot, pin the dark slot, or
// follow the OS (prefers-color-scheme). A record written before slots
// existed (`themeMode` absent) is read through the legacy keys: its single
// theme and overrides become the slot of that theme's mode, and the mode
// pins that slot — so an old record renders exactly as before.

/** The user's mode choice: one slot pinned, or the OS decides. */
export type ThemeModeSetting = ThemeMode | "system";

/** Valid `appearance.themeMode` values (the Settings segmented order). */
export const THEME_MODE_SETTINGS = ["light", "dark", "system"] as const;

export function isThemeModeSetting(value: unknown): value is ThemeModeSetting {
	return value === "light" || value === "dark" || value === "system";
}

/** One slot's overrides: any of the twelve colors (null/absent = the theme's). */
export type SlotColorOverrides = Partial<Record<ThemeColorKey, string | null>>;

/** `appearance.light` / `appearance.dark` as stored. */
export interface ThemeSlotSettings {
	/** Theme id; absent, gone or of the other mode = the slot's default. */
	theme?: string;
	colors?: SlotColorOverrides;
}

/** What an empty slot shows: the original dark palette, and Latte. */
export const DEFAULT_SLOT_THEME_IDS: Readonly<Record<ThemeMode, string>> = {
	light: "catppuccin-latte",
	dark: DEFAULT_THEME_ID,
};

/** A slot resolved against the catalog. */
export interface ResolvedThemeSlot {
	theme: Theme;
	/** The stored overrides (hex only; nulls dropped). */
	overrides: Partial<Record<ThemeColorKey, string>>;
	/** The theme with every override applied — what the slot renders. */
	colors: ThemeColors;
}

export interface ResolvedThemeSlots {
	themeMode: ThemeModeSetting;
	light: ResolvedThemeSlot;
	dark: ResolvedThemeSlot;
}

/** The theme a slot renders: its id among presets and customs when the
 *  mode matches, else the slot's default preset. */
export function resolveSlotTheme(id: string | null | undefined, mode: ThemeMode, customs: readonly Theme[] = []): Theme {
	const found = id ? [...BUILTIN_THEMES, ...customs].find((t) => t.id === id) : undefined;
	if (found && found.mode === mode) return found;
	return BUILTIN_THEMES.find((t) => t.id === DEFAULT_SLOT_THEME_IDS[mode])!;
}

/** Hex-only overrides (null/invalid entries mean "the theme's"). */
function cleanOverrides(colors: SlotColorOverrides | undefined): Partial<Record<ThemeColorKey, string>> {
	const out: Partial<Record<ThemeColorKey, string>> = {};
	for (const key of THEME_COLOR_KEYS) {
		const v = colors?.[key];
		if (isHex(v)) out[key] = v;
	}
	return out;
}

/** The theme with the overrides applied. */
export function applyOverrides(theme: ThemeFile, overrides: SlotColorOverrides | undefined): ThemeColors {
	return { ...theme.colors, ...cleanOverrides(overrides) };
}

/** The pre-slot override homes (`background`, `colors`,
 *  `mdRendering.boldColor/italicColor`) as one twelve-key map. */
function legacyOverrides(a: AppearanceSettings | undefined): SlotColorOverrides {
	const out: SlotColorOverrides = {};
	if (isHex(a?.background)) out.background = a.background;
	if (isHex(a?.mdRendering?.boldColor)) out.bold = a.mdRendering.boldColor;
	if (isHex(a?.mdRendering?.italicColor)) out.italic = a.mdRendering.italicColor;
	for (const key of COLOR_OVERRIDE_KEYS) {
		const v = a?.colors?.[key];
		if (isHex(v)) out[key] = v;
	}
	return out;
}

function resolveSlot(slot: ThemeSlotSettings | undefined, mode: ThemeMode, customs: readonly Theme[]): ResolvedThemeSlot {
	const theme = resolveSlotTheme(slot?.theme, mode, customs);
	return { theme, overrides: cleanOverrides(slot?.colors), colors: applyOverrides(theme, slot?.colors) };
}

/** The record's slots in their stored shape — legacy records converted
 *  (see the section comment). */
function storedSlots(a: AppearanceSettings | undefined, customs: readonly Theme[]): {
	themeMode: ThemeModeSetting;
	light: ThemeSlotSettings | undefined;
	dark: ThemeSlotSettings | undefined;
} {
	if (isThemeModeSetting(a?.themeMode)) return { themeMode: a.themeMode, light: a.light, dark: a.dark };
	const legacy = resolveTheme(a?.theme, customs);
	const slot: ThemeSlotSettings = { theme: legacy.id, colors: legacyOverrides(a) };
	return { themeMode: legacy.mode, [legacy.mode]: slot, [legacy.mode === "light" ? "dark" : "light"]: undefined } as {
		themeMode: ThemeModeSetting;
		light: ThemeSlotSettings | undefined;
		dark: ThemeSlotSettings | undefined;
	};
}

/** THE resolution: the mode choice and both slots, ready to render. */
export function resolveThemeSlots(a: AppearanceSettings | undefined, customs: readonly Theme[] = []): ResolvedThemeSlots {
	const s = storedSlots(a, customs);
	return { themeMode: s.themeMode, light: resolveSlot(s.light, "light", customs), dark: resolveSlot(s.dark, "dark", customs) };
}

/** The custom theme ids a record may render (so a reader loads only those files). */
export function referencedThemeIds(a: AppearanceSettings | undefined): string[] {
	const ids = [a?.theme, a?.light?.theme, a?.dark?.theme].filter((id): id is string => isThemeId(id) && !isBuiltinThemeId(id));
	return [...new Set(ids)];
}

/** The slot on screen: the pinned one, or the OS's. */
export function activeThemeMode(themeMode: ThemeModeSetting, systemDark: boolean): ThemeMode {
	return themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;
}

/** The record in slot shape: legacy keys converted and dropped. Every
 *  theme write goes through this, so the first one migrates the record. */
export function materializeThemeSlots(a: AppearanceSettings | undefined, customs: readonly Theme[] = []): AppearanceSettings {
	const s = storedSlots(a, customs);
	const { theme: _t, background: _b, colors: _c, ...rest } = a ?? {};
	const out: AppearanceSettings = { ...rest, themeMode: s.themeMode };
	for (const mode of ["light", "dark"] as const) {
		const slot = s[mode];
		const overrides = cleanOverrides(slot?.colors);
		const next: ThemeSlotSettings = {};
		if (slot?.theme) next.theme = slot.theme;
		if (Object.keys(overrides).length) next.colors = overrides;
		out[mode] = next;
	}
	if (rest.mdRendering) {
		const { boldColor: _bc, italicColor: _ic, ...md } = rest.mdRendering;
		out.mdRendering = md;
	}
	return out;
}

/** Shift every channel by `add`, clamped to 0–255 (always #rrggbb out). */
export function shiftHex(hex: string, add: number): string {
	const n = hex.length === 4
		? hex.slice(1).split("").map((c) => parseInt(c + c, 16))
		: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	return `#${n.map((c) => Math.min(255, Math.max(0, c + add)).toString(16).padStart(2, "0")).join("")}`;
}

/** The hover surface sits one step off `surface`: lighter on dark,
 *  darker on light (#1c1c1c → #2a2a2a, the original hand-picked hover). */
const HOVER_STEP = 14;

/** THE adapter: 12 theme colors → the CSS variables set on <html>.
 *  `--accent` stays the shadcn HOVER surface (derived from `surface`, so
 *  hovers never turn the highlight color); the theme's accent is
 *  `--lh-accent` (ring, toggles, the selected theme card). */
export function themeVars(c: ThemeColors, mode: ThemeMode): Record<string, string> {
	return {
		"--background": c.background,
		"--foreground": c.text,
		"--card": c.surface,
		"--card-foreground": c.text,
		"--popover": c.surface,
		"--popover-foreground": c.text,
		"--primary": c.text,
		"--primary-foreground": c.background,
		"--secondary": c.surface,
		"--secondary-foreground": c.text,
		"--muted": c.surface,
		"--muted-foreground": c.textMuted,
		"--accent": shiftHex(c.surface, mode === "dark" ? HOVER_STEP : -HOVER_STEP),
		"--accent-foreground": c.text,
		"--destructive": c.error,
		"--border": c.border,
		"--input": c.border,
		"--ring": c.accent,
		"--lh-accent": c.accent,
		"--lh-line-strong": c.text,
		"--lh-ink-strong": c.bold,
		"--lh-ink-italic": c.italic,
		"--lh-ink-code": c.code,
		"--lh-error": c.error,
		"--lh-success": c.success,
		"--lh-warning": c.warning,
	};
}

/** Export: a slot's theme with its overrides applied — importing the
 *  file back reproduces exactly what that slot shows. */
export function exportThemeFile(slot: ResolvedThemeSlot): ThemeFile {
	return { name: slot.theme.name, mode: slot.theme.mode, colors: slot.colors };
}
