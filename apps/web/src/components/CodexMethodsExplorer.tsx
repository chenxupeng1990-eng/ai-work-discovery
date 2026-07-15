import { useEffect, useMemo, useRef, useState } from "react";
import {
  CODEX_METHOD_CATEGORIES,
  queryCodexMethods,
  type CodexMethod,
  type CodexMethodCategory,
} from "../data/codex-methods";
import "./CodexMethodsExplorer.css";

type CategoryFilter = "全部" | CodexMethodCategory;
type CopyState = "success" | "error";

export function CodexMethodsExplorer({ methods }: { methods: CodexMethod[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const [urlReady, setUrlReady] = useState(false);
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const requestedCategory = url.searchParams.get("category");
    const requestedQuery = url.searchParams.get("q") ?? "";
    if (requestedCategory && CODEX_METHOD_CATEGORIES.includes(requestedCategory as CodexMethodCategory)) {
      setCategory(requestedCategory as CodexMethodCategory);
    }
    setQuery(requestedQuery);
    if (url.searchParams.get("focus") === "search") searchRef.current?.focus();
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (category === "全部") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    url.searchParams.delete("focus");
    window.history.replaceState(null, "", url);
  }, [category, query, urlReady]);

  const results = useMemo(
    () => queryCodexMethods(methods, query, category),
    [category, methods, query],
  );

  const copyPrompt = async (method: CodexMethod) => {
    try {
      await navigator.clipboard.writeText(method.prompt);
      setCopyStates((current) => ({ ...current, [method.id]: "success" }));
    } catch {
      setCopyStates((current) => ({ ...current, [method.id]: "error" }));
    }
  };

  const reset = () => {
    setQuery("");
    setCategory("全部");
    searchRef.current?.focus();
  };

  return (
    <section className="methods-explorer" aria-labelledby="methods-board-title">
      <div className="methods-controls" data-methods-controls>
        <label className="methods-search">
          <span className="visually-hidden">搜索 Codex 方法</span>
          <span className="methods-search__icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="搜索问题、效果、提示词或来源"
            aria-label="搜索 Codex 方法"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="methods-categories" aria-label="方法分类">
          {(["全部", ...CODEX_METHOD_CATEGORIES] as CategoryFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <header className="methods-board-heading">
        <div>
          <p>Method Board</p>
          <h2 id="methods-board-title">可直接使用的 Codex 方法</h2>
        </div>
        <p role="status" aria-label="方法结果数量" aria-live="polite">
          找到 {results.length} 个方法
        </p>
      </header>

      {results.length > 0 ? (
        <div className="methods-grid">
          {results.map((method) => {
            const copyState = copyStates[method.id];
            return (
              <article
                className="method-card"
                data-method-card
                data-category={method.category}
                key={method.id}
              >
                <div className="method-card__topline">
                  <span>{String(method.number).padStart(2, "0")}</span>
                  <em>{method.category}</em>
                </div>

                <div className="method-card__problem">
                  <span>解决什么问题</span>
                  <h3>{method.title}</h3>
                  <p>{method.problem}</p>
                </div>

                <div className="method-card__outcome">
                  <span>能实现的效果</span>
                  <p>{method.outcome}</p>
                </div>

                <div className="method-card__prompt">
                  <div className="method-card__prompt-heading">
                    <span>复制给 Codex</span>
                    <button
                      type="button"
                      aria-label={copyState === "success"
                        ? `已复制 ${method.title}`
                        : copyState === "error"
                          ? `重新复制 ${method.title}`
                          : `复制 ${method.title}`}
                      onClick={() => void copyPrompt(method)}
                    >
                      {copyState === "success" ? "已复制" : copyState === "error" ? "重试" : "复制"}
                    </button>
                  </div>
                  <p>{method.prompt}</p>
                  {copyState && (
                    <span
                      className="visually-hidden"
                      role={copyState === "error" ? "alert" : "status"}
                    >
                      {copyState === "success" ? `已复制给 Codex：${method.title}` : `复制失败，请重试：${method.title}`}
                    </span>
                  )}
                </div>

                <div className="method-card__conditions" aria-label="使用条件">
                  <span>{method.timeToValue}</span>
                  <span>{method.networkRequirement}</span>
                  <span data-risk={method.riskLevel}>{method.riskLevel}</span>
                </div>

                <footer className="method-card__sources">
                  {method.caseSource && (
                    <a href={method.caseSource.url} target="_blank" rel="noreferrer">
                      公开案例 · {method.caseSource.label}
                    </a>
                  )}
                  <a href={method.capabilitySource.url} target="_blank" rel="noreferrer">
                    能力依据 · {method.capabilitySource.label}
                  </a>
                  <time dateTime={method.verifiedAt}>验证于 {method.verifiedAt}</time>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="methods-empty">
          <h2>没有找到匹配的方法</h2>
          <p>换一个更短的关键词，或者清除当前分类</p>
          <button type="button" className="button-secondary" onClick={reset}>清除筛选</button>
        </div>
      )}
    </section>
  );
}
