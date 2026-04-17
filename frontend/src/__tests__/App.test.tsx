import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "@/App";

describe("App", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("renders the hero headline", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/CRM pro prodej/i);
  });

  it("applies dark theme by default when nothing is stored and system prefers dark", () => {
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles theme when the toggle button is pressed", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: /přepnout na světlý režim/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("simplecrm-theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: /přepnout na tmavý režim/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
