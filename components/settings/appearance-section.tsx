"use client";
/**
 * The Appearance + Graph sections (thin settings wave).
 *
 * Appearance controls resolve against the factory in the provider; writes
 * PUT the whole appearance section and hand the delta back so the CSS
 * variables move IMMEDIATELY (the section's whole point — it must DO
 * something). Theme wave (2026-11-04), light/dark slots (2026-11-21): a
 * Light | Dark | System mode switch, then one theme grid per slot
 * (./theme-cards.tsx); the "Colors" block below holds one hex override per
 * theme color FOR ONE SLOT (its own Light | Dark switch, defaulting to the
 * slot on screen; empty = the theme's), kept across theme switches;
 * "Typography" holds the type knobs. Hex inputs commit on blur/Enter.
 *
 * Graph graying (owner, 2026-09-20) follows the graph viewer's render-panel
 * convention: the whole row dims when a parent is off (stored values
 * persist but resolve inert — the switch shows stored, the dim effective).
 *
 * Reading font (appearance wave, 2026-09-26, owner ruling): a searchable
 * dropdown of the user's INSTALLED fonts (FontMenuList over model-menu's
 * machine) fed by window.queryLocalFonts() in the desktop shell — the
 * enumeration is click-bound (the API requires user activation), deduped
 * to unique families, the factory family excluded (the DEFAULT row is
 * it). In a plain dev browser the API is absent → a small curated list
 * + a footer that says exactly that — never a fabricated system list.
 * The custom-family input inside the menu is the manual escape path.
 * Empty/unset keeps meaning Source Sans 3.
 *
 * Every theme write starts from materializeThemeSlots (core/themes.ts):
 * a pre-slot record is converted on its first theme write, its single
 * theme and overrides becoming the slot of that theme's mode.
 */

import { useEffect, useRef, useState } from "react";
import {
	EXTRACTION_CHUNK_TOKENS_FLOOR,
	TRANSCRIPT_WIDTH_MAX_REM,
	TRANSCRIPT_WIDTH_MIN_REM,
	TRANSCRIPT_WIDTH_STEP_REM,
	materializeThemeSlots,
	resolveSettings,
	resolveThemeSlots,
	THEME_COLOR_KEYS,
	type AppearanceSettings,
	type GraphSettings,
	type ThemeColorKey,
	type ThemeMode,
	type ThemeModeSetting,
} from "@/src/core";
import { MenuShell } from "@/components/menu-shell";
import { useInteractionLayers } from "@/components/interaction-layers";
import { Hint } from "@/components/ui/hint";
import { BUNDLED_READING_FONTS, useAppearance } from "./appearance.tsx";
import { FontMenuList } from "./model-menu";
import { ThemeCards } from "./theme-cards.tsx";
import { CommitInput, SettingsMenuTrigger, SettingsRow, SettingsSegmentedControl, Toggle } from "./controls.tsx";

/** The slider position past the last width step: Full (no cap). */
const TRANSCRIPT_FULL_POSITION = TRANSCRIPT_WIDTH_MAX_REM + TRANSCRIPT_WIDTH_STEP_REM;

/** The transcript width's label: px at the root's 16px rem, or Full.
 *  Exported for tests. */
export function transcriptWidthLabel(rem: number | null): string {
	return rem === null ? "Full" : `${rem * 16}px`;
}

/**
 * Transcript width: a slider whose last position is Full. The thumb moves
 * a local draft while dragging; the section PUT happens once, on the
 * native `change` (release / keyboard step) — not one write per tick.
 */
function TranscriptWidthSlider({ value, onCommit }: { value: number | null; onCommit: (rem: number | null) => void }) {
	const position = value ?? TRANSCRIPT_FULL_POSITION;
	const [draft, setDraft] = useState(position);
	const inputRef = useRef<HTMLInputElement>(null);
	const commitRef = useRef(onCommit);
	commitRef.current = onCommit;
	useEffect(() => setDraft(position), [position]);
	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		const onChange = () => {
			const next = Number(input.value);
			commitRef.current(next >= TRANSCRIPT_FULL_POSITION ? null : next);
		};
		input.addEventListener("change", onChange);
		return () => input.removeEventListener("change", onChange);
	}, []);
	const draftRem = draft >= TRANSCRIPT_FULL_POSITION ? null : draft;
	return (
		<span className="flex items-center gap-2">
			<input
				ref={inputRef}
				type="range"
				aria-label="Transcript width"
				aria-valuetext={transcriptWidthLabel(draftRem)}
				data-testid="input-transcript-width"
				min={TRANSCRIPT_WIDTH_MIN_REM}
				max={TRANSCRIPT_FULL_POSITION}
				step={TRANSCRIPT_WIDTH_STEP_REM}
				value={draft}
				onChange={(e) => setDraft(Number(e.target.value))}
				className="h-1.5 w-40 accent-primary"
			/>
			<span data-testid="transcript-width-value" className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">{transcriptWidthLabel(draftRem)}</span>
		</span>
	);
}

