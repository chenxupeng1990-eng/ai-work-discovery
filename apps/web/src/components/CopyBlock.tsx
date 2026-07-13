import { useEffect, useRef, useState } from "react";
import type { CopyBlock } from "../lib/schema";

type CopyState = "idle" | "copied" | "error";

export function CopyBlockView({ block }: { block: CopyBlock }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setReady(true);
    return () => window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    window.clearTimeout(resetTimer.current);

    try {
      await navigator.clipboard.writeText(block.content);
      setState("copied");
      resetTimer.current = window.setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("error");
    }
  }

  const copied = state === "copied";
  const feedback = copied
    ? `已复制 ${block.title}`
    : state === "error"
      ? "复制失败，请重试"
      : "";

  return (
    <section className="copy-block" aria-labelledby={`copy-block-${block.id}`}>
      <header className="copy-block__header">
        <div>
          <p>{block.type}</p>
          <h2 id={`copy-block-${block.id}`}>{block.title}</h2>
        </div>
        <button
          type="button"
          className="copy-block__button"
          aria-label={`${copied ? "已复制" : "复制"} ${block.title}`}
          disabled={!ready}
          onClick={copy}
        >
          <span className="copy-block__icon" aria-hidden="true"><span /></span>
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </header>
      <pre><code className={`language-${block.language}`}>{block.content}</code></pre>
      {block.note && <p className="copy-block__note">{block.note}</p>}
      <span
        className="visually-hidden"
        role={state === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {feedback}
      </span>
    </section>
  );
}
