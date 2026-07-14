import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { testIds } from "@/lib/testids";

describe("IosInstallModal", () => {
  it("renders nothing when closed", () => {
    render(<IosInstallModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows both steps and closes via the done button", async () => {
    const onClose = vi.fn();
    render(<IosInstallModal open onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // cs catalog is the test language (see test-setup).
    expect(screen.getByText("V prohlížeči klepněte na tlačítko Sdílet.")).toBeInTheDocument();
    expect(screen.getByText("Zvolte možnost „Přidat na plochu“.")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(testIds.pwa.iosModalClose));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