/** The factory reading family — the DEFAULT row's identity (unset =
 *  this). Exported for tests. */
export const DEFAULT_READING_FONT = "Source Sans 3";

/** The dev-browser fallback list (queryLocalFonts is absent there):
 *  the app's own knowns plus a handful of ubiquitous macOS families,
 *  honestly LABELED as common — never presented as the system's real
 *  list. The factory family is absent: the DEFAULT row is it. Exported
 *  for tests. */
export const CURATED_FALLBACK_FONTS: readonly string[] = [
	"Arial",
	"CMU Serif",
	"Courier New",
	"Georgia",
	"Helvetica",
	"Helvetica Neue",
	"JetBrains Mono",
	"Menlo",
	"Times New Roman",
	"Trebuchet MS",
	"Verdana",
];

/** window.queryLocalFonts' shape as this section consumes it (family is
 *  the only field used; the API returns one FontData per FACE — the
 *  caller dedupes). */
type LocalFontsApi = () => Promise<Array<{ family: string }>>;

/** The Local Font Access seam — read lazily (SSR has no window, and
 *  render-time access would evaluate the API on the server). */
function localFontsApi(): LocalFontsApi | null {
	if (typeof window === "undefined") return null;
	return (window as unknown as { queryLocalFonts?: LocalFontsApi }).queryLocalFonts ?? null;
}

/** Compose the reading-font pick: null (or blank) = the factory
 *  Source Sans 3; otherwise the family verbatim (trimmed — the
 *  sanitizer trims again server-side). Pure — exported for tests. */
export function composeFontFamily(
	appearance: AppearanceSettings | undefined,
	family: string | null,
): AppearanceSettings {
	const value = family?.trim() ?? "";
	return { ...appearance, fontFamily: value === "" ? null : value };
}

/** The Colors grid's labels and the one hint that explains a key. */
const COLOR_LABELS: Record<ThemeColorKey, { label: string; note?: string }> = {
	background: { label: "Background" },
	accent: { label: "Accent", note: "Focus rings, toggles, selection" },
	surface: { label: "Surface", note: "Cards, inputs, sidebar" },
	bold: { label: "Bold" },
	border: { label: "Border" },
	italic: { label: "Italic" },
	text: { label: "Text" },
	code: { label: "Inline code" },
	textMuted: { label: "Muted text" },
	error: { label: "Error" },
	success: { label: "Success" },
	warning: { label: "Warning" },
};

/** The legacy test ids of the three pre-theme rows (kept stable). */
const LEGACY_TESTIDS: Partial<Record<ThemeColorKey, string>> = {
	background: "input-background",
	bold: "input-bold-color",
	italic: "input-italic-color",
};

/** The Mode switch's options (core THEME_MODE_SETTINGS order). */
const THEME_MODE_OPTIONS: readonly { value: ThemeModeSetting; label: string }[] = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

const SLOT_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

/** Compose one slot override into a slot-shaped section ("" = back to the
 *  theme's). Every other field rides along untouched. Pure — exported for
 *  tests. */
export function composeColorOverride(
	appearance: AppearanceSettings,
	slot: ThemeMode,
	key: ThemeColorKey,
	value: string,
): AppearanceSettings {
	const current = appearance[slot] ?? {};
	const colors = { ...current.colors };
	if (value === "") delete colors[key];
	else colors[key] = value;
	return { ...appearance, [slot]: { ...current, colors } };
}

/** "Reset all": one slot's colors back to its theme's; the other slot and
 *  the type knobs untouched. Pure — exported for tests. */
export function clearColorOverrides(appearance: AppearanceSettings, slot: ThemeMode): AppearanceSettings {
	const { colors: _colors, ...rest } = appearance[slot] ?? {};
	return { ...appearance, [slot]: rest };
}

