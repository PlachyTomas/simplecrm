import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/Logo";

describe("Logo", () => {
  it("renders the full SimpleCRM wordmark by default", () => {
    render(<Logo />);
    // The dot is a separate aria-hidden span, so the text content is
    // "SimpleCRM." while the accessible/visible wordmark reads "SimpleCRM".
    expect(screen.getByText(/SimpleCRM/)).toBeInTheDocument();
  });

  it("renders the compact mark variant", () => {
    render(<Logo variant="mark" />);
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.queryByText(/SimpleCRM/)).not.toBeInTheDocument();
  });
});
