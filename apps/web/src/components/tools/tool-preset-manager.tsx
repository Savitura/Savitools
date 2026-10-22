"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { useWorkspaceState } from "@/lib/workspace-storage";
import {
  DEFAULT_TOOL_PRESET_DATA,
  getToolsForPreset,
  normalizeToolPresetData,
  ToolPresetData,
} from "@/lib/tool-presets";
import { tools } from "@/lib/tools";

function newPresetId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ToolPresetManager() {
  const { data, setData, ready, isAuthenticated } = useWorkspaceState(
    "tool-presets",
    DEFAULT_TOOL_PRESET_DATA,
  );
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const normalized = normalizeToolPresetData(data);
  const activePreset =
    normalized.presets.find(
      (preset) => preset.id === normalized.activePresetId,
    ) ?? normalized.presets[0];
  const selectedTools = getToolsForPreset(activePreset);

  useEffect(() => {
    setRename(activePreset.name);
  }, [activePreset.id, activePreset.name]);

  async function persist(next: ToolPresetData) {
    setError(null);
    setSaveState("saving");
    try {
      await setData(normalizeToolPresetData(next));
      setSaveState("saved");
    } catch (cause) {
      setSaveState("error");
      setError(
        cause instanceof Error ? cause.message : "Could not save tool presets.",
      );
    }
  }

  function updateActivePreset(update: (hrefs: string[]) => string[]) {
    void persist({
      ...normalized,
      presets: normalized.presets.map((preset) =>
        preset.id === activePreset.id
          ? { ...preset, toolHrefs: update(preset.toolHrefs) }
          : preset,
      ),
    });
  }

  function createPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Enter a name for the preset.");
      return;
    }
    if (
      normalized.presets.some(
        (preset) => preset.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("A preset with that name already exists.");
      return;
    }
    if (normalized.presets.length >= 50) {
      setError("You can create up to 50 presets.");
      return;
    }

    const preset = {
      id: newPresetId(),
      name: name.slice(0, 40),
      toolHrefs: [],
    };
    setNewName("");
    void persist({
      presets: [...normalized.presets, preset],
      activePresetId: preset.id,
    });
  }

  function renamePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = rename.trim();
    if (!name) {
      setError("Preset names cannot be empty.");
      return;
    }
    if (
      normalized.presets.some(
        (preset) =>
          preset.id !== activePreset.id &&
          preset.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("A preset with that name already exists.");
      return;
    }
    void persist({
      ...normalized,
      presets: normalized.presets.map((preset) =>
        preset.id === activePreset.id
          ? { ...preset, name: name.slice(0, 40) }
          : preset,
      ),
    });
  }

  function deletePreset() {
    if (normalized.presets.length === 1) return;
    const presets = normalized.presets.filter(
      (preset) => preset.id !== activePreset.id,
    );
    void persist({
      presets,
      activePresetId: presets[0].id,
    });
  }

  if (!ready) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading tool presets…
      </p>
    );
  }

  return (
    <section aria-labelledby="tool-presets-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="tool-presets-heading" className="text-sm font-semibold">
            Tool presets
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAuthenticated ? "Account synced" : "Saved in this browser"}
            {saveState === "saving" ? " · Saving…" : ""}
            {saveState === "saved" ? " · Saved" : ""}
            {saveState === "error" ? " · Sync failed" : ""}
          </p>
        </div>
        <form onSubmit={createPreset} className="flex gap-2">
          <label className="sr-only" htmlFor="new-tool-preset">
            New preset name
          </label>
          <input
            id="new-tool-preset"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={40}
            placeholder="New preset"
            className="w-36 rounded-md border border-border bg-background px-2.5 py-2 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:border-foreground/30"
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <nav
        aria-label="Tool presets"
        className="flex gap-2 overflow-x-auto border-b border-border"
      >
        {normalized.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === activePreset.id}
            onClick={() =>
              void persist({ ...normalized, activePresetId: preset.id })
            }
            className={`shrink-0 border-b-2 px-3 py-2 text-xs ${preset.id === activePreset.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {preset.name}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={renamePreset} className="flex gap-2">
          <label className="sr-only" htmlFor="rename-tool-preset">
            Preset name
          </label>
          <input
            id="rename-tool-preset"
            value={rename}
            onChange={(event) => setRename(event.target.value)}
            maxLength={40}
            className="w-40 rounded-md border border-border bg-background px-2.5 py-2 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:border-foreground/30"
          >
            <Save className="h-3.5 w-3.5" />
            Rename
          </button>
        </form>
        <button
          type="button"
          disabled={normalized.presets.length === 1}
          onClick={deletePreset}
          aria-label={`Delete ${activePreset.name} preset`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>

      <fieldset>
        <legend className="mb-3 text-xs font-medium text-muted-foreground">
          {selectedTools.length} of {tools.length} tools included
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const checked = activePreset.toolHrefs.includes(tool.href);
            return (
              <label
                key={tool.href}
                className="flex min-w-0 items-start gap-3 rounded-md border border-border p-3 hover:border-foreground/30"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    updateActivePreset((hrefs) =>
                      checked
                        ? hrefs.filter((href) => href !== tool.href)
                        : [...hrefs, tool.href],
                    )
                  }
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {tool.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {tool.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Tools in {activePreset.name}
        </h3>
        {selectedTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tools are included in this preset.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {selectedTools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group rounded-lg border border-border p-5 transition-colors hover:border-foreground/30"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{tool.label}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs ${
                      tool.status === "MVP"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tool.status}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
