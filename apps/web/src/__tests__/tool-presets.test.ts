import { tools } from "@/lib/tools";
import {
  DEFAULT_TOOL_PRESET_DATA,
  getToolsForPreset,
  normalizeToolPresetData,
} from "@/lib/tool-presets";

describe("tool presets", () => {
  it("defaults to a preset containing the complete tool catalog", () => {
    expect(getToolsForPreset(DEFAULT_TOOL_PRESET_DATA.presets[0])).toEqual(
      tools,
    );
  });

  it("normalizes duplicate and unknown tool links and repairs an invalid active preset", () => {
    const normalized = normalizeToolPresetData({
      presets: [
        {
          id: "custom",
          name: "  Custom  ",
          toolHrefs: ["/composer", "/composer", "/not-a-tool", 42],
        },
      ],
      activePresetId: "missing",
    });

    expect(normalized).toEqual({
      presets: [{ id: "custom", name: "Custom", toolHrefs: ["/composer"] }],
      activePresetId: "custom",
    });
    expect(
      getToolsForPreset(normalized.presets[0]).map((tool) => tool.href),
    ).toEqual(["/composer"]);
  });

  it("falls back safely when persisted data is malformed or has no valid presets", () => {
    expect(normalizeToolPresetData(null)).toBe(DEFAULT_TOOL_PRESET_DATA);
    expect(
      normalizeToolPresetData({
        presets: [{ id: "", name: "", toolHrefs: [] }],
      }),
    ).toBe(DEFAULT_TOOL_PRESET_DATA);
  });

  it("drops duplicate preset IDs to keep saved data deterministic", () => {
    const normalized = normalizeToolPresetData({
      presets: [
        { id: "same", name: "First", toolHrefs: ["/composer"] },
        { id: "same", name: "Second", toolHrefs: ["/sandbox"] },
      ],
      activePresetId: "same",
    });

    expect(normalized.presets).toEqual([
      { id: "same", name: "First", toolHrefs: ["/composer"] },
    ]);
  });
});
