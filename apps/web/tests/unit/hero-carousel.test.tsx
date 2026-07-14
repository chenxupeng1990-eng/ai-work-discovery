import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "../../src/components/HeroCarousel";
import { fixtureDataset } from "../fixtures/content";

const [first, second] = fixtureDataset.items;

function setReducedMotion(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: (() => void) | undefined;
  const addEventListener = vi.fn((type: string, listener: () => void) => {
    if (type === "change") changeListener = listener;
  });
  const removeEventListener = vi.fn();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener,
    removeEventListener,
    dispatchEvent: vi.fn(),
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  return {
    addEventListener,
    removeEventListener,
    change(nextMatches: boolean) {
      matches = nextMatches;
      changeListener?.();
    },
  };
}

function setPageVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

describe("HeroCarousel", () => {
  beforeEach(() => {
    setReducedMotion(false);
    setPageVisibility("visible");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("server-renders the first slide as the accessible active slide", () => {
    const markup = renderToStaticMarkup(<HeroCarousel items={[first!, second!]} />);
    const container = document.createElement("div");
    container.innerHTML = markup;
    const region = container.querySelector('[role="region"]');
    const slides = container.querySelectorAll('[aria-roledescription="slide"]');

    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(region).toHaveAttribute("aria-label", "精选内容");
    expect(slides).toHaveLength(2);
    expect(slides[0]).not.toHaveAttribute("aria-hidden");
    expect(slides[0]).not.toHaveAttribute("inert");
    expect(slides[0]?.querySelector("h1")).toHaveTextContent(first!.title);
    expect(slides[0]?.querySelector("a")).toHaveAttribute("href", `/content/${first!.slug}`);
    expect(slides[1]).toHaveAttribute("aria-hidden", "true");
    expect(slides[1]).toHaveAttribute("inert");
  });

  it("supports next and previous navigation with wrapping", () => {
    render(<HeroCarousel items={[first!, second!]} />);

    fireEvent.click(screen.getByRole("button", { name: "下一项精选" }));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看内容" })).toHaveAttribute("href", `/content/${second!.slug}`);

    fireEvent.click(screen.getByRole("button", { name: "下一项精选" }));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "上一项精选" }));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
  });

  it("supports dot navigation and announces the active position", () => {
    render(<HeroCarousel items={[first!, second!]} />);

    expect(screen.getByRole("group", { name: "选择精选内容" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: `转到第 2 项：${second!.title}` }));

    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("第 2 项，共 2 项");
    expect(screen.getByRole("button", { name: `转到第 2 项：${second!.title}` })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("supports ArrowLeft and ArrowRight navigation", () => {
    render(<HeroCarousel items={[first!, second!]} />);
    const region = screen.getByRole("region", { name: "精选内容" });

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();

    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
  });

  it.each([
    ["next arrow", () => fireEvent.click(screen.getByRole("button", { name: "下一项精选" }))],
    ["dot", () => fireEvent.click(screen.getByRole("button", { name: `转到第 2 项：${second!.title}` }))],
    ["ArrowRight key", () => fireEvent.keyDown(screen.getByRole("region", { name: "精选内容" }), { key: "ArrowRight" })],
  ])("restarts the full six-second autoplay delay after manual %s navigation", (_method, navigate) => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first!, second!]} />);

    act(() => vi.advanceTimersByTime(3000));
    navigate();
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();

    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
  });

  it("advances after six seconds and pauses while hovered", () => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first!, second!]} />);
    const region = screen.getByRole("region", { name: "精选内容" });

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();

    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();

    fireEvent.mouseLeave(region);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
  });

  it("pauses autoplay while focus remains inside the carousel", () => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first!, second!]} />);

    const nextButton = screen.getByRole("button", { name: "下一项精选" });
    fireEvent.focus(nextButton);
    act(() => vi.advanceTimersByTime(6000));

    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
  });

  it("pauses autoplay while the page is hidden and resumes when visible", () => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first!, second!]} />);

    setPageVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();

    setPageVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
  });

  it("renders one item without navigation or autoplay controls", () => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first!]} />);

    act(() => vi.advanceTimersByTime(12000));

    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看内容" })).toHaveAttribute("href", `/content/${first!.slug}`);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("第 1 项，共 1 项");
  });

  it("renders nothing for an empty item list", () => {
    const { container } = render(<HeroCarousel items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not autoplay when reduced motion is preferred", () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    render(<HeroCarousel items={[first!, second!]} />);

    act(() => vi.advanceTimersByTime(12000));

    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一项精选" }));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
  });

  it("responds to reduced-motion preference changes", () => {
    vi.useFakeTimers();
    const motion = setReducedMotion(false);
    render(<HeroCarousel items={[first!, second!]} />);

    act(() => vi.advanceTimersByTime(3000));
    act(() => motion.change(true));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();

    act(() => motion.change(false));
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole("heading", { name: first!.title })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { name: second!.title })).toBeVisible();
  });

  it("removes media and visibility listeners and clears the interval on unmount", () => {
    vi.useFakeTimers();
    const motion = setReducedMotion(false);
    const addDocumentListener = vi.spyOn(document, "addEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<HeroCarousel items={[first!, second!]} />);
    const visibilityListener = addDocumentListener.mock.calls.find(([type]) => type === "visibilitychange")?.[1];
    const mediaListener = motion.addEventListener.mock.calls.find(([type]) => type === "change")?.[1];
    const interval = setIntervalSpy.mock.results[0]?.value;

    unmount();

    expect(mediaListener).toBeDefined();
    expect(motion.removeEventListener).toHaveBeenCalledWith("change", mediaListener);
    expect(visibilityListener).toBeDefined();
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", visibilityListener);
    expect(interval).toBeDefined();
    expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
  });
});
