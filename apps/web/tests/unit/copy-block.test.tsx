import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyBlockView } from "../../src/components/CopyBlock";
import type { CopyBlock } from "../../src/lib/schema";

const block: CopyBlock = {
  id: "dependency-check-command",
  title: "基础依赖检查",
  type: "Command",
  language: "shell",
  content: "node --version\nnpm --version\ngit --version",
  order: 0,
};

function installClipboard(writeText: (content: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

describe("CopyBlockView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("copies the block and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);
    render(createElement(CopyBlockView, { block }));

    fireEvent.click(screen.getByRole("button", { name: "复制 基础依赖检查" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(block.content));
    expect(screen.getByRole("status")).toHaveTextContent("已复制 基础依赖检查");
    expect(screen.getByRole("button", { name: "已复制 基础依赖检查" })).toBeEnabled();
  });

  it("restores the copy button after 1600ms", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);
    render(createElement(CopyBlockView, { block }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制 基础依赖检查" }));
    });
    expect(screen.getByRole("button", { name: "已复制 基础依赖检查" })).toBeEnabled();

    act(() => vi.advanceTimersByTime(1599));
    expect(screen.getByRole("button", { name: "已复制 基础依赖检查" })).toBeEnabled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "复制 基础依赖检查" })).toBeEnabled();
  });

  it("announces clipboard failure and remains retryable", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
    installClipboard(writeText);
    render(createElement(CopyBlockView, { block }));

    const button = screen.getByRole("button", { name: "复制 基础依赖检查" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("复制失败，请重试"));
    expect(button).toHaveAccessibleName("复制 基础依赖检查");
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("已复制 基础依赖检查");
  });
});
