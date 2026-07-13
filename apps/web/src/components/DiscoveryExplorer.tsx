import { useMemo, useState } from "react";
import { queryContent, type QueryOptions } from "../lib/content-query";
import type { ContentItem } from "../lib/schema";

const initialOptions: QueryOptions = {
  query: "",
  category: "全部",
  sort: "featured",
};

export function DiscoveryExplorer({ items }: { items: ContentItem[] }) {
  const [options, setOptions] = useState<QueryOptions>(initialOptions);
  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );
  const results = useMemo(() => queryContent(items, options), [items, options]);

  return (
    <section className="discovery-explorer" aria-labelledby="discovery-results-title">
      <div className="discovery-controls" data-discovery-controls>
        <label className="discovery-search">
          <span className="visually-hidden">搜索内容</span>
          <span className="discovery-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={options.query}
            placeholder="搜索标题、摘要、推荐理由、标签或来源"
            aria-label="搜索内容"
            onChange={(event) => setOptions({ ...options, query: event.target.value })}
          />
        </label>

        <div className="discovery-filter-row">
          <div className="discovery-categories" aria-label="内容分类">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={options.category === category}
                onClick={() => setOptions({ ...options, category })}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="discovery-sort" aria-label="内容排序">
            <button
              type="button"
              aria-pressed={options.sort === "featured"}
              onClick={() => setOptions({ ...options, sort: "featured" })}
            >
              精选
            </button>
            <button
              type="button"
              aria-pressed={options.sort === "latest"}
              onClick={() => setOptions({ ...options, sort: "latest" })}
            >
              最新
            </button>
          </div>
        </div>
      </div>

      <div className="discovery-results-heading">
        <h2 id="discovery-results-title">全部发现</h2>
        <div role="status" aria-label="搜索结果数量" aria-live="polite">
          找到 {results.length} 项内容
        </div>
      </div>

      {results.length > 0 ? (
        <div className="discovery-grid">
          {results.map((item) => {
            const href = item.feishuDocumentUrl ?? item.originalUrl;
            const content = (
              <>
                <img
                  src={item.coverImage}
                  alt={`${item.title}内容截图`}
                  width="640"
                  height="400"
                  loading="lazy"
                />
                <div className="discovery-card__body">
                  <div className="discovery-card__meta">
                    <span>{item.category}</span>
                    <span>{item.sourceName}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                </div>
              </>
            );

            return (
              <article className="discovery-card" key={item.id}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {content}
                  </a>
                ) : content}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="discovery-empty">
          <h2>没有找到匹配内容</h2>
          <p>试试缩短关键词，或清除筛选查看全部内容。</p>
          <button type="button" className="button-secondary" onClick={() => setOptions(initialOptions)}>
            清除筛选
          </button>
        </div>
      )}
    </section>
  );
}
