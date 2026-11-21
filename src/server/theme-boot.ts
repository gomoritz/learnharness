/**
 * THE FIRST-PAINT THEME (theme wave, 2026-11-04; light/dark slots
 * 2026-11-21): what app/layout.tsx puts on <html> before any client code
 * runs — the record's appearance, both resolved slots, and the first
 * frame's colors. Read the record and only the custom files it names (the
 * layout calls connection() first, so this never bakes into a prerender).
 *
 * A pinned mode renders like before: the slot's class and variables inline
 * on <html>. "system" cannot be known on the server, so the first frame
 * carries BOTH palettes behind prefers-color-scheme (`systemCss`) and a
 * tiny inline script (`SYSTEM_MODE_SCRIPT`) sets the dark/light class
 * before paint; the provider owns every switch after hydration.
 */

import {
	referencedThemeIds,
	resolveThemeSlots,
	themeVars,
	type AppearanceSettings,
	type ResolvedThemeSlots,
	type Theme,
	type ThemeMode,
} from "../core";
import { themeStore } from "../store/themes.ts";
import { readSettings } from "../store/settings.ts";

/** Everything the layout needs for a flash-free first paint. */
export interface ThemeBoot {
	appearance: AppearanceSettings | undefined;
	slots: ResolvedThemeSlots;
	/** The custom themes the record names (seeds the provider's catalog). */
	customs: Theme[];
	/** The pinned mode, or null when the OS decides. */
	mode: ThemeMode | null;
	/** Pinned: the CSS variables for <html style>. Empty for "system". */
	vars: Record<string, string>;
	/** "system": both palettes behind prefers-color-scheme. Empty when pinned. */
	systemCss: string;
}

/** Sets <html>'s dark/light class from the OS before first paint. */
export const SYSTEM_MODE_SCRIPT =
	'(function(){var d=window.matchMedia("(prefers-color-scheme: dark)").matches,c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d)})()';

function cssBlock(vars: Record<string, string>): string {
	return Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";");
}

/** Both palettes, each behind its media query. `:root:root` outranks the
 *  stylesheet's `:root`/`.dark`/`.light` token blocks. */
export function systemModeCss(slots: ResolvedThemeSlots): string {
	return (["light", "dark"] as const)
		.map((mode) => `@media (prefers-color-scheme: ${mode}){:root:root{${cssBlock(themeVars(slots[mode].colors, mode))}}}`)
		.join("");
}

/** Read the record and the custom files it names; resolve both slots. */
export function readThemeBoot(): ThemeBoot {
	const appearance = readSettings()?.appearance;
	const customs = referencedThemeIds(appearance)
		.map((id) => themeStore.readTheme(id))
		.filter((t): t is Theme => t !== null);
	const slots = resolveThemeSlots(appearance, customs);
	if (slots.themeMode === "system") {
		return { appearance, slots, customs, mode: null, vars: {}, systemCss: systemModeCss(slots) };
	}
	const mode = slots.themeMode;
	return { appearance, slots, customs, mode, vars: themeVars(slots[mode].colors, mode), systemCss: "" };
}
