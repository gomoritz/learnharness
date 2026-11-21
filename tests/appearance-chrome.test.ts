import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, beforeEach, it } from "node:test";
import { BUILTIN_THEMES, DEFAULT_THEME, resolveTheme, resolveThemeSlots, sanitizeThemeFile, THEME_COLOR_KEYS } from "../src/core/themes.ts";

const require = createRequire(import.meta.url);
const { PRESET_APPEARANCE, COLOR_KEYS, normalizeAppearance, themeSourceFor, serverDataDir, readAppearance, chromeColors } = require("../electron/appearance-chrome.cjs");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "lh-appearance-chrome-"));
after(() => fs.rmSync(data, { recursive: true, force: true }));
beforeEach(() => { fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(path.join(data, "themes"), { recursive: true }); });
const record = (appearance: unknown) => fs.writeFileSync(path.join(data, "settings.json"), JSON.stringify({ version: 1, appearance }));

it("native boot projection stays identical to every core preset and its color vocabulary", () => {
	assert.deepEqual(Object.keys(PRESET_APPEARANCE).sort(), BUILTIN_THEMES.map(t => t.id).sort());
	assert.deepEqual([...COLOR_KEYS].sort(), [...THEME_COLOR_KEYS].sort());
	for (const theme of BUILTIN_THEMES) {
		assert.deepEqual(PRESET_APPEARANCE[theme.id], { mode: theme.mode, background: theme.colors.background });
		for (const background of [undefined, "#101010", "#fff"]) {
			record({ theme: theme.id, background });
			assert.deepEqual(readAppearance(data), { mode: theme.mode, background: resolveThemeSlots({ theme: theme.id, background })[theme.mode].colors.background, followSystem: false });
		}
	}
});

it("selected custom files resolve before a renderer; missing or malformed files match core fallback", () => {
	const custom = { ...BUILTIN_THEMES.find(t => t.id === "rose-pine-dawn")!, name: "Custom Paper" };
	for (const raw of [custom, { ...custom, colors: { ...custom.colors, error: "bad" } }, { ...custom, mode: "system" }, { ...custom, name: "!!!" }, null]) {
		fs.writeFileSync(path.join(data, "themes", "custom-paper.json"), JSON.stringify(raw));
		record({ theme: "custom-paper" });
		const parsed = sanitizeThemeFile(raw);
		const resolved = resolveTheme("custom-paper", parsed ? [{ ...parsed, id: "custom-paper", builtin: false }] : []);
		assert.deepEqual(readAppearance(data), { mode: resolved.mode, background: resolved.colors.background, followSystem: false });
	}
	fs.unlinkSync(path.join(data, "themes", "custom-paper.json"));
	record({ theme: "custom-paper", background: "#abc" });
	assert.deepEqual(readAppearance(data), { mode: "dark", background: "#abc", followSystem: false });
	for (const theme of ["../outside", "__proto__", "constructor", "unknown"]) {
		record({ theme });
		assert.deepEqual(readAppearance(data), { mode: "dark", background: DEFAULT_THEME.colors.background, followSystem: false });
	}
});

it("absent and corrupt records fall back; renderer reports are normalized", () => {
	assert.deepEqual(readAppearance(data), { mode: "dark", background: "#141414", followSystem: false });
	fs.writeFileSync(path.join(data, "settings.json"), "{");
	assert.deepEqual(readAppearance(data), { mode: "dark", background: "#141414", followSystem: false });
	for (const theme of [null, [], {}, { toString: null }, 123, true]) {
		record({ theme });
		assert.deepEqual(readAppearance(data), { mode: "dark", background: "#141414", followSystem: false });
	}
	assert.deepEqual(normalizeAppearance({ mode: "light", background: "#fff" }), { mode: "light", background: "#fff", followSystem: false });
	assert.deepEqual(normalizeAppearance({ mode: "system", background: "white" }), { mode: "dark", background: null, followSystem: false });
});

it("native glyphs contrast against final paint, not the theme's mode label", () => {
	for (const mode of ["dark", "light"]) {
		assert.deepEqual(chromeColors({ mode, background: "#101010" }), { color: "#101010", symbolColor: "#e5e5e5" });
		assert.deepEqual(chromeColors({ mode, background: "#fff" }), { color: "#fff", symbolColor: "#1a1a1a" });
	}
	assert.equal(themeSourceFor("dark"), "system", "retain main's OS-following native menus/dialogs");
	assert.equal(themeSourceFor("light"), "light");
	assert.equal(themeSourceFor("light", true), "system", "system theme mode keeps the OS appearance visible");
	assert.equal(themeSourceFor("dark", true), "system");
	assert.deepEqual(normalizeAppearance({ mode: "light", background: "#fff", followSystem: true }), { mode: "light", background: "#fff", followSystem: true });
});

it("slot records: the pinned slot, or the OS's in system mode — mirroring core resolveThemeSlots", () => {
	const custom = { ...BUILTIN_THEMES.find(t => t.id === "rose-pine-dawn")!, name: "Custom Paper" };
	fs.writeFileSync(path.join(data, "themes", "custom-paper.json"), JSON.stringify(custom));
	const customs = [{ ...sanitizeThemeFile(custom)!, id: "custom-paper", builtin: false }];
	const records = [
		{ themeMode: "light" },
		{ themeMode: "dark" },
		{ themeMode: "system" },
		{ themeMode: "light", light: { theme: "custom-paper" } },
		{ themeMode: "system", light: { theme: "ivory", colors: { background: "#fff" } }, dark: { theme: "gruvbox-dark" } },
		{ themeMode: "light", light: { theme: "catppuccin-mocha" } },
		{ themeMode: "dark", dark: { theme: "gone", colors: { background: "bad" } } },
		{ themeMode: "system", theme: "ivory", background: "#000" },
	];
	for (const appearance of records) {
		record(appearance);
		for (const systemDark of [true, false]) {
			const slots = resolveThemeSlots(appearance as never, customs);
			const mode = slots.themeMode === "system" ? (systemDark ? "dark" : "light") : slots.themeMode;
			assert.deepEqual(readAppearance(data, systemDark), {
				mode, background: slots[mode].colors.background, followSystem: slots.themeMode === "system",
			}, JSON.stringify({ appearance, systemDark }));
		}
	}
});

it("external desktop development reads the server's directory rather than the shell's -dev profile", () => {
	const base = { packagedDataDir: "/fixture/packaged/data", repoRoot: "/fixture/repo", env: {} };
	assert.equal(serverDataDir(base), base.packagedDataDir);
	assert.equal(serverDataDir({ ...base, devUrl: "http://127.0.0.1:9000" }), "/fixture/repo/data");
	assert.equal(serverDataDir({ ...base, devUrl: "http://127.0.0.1:9000", env: { LH_DATA_DIR: data } }), data);
});
