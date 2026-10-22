import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ToolPresetManager } from "@/components/tools/tool-preset-manager";

jest.mock("@/lib/workspace-storage", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    useWorkspaceState: (_tool: string, initial: unknown) => {
      const [data, setState] = React.useState(initial);
      return {
        data,
        setData: async (next: unknown) => setState(next),
        ready: true,
        isAuthenticated: true,
      };
    },
  };
});

describe("ToolPresetManager", () => {
  it("creates and configures an account-synced preset", async () => {
    const user = userEvent.setup();
    render(<ToolPresetManager />);

    await user.type(screen.getByLabelText("New preset name"), "Payments");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const presetTab = await screen.findByRole("button", { name: "Payments" });
    expect(presetTab).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Account synced/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Composer/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Tools in Payments" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Composer/ })).toHaveAttribute(
        "href",
        "/composer",
      );
    });
  });

  it("rejects a duplicate preset name", async () => {
    const user = userEvent.setup();
    render(<ToolPresetManager />);

    await user.type(screen.getByLabelText("New preset name"), "All tools");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A preset with that name already exists.",
    );
  });
});
