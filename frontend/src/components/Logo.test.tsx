import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/Logo";

describe("Logo", () => {
  it("renders the icon mark plus the SimpleCRM wordmark by default", () => {
    render(<Logo />);
    expect(screen.getByText("SimpleCRM")).toBeInTheDocument();
    // The icon box is decorative (aria-hidden); the accessible name for a
    // wrapping link comes from the visible "SimpleCRM" text.
    expect(document.querySelector('[aria-hidden="true"] svg')).toBeInTheDocument();
  });

  it("uses the larger wordmark size by default and the smaller one when requested", () => {
    const { rerender } = render(<Logo />);
    expect(screen.getByText("SimpleCRM")).toHaveClass("text-lg");

    rerender(<Logo size="sm" />);
    expect(screen.getByText("SimpleCRM")).toHaveClass("text-sm");
  });

  it("renders only the icon mark for variant='mark', with no wordmark text", () => {
    render(<Logo variant="mark" />);
    expect(screen.queryByText("SimpleCRM")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-hidden="true"] svg')).toBeInTheDocument();
  });
});