function ColorOverrideRow({
	colorKey,
	value,
	themeColor,
	effective,
	onCommit,
}: {
	colorKey: ThemeColorKey;
	value: string;
	themeColor: string;
	effective: string;
	onCommit: (next: string) => boolean | Promise<boolean>;
}) {
	const { label, note } = COLOR_LABELS[colorKey];
	const empty = `Empty = ${themeColor}`;
	return (
		<SettingsRow label={label} hint={note ? `${note} · ${empty}` : empty} testid={`row-color-${colorKey}`}>
			<span className="flex items-center gap-2">
				<span
					aria-hidden
					data-testid={`swatch-${colorKey}`}
					className="size-4 shrink-0 rounded-sm border border-border"
					style={{ background: effective }}
				/>
				<CommitInput
					value={value}
					placeholder={themeColor}
					ariaLabel={`${label.toLowerCase()} hex`}
					testid={LEGACY_TESTIDS[colorKey] ?? `input-color-${colorKey}`}
					onCommit={onCommit}
				/>
			</span>
		</SettingsRow>
	);
}

export function AppearanceSection({
	appearance,
	onSectionChange,
}: {
	/** The record's appearance delta (absent = factory). */
	appearance: AppearanceSettings | undefined;
	/** PUT the whole appearance section; the page re-applies on success. */
	onSectionChange: (next: AppearanceSettings) => boolean | Promise<boolean>;
}) {
	const { appearance: resolved, resolvedMode, themes, refreshThemes } = useAppearance();
	const md = appearance?.mdRendering;
	// The slots as the dialog's record mirror holds them (like every other
	// control here); the provider only says which slot is on screen.
	const customs = themes.filter((t) => !t.builtin);
	const slots = resolveThemeSlots(appearance, customs);
	// Every theme write composes onto the slot-shaped record.
	const slotRecord = () => materializeThemeSlots(appearance, customs);
	// Which slot the Colors block edits: the one on screen, until picked.
	const [editSlot, setEditSlot] = useState<ThemeMode>(resolvedMode);
	useEffect(() => setEditSlot(resolvedMode), [resolvedMode]);
	const edited = slots[editSlot];

	// The font dropdown's open state + its enumeration cache. undefined =
	// not enumerated yet (desktop: click-bound queryLocalFonts pending);
	// null = enumeration UNAVAILABLE (the API is absent in a plain
	// browser, rejected, or resolved EMPTY — Electron 44's local-fonts
	// grant passes and the enumeration still yields zero fonts,
	// reproduced 2026-09-26) → the curated fallback; a list = the deduped
	// families. enumEmpty distinguishes WHY it fell back, for the footer.
	const [fontMenuOpen, setFontMenuOpen] = useState(false);
	const [localFonts, setLocalFonts] = useState<string[] | null | undefined>(undefined);
	const [enumEmpty, setEnumEmpty] = useState(false);
	const menuAnchorRef = useRef<HTMLSpanElement>(null);
	const interactions = useInteractionLayers();

	// The enumeration runs INSIDE the trigger click — queryLocalFonts
	// requires user activation, so it cannot be a mount effect. First
	// open only: the families are cached for the section's life (font
	// installs mid-dialog are not a case); ANY unavailable enumeration
	// (absent / rejected / empty) falls back to the curated list rather
	// than an empty picker.
	const openFontMenu = () => {
		setFontMenuOpen((open) => {
			if (!open && localFonts === undefined) {
				const api = localFontsApi();
				if (api === null) {
					setLocalFonts(null);
					setEnumEmpty(false);
				} else {
					void api()
						.then((fonts) => {
							const installed = fonts.map((f) => f.family);
							// The bundled families join the installed ones (they
							// render whether or not the OS has them), but only
							// when the OS list was actually read.
							const families = [...new Set(installed.length ? [...installed, ...Object.keys(BUNDLED_READING_FONTS)] : [])]
								.filter((f) => f !== DEFAULT_READING_FONT)
								.sort((a, b) => a.localeCompare(b));
							if (families.length === 0) {
								// Resolved-but-empty: not a failure the catch sees —
								// an honest unavailable (this Electron 44 build
								// enumerates nothing even granted).
								setLocalFonts(null);
								setEnumEmpty(true);
							} else {
								setLocalFonts(families);
							}
						})
						.catch(() => {
							setLocalFonts(null);
							setEnumEmpty(false);
						});
				}
			}
			return !open;
		});
	};

	const pickFont = (family: string | null) => {
		setFontMenuOpen(false);
		onSectionChange(composeFontFamily(appearance, family));
	};

	// The dropdown contract (agent-section's, mirrored): any click
	// outside the open menu — or an Esc — closes it. Esc is CLAIMED with
	// stopPropagation so the settings dialog behind does NOT also close.
	useEffect(() => {
		if (!fontMenuOpen) return;
		const onPointerDown = (e: PointerEvent) => {
			if (!interactions.isElementEligible(document.querySelector<HTMLElement>('[data-testid="font-menu"]'))) return;
			const target = e.target as Node;
			if (menuAnchorRef.current?.contains(target)) return;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (target instanceof Element && target.closest('[role="dialog"]')) {
				setFontMenuOpen(false);
			}
			// else: outside the dialog — the dialog's own close handles it.
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [fontMenuOpen, interactions]);

	return (
		<>
			<SettingsRow
				label="Mode"
				hint={slots.themeMode === "system" ? `Follows your system · ${resolvedMode} now` : "Light or dark theme, or follow your system"}
				testid="row-theme-mode"
			>
				<SettingsSegmentedControl
					label="Theme mode"
					options={THEME_MODE_OPTIONS}
					value={slots.themeMode}
					testidPrefix="theme-mode"
					onChange={(themeMode) => onSectionChange({ ...slotRecord(), themeMode })}
				/>
			</SettingsRow>
			{(["light", "dark"] as const).map((mode) => (
				<div key={mode} className="mt-4">
					<ThemeCards
						mode={mode}
						themes={themes.filter((t) => t.mode === mode)}
						slot={slots[mode]}
						onScreen={mode === resolvedMode}
						showImport={mode === "dark"}
						onSelect={(id) => {
							const record = slotRecord();
							onSectionChange({ ...record, [mode]: { ...record[mode], theme: id } });
						}}
						onImported={() => void refreshThemes()}
						onRemoved={(removed) => {
							void refreshThemes();
							// The server already reset every slot that used it; the write
							// keeps the dialog's record mirror and the live vars in step.
							const record = slotRecord();
							for (const m of ["light", "dark"] as const) {
								if (record[m]?.theme === removed.id) {
									const { theme: _gone, ...rest } = record[m]!;
									record[m] = rest;
								}
							}
							onSectionChange(record);
						}}
					/>
				</div>
			))}
			<div data-testid="group-colors" className="mt-5 flex flex-col gap-2">
				<div className="flex items-end justify-between gap-4">
					<p className="text-xs uppercase tracking-widest text-muted-foreground">
						Colors{" "}
						<span className="normal-case tracking-normal text-muted-foreground/70">
							· overrides for the {editSlot} theme ({edited.theme.name}), kept when you switch
						</span>
					</p>
					<span className="flex shrink-0 items-center gap-2">
						<SettingsSegmentedControl
							label="Override slot"
							options={SLOT_OPTIONS}
							value={editSlot}
							testidPrefix="colors-slot"
							onChange={setEditSlot}
						/>
						<button
							type="button"
							data-testid="colors-reset"
							onClick={() => onSectionChange(clearColorOverrides(slotRecord(), editSlot))}
							className="h-6 shrink-0 rounded-sm px-2 font-ui text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							Reset all
						</button>
					</span>
				</div>
				<div className="grid grid-cols-2 gap-x-10 gap-y-2">
					{THEME_COLOR_KEYS.map((key) => (
						<ColorOverrideRow
							key={key}
							colorKey={key}
							value={edited.overrides[key] ?? ""}
							themeColor={edited.theme.colors[key]}
							effective={edited.colors[key]}
							onCommit={(v) => onSectionChange(composeColorOverride(slotRecord(), editSlot, key, v))}
						/>
					))}
				</div>
			</div>
			<p className="mt-5 mb-2 text-xs uppercase tracking-widest text-muted-foreground">Typography</p>
			<SettingsRow
				label="Reading font"
				hint={`Empty = ${DEFAULT_READING_FONT}`}
				testid="row-font"
			>
				<span ref={fontMenuOpen ? menuAnchorRef : undefined} className="relative flex items-center gap-2">
					{/* The shared Agent/Appearance collapsed-menu trigger.
					    The tooltip rides the CLOSED button ONLY
					    (owner ruling 2026-09-26: never while
					    the dropdown is out — it popped over the open
					    menu when the wrap covered the whole anchor
					    span). */}
					{(() => {
						const triggerButton = (
							<SettingsMenuTrigger
								value={appearance?.fontFamily || DEFAULT_READING_FONT}
								aria-label="Reading font"
								aria-expanded={fontMenuOpen}
								data-testid="font-trigger"
								onClick={openFontMenu}
								className="min-w-20"
							/>
						);
						return fontMenuOpen ? (
							triggerButton
						) : (
							<Hint label="Choose from your installed fonts" side="left">
								{triggerButton}
							</Hint>
						);
					})()}
					{fontMenuOpen && (
						<MenuShell
							preferredSide="down"
							anchorTestid="font-trigger"
							testid="font-menu"
							onClose={() => { setFontMenuOpen(false); return "closed"; }}
							menuClass="flex w-[18rem] flex-col gap-0.5 rounded-xl border border-border bg-card p-2 text-xs shadow-xl"
						>
							<FontMenuList
								families={localFonts === undefined ? undefined : (localFonts ?? [...CURATED_FALLBACK_FONTS])}
								effectiveFamily={appearance?.fontFamily ?? null}
								onPick={pickFont}
								footer={
									localFonts === undefined
										? undefined
										: localFonts === null
											? enumEmpty
												? "Common families — installed fonts could not be read"
												: "Common families — your installed list needs the desktop app"
											: "Your installed fonts"
								}
							/>
						</MenuShell>
					)}
				</span>
			</SettingsRow>
			<SettingsRow label="Reading font size" hint={`${resolved.proseFontSize}px`} testid="row-prose-size">
				<CommitInput
					type="number"
					value={String(appearance?.proseFontSize ?? "")}
					placeholder="16"
					ariaLabel="prose font size"
					testid="input-prose-size"
					onCommit={(v) => {
						// Empty = factory default (owner, fix wave): omit the key so the record
						// UNSETS and the field stays empty (absence, not null, is the
						// unset for numbers). Number("") is 0, so the old clamp wrote 12.
						if (v === "") {
							return onSectionChange({ ...appearance, proseFontSize: undefined });
						}
						const n = Number(v);
						if (!Number.isFinite(n)) return false; // bad input: no write, factory stays
						return onSectionChange({ ...appearance, proseFontSize: Math.min(24, Math.max(12, Math.round(n))) });
					}}
				/>
			</SettingsRow>
			<SettingsRow label="Code ligatures" testid="row-code-ligatures">
				<Toggle
					checked={resolved.codeLigatures}
					label="Code ligatures"
					onChange={(on) => onSectionChange({ ...appearance, codeLigatures: on })}
				/>
			</SettingsRow>
			<SettingsRow label="Session names in serif" testid="row-session-serif">
				<Toggle
					checked={appearance?.sessionNameSerif ?? true}
					label="session names serif"
					onChange={(on) => onSectionChange({ ...appearance, sessionNameSerif: on })}
				/>
			</SettingsRow>
			<SettingsRow label="Compact session list" testid="row-compact-session-list">
				<Toggle
					checked={resolved.compactSessionList}
					label="Compact session list"
					onChange={(on) => onSectionChange({ ...appearance, compactSessionList: on })}
				/>
			</SettingsRow>
			<SettingsRow label="Heading weight" hint={`${resolved.mdRendering.headingWeight}`} testid="row-heading-weight">
				<CommitInput
					type="number"
					value={String(md?.headingWeight ?? "")}
					placeholder="900"
					ariaLabel="heading weight"
					testid="input-heading-weight"
					onCommit={(v) => {
						// Empty = factory default (owner, fix wave): Number("") is 0, so
						// Absence is the unset representation — the old clamp wrote 100.
						if (v === "") {
							return onSectionChange({ ...appearance, mdRendering: { ...md, headingWeight: undefined } });
						}
						const n = Number(v);
						if (!Number.isFinite(n)) return false;
						return onSectionChange({
							...appearance,
							mdRendering: { ...md, headingWeight: Math.min(900, Math.max(100, Math.round(n))) },
						});
					}}
				/>
			</SettingsRow>
			<SettingsRow label="Transcript width" testid="row-transcript-width">
				<TranscriptWidthSlider
					value={resolved.transcriptMaxWidth}
					// Full = absence (the unset representation for numbers).
					onCommit={(rem) => { void onSectionChange({ ...appearance, transcriptMaxWidth: rem ?? undefined }); }}
				/>
			</SettingsRow>
			<SettingsRow label="Adapt question layout" testid="row-adaptive-questions">
				<Toggle
					checked={resolved.adaptiveQuestions}
					label="Adapt question layout"
					onChange={(on) => onSectionChange({ ...appearance, adaptiveQuestions: on })}
				/>
			</SettingsRow>
		</>
	);
}

export function GraphSection({
	graph,
	onSectionChange,
}: {
	graph: GraphSettings | undefined;
	onSectionChange: (next: GraphSettings) => boolean | Promise<boolean>;
}) {
	// Wave 7 collapse (owner ruling 2026-09-23): the section is the MASTER
	// SWITCH — the embedding/clustering/labeling rungs are gone; clustering
	// is the free birth-session partition derived on read, labels ARE session
	// names. The chunk budget (2026-10-02) joined it as the section's second
	// and only other control: it denominates the coverage ring AND gates the
	// auto-extraction trigger (turn settle ≥ budget fires the run).
	//
	// Resolved through the SAME core resolver the server's effective
	// settings use (one source of truth, the 4096-fallback fix 2026-10-02):
	// the hint and placeholder report exactly the number the trigger waits
	// for — never a second hand-rolled default.
	const resolved = resolveSettings(graph === undefined ? null : { version: 1, graph }).graph;
	return (
		<>
			{/* EXTRACTION (renamed, owner 2026-10-06): this switch is the DATA
			    channel — the pipeline, the auditor, the prober's graph tools. It
			    was born labeled "Graph" and that label lied once the rendering
			    switch below arrived: off ≠ no graph, off = the graph stops
			    growing. The testid keeps the old name's shape (row-enabled) so
			    this stays one rename, not a test re-pin. */}
			<SettingsRow label="Extraction" hint="Off = the graph stops growing" testid="graph-row-enabled">
				<Toggle
					checked={graph?.enabled ?? true}
					label="extraction enabled"
					onChange={(on) =>
						// Compose, never replace-whole (the section PUT is, but the
					// row must not drop its sibling field — fixed with the budget
					// row's arrival: the old { enabled: on } wiped a stored budget).
						onSectionChange({ ...graph, enabled: on })
					}
				/>
			</SettingsRow>
			{/* GRAPH RENDERING (owner, 2026-10-06 — the release graph-controls
			    round): display-only. Off = the home shows the chains view
			    instead of the canvas. The ledgers, the pipeline, everything
			    data keeps working — that is the extraction switch above. */}
			<SettingsRow label="Graph rendering" hint="Off = home shows the chains view" testid="graph-row-rendering">
				<Toggle
					checked={graph?.rendering ?? true}
					label="graph rendering enabled"
					onChange={(on) => onSectionChange({ ...graph, rendering: on })}
				/>
			</SettingsRow>
			<SettingsRow
				label="Extraction chunk budget"
				hint={`${resolved.extractionChunkTokens} tok`}
				testid="graph-row-chunk-tokens"
			>
				<CommitInput
					type="number"
					value={String(graph?.extractionChunkTokens ?? "")}
					placeholder={String(resolved.extractionChunkTokens)}
					ariaLabel="extraction chunk budget"
					testid="input-chunk-tokens"
					onCommit={(v) => {
						// Empty = factory default (the fix-wave discipline): absence is
						// the unset for numbers — Number("") is 0, so clamping would
						// write the floor instead of unsetting.
						if (v === "") {
							return onSectionChange({ ...graph, extractionChunkTokens: undefined });
						}
						const n = Number(v);
						if (!Number.isFinite(n) || n <= 0) return false; // bad input: no write
						// Mirror the server sanitize exactly: floor only (cost
						// protection), no ceiling — a big budget is the user's call.
						return onSectionChange({
							...graph,
							extractionChunkTokens: Math.max(EXTRACTION_CHUNK_TOKENS_FLOOR, Math.round(n)),
						});
					}}
				/>
			</SettingsRow>
		</>
	);
}