/**
 * DELETE /api/themes/[id] (theme wave, 2026-11-04) — remove an imported
 * theme. Presets cannot be removed (400); an unknown id is a 404. A
 * light/dark slot that used it falls back to its default theme (a legacy
 * record's single theme to "default"); every color override stays.
 */

import { isBuiltinThemeId } from "@/src/core";
import { readSettingsRecord, themeStore, writeSettingsRecord } from "@/src/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	if (isBuiltinThemeId(id)) return Response.json({ error: `"${id}" is a built-in theme` }, { status: 400 });
	const theme = themeStore.readTheme(id);
	if (!theme) return Response.json({ error: `unknown theme "${id}"` }, { status: 404 });
	themeStore.deleteTheme(id);
	const record = readSettingsRecord();
	const a = record?.appearance;
	if (record && a && (a.theme === id || a.light?.theme === id || a.dark?.theme === id)) {
		const next = { ...a };
		if (next.theme === id) next.theme = "default";
		// A slot that used it falls back to its default theme; overrides stay.
		for (const mode of ["light", "dark"] as const) {
			const slot = next[mode];
			if (slot?.theme === id) {
				const { theme: _removed, ...rest } = slot;
				next[mode] = rest;
			}
		}
		writeSettingsRecord({ ...record, appearance: next });
	}
	return Response.json({ theme });
}
