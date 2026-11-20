import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputView } from "./OutputView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("output lifecycle", () => {
  it("does not treat a modified scrollIntoView return value as a cleanup", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn(() => ({ extensionResult: true }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      const view = render(<OutputView lines={[{ kind: "stdout", text: "first\n" }]} />);
      expect(() => view.rerender(<OutputView lines={[{ kind: "stdout", text: "second\n" }]} />)).not.toThrow();
      expect(() => view.unmount()).not.toThrow();
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
});