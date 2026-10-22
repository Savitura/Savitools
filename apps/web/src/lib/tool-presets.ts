import { tools } from "./tools";

export interface ToolPreset {
  id: string;
  name: string;
  toolHrefs: string[];
}

export interface ToolPresetData {
  presets: ToolPreset[];
  activePresetId: string;
}

export const DEFAULT_TOOL_PRESET_DATA: ToolPresetData = {
  presets: [
    {
      id: "all-tools",
      name: "All tools",
      toolHrefs: tools.map((tool) => tool.href),
    },
  ],
  activePresetId: "all-tools",
};

const validToolHrefs = new Set<string>(tools.map((tool) => tool.href));

export function normalizeToolPresetData(value: unknown): ToolPresetData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_TOOL_PRESET_DATA;
  }

  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.presets)) return DEFAULT_TOOL_PRESET_DATA;

  const seenIds = new Set<string>();
  const presets = input.presets
    .slice(0, 50)
    .flatMap((candidate): ToolPreset[] => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      )
        return [];
      const preset = candidate as Record<string, unknown>;
      if (
        typeof preset.id !== "string" ||
        !preset.id.trim() ||
        typeof preset.name !== "string" ||
        !preset.name.trim() ||
        !Array.isArray(preset.toolHrefs)
      )
        return [];

      const id = preset.id.slice(0, 80);
      if (seenIds.has(id)) return [];
      seenIds.add(id);

      return [
        {
          id,
          name: preset.name.trim().slice(0, 40),
          toolHrefs: [
            ...new Set(
              preset.toolHrefs.filter(
                (href): href is string =>
                  typeof href === "string" && validToolHrefs.has(href),
              ),
            ),
          ],
        },
      ];
    });

  if (presets.length === 0) return DEFAULT_TOOL_PRESET_DATA;

  return {
    presets,
    activePresetId: presets.some((preset) => preset.id === input.activePresetId)
      ? (input.activePresetId as string)
      : presets[0].id,
  };
}

export function getToolsForPreset(preset: ToolPreset) {
  const selected = new Set(preset.toolHrefs);
  return tools.filter((tool) => selected.has(tool.href));
}
