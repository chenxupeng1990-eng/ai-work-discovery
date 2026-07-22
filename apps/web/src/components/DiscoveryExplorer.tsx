import { useEffect, useMemo, useState } from "react";
import { slugForTrack } from "../lib/categories";
import { withoutTerminalFullStops } from "../lib/card-text";
import { copyText } from "../lib/copy-text";
import { sitePath } from "../lib/site-path";
import { queryContent, type QueryOptions } from "../lib/content-query";
import {
  DISCOVERY_TRACKS,
  type DiscoveryTrack,
} from "../lib/discovery-recommendation";
import type { ContentItem } from "../lib/schema";
import "./DiscoveryExplorer.css";

const initialOptions: QueryOptions = {
  query: "",
  category: "全部",
  sort: "featured",
};

type TrackFilter = "全部" | DiscoveryTrack;

type DiscoveryExplorerProps = {
  items: ContentItem[];
  limit?: number;
  showMoreLink?: boolean;
};

export function DiscoveryExplorer({
  items,
  limit,
  showMoreLink = false,
}: DiscoveryExplorerProps) {
  const [options, setOptions] = useState<QueryOptions>(initialOptions);
  const [track, setTrack] = useState<TrackFilter>("全部");
  const [copyStatus, setCopyStatus] = useState<Record<string, "success" | "error">>({});

  const results = useMemo(() => {
    const queried = queryContent(items, options);
    return track === "全部"
      ? queried
      : queried.filter((item) => item.recommendationTrack === track);
  }, [items, options, track]);
  const visibleLimit = limit === undefined ? results.length : Math.max(0, limit);
  const moreHref = sitePath(track === "全部" ? "/updates" : `/category/${slugForTrack(track)}`);
  const moreLabel = track === "全部" ? "查看最近更新" : `查看「${track}」全部内容`;

  useEffect(() => {
    const syncTrackFromUrl = () => {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get("track");
      const nextTrack = requested && DISCOVERY_TRACKS.includes(requested as DiscoveryTrack)
        ? requested as DiscoveryTrack
        : "全部";
      setTrack(nextTrack);
      if (requested && nextTrack === "全部") {
        url.searchParams.delete("track");
        window.history.replaceState(null, "", url);
      }
    };

    syncTrackFromUrl();
    window.addEventListener("popstate", syncTrackFromUrl);
    return () => window.removeEventListener("popstate", syncTrackFromUrl);
  }, []);

  const selectTrack = (nextTrack: TrackFilter) => {
    setTrack(nextTrack);
    const url = new URL(window.location.href);
    if (nextTrack === "全部") url.searchParams.delete("track");
    else url.searchParams.set("track", nextTrack);
    window.history.replaceState(null, "", url);
  };

  const resetOptions = () => {
    setOptions(initialOptions);
    selectTrack("全部");
  };

  const copyFirstBlock = async (item: ContentItem) => {
    const block = [...item.copyBlocks].sort((left, right) => left.order - right.order)[0];
    if (!block) return;
    try {
      await copyText(block.content);
      setCopyStatus((current) => ({ ...current, [item.id]: "success" }));
    } catch {
      setCopyStatus((current) => ({ ...current, [item.id]: "error" }));
    }
  };

  return (
    <section
      className="discovery-explorer"
      data-discovery-explorer
      data-discovery-limit={limit}
      aria-labelledby="discovery-results-title"
    >
      <div className="discovery-controls" data-discovery-controls>
        <label className="discovery-search">
          <span className="visually-hidden">搜索内容</span>
          <span className="discovery-search__icon" aria-hidden="true" />
          <input
            data-discovery-search
            type="search"
            value={options.query}
            placeholder="搜索方法、可带走结果、标签或来源"
            aria-label="搜索内容"
            onChange={(event) => setOptions({ ...options, query: event.target.value })}
          />
        </label>

        <div className="discovery-filter-row">
          <div className="discovery-categories" aria-label="推荐轨道">
            {(["全部", ...DISCOVERY_TRACKS] as TrackFilter[]).map((itemTrack) => (
              <button
                key={itemTrack}
                type="button"
                aria-pressed={track === itemTrack}
                data-discovery-track={itemTrack}
                data-category-href={itemTrack === "全部"
                  ? sitePath("/updates")
                  : sitePath(`/category/${slugForTrack(itemTrack)}`)}
                onClick={() => selectTrack(itemTrack)}
              >
                {itemTrack}
              </button>
            ))}
          </div>

          <div className="discovery-sort" aria-label="内容排序">
            <button
              type="button"
              aria-pressed={options.sort === "featured"}
              data-discovery-sort="featured"
              onClick={() => setOptions({ ...options, sort: "featured" })}
            >
              精选
            </button>
            <button
              type="button"
              aria-pressed={options.sort === "latest"}
              data-discovery-sort="latest"
              onClick={() => setOptions({ ...options, sort: "latest" })}
            >
              最新
            </button>
          </div>
        </div>
      </div>

      <div className="discovery-results-heading">
        <h2 id="discovery-results-title" data-discovery-title>{track === "全部" ? "全部发现" : track}</h2>
        <div className="discovery-results-heading__actions">
          <div data-discovery-status role="status" aria-label="搜索结果数量" aria-live="polite">
            找到 {results.length} 项内容
          </div>
          {showMoreLink && (
            <a className="discovery-more" data-discovery-more href={moreHref}>
              {moreLabel}<span aria-hidden="true"> →</span>
            </a>
          )}
        </div>
      </div>

      <div className="discovery-grid" data-discovery-grid hidden={results.length === 0}>
          {results.map((item, index) => {
            const status = copyStatus[item.id];
            const searchText = [
              item.title,
              item.summary,
              item.recommendationReason,
              item.recommendationTrack,
              item.timeToValue,
              item.adoptionLevel,
              item.networkRequirement,
              item.takeaway,
              item.sourceName,
              ...item.tags,
              ...item.copyBlocks.map((block) => block.title),
            ].join(" ").trim().toLocaleLowerCase("zh-CN");
            const firstCopyBlock = [...item.copyBlocks].sort((left, right) => left.order - right.order)[0];
            return (
            <article
              className="discovery-card"
              data-discovery-card
              data-content-id={item.id}
              data-track={item.recommendationTrack}
              data-search-text={searchText}
              data-sort-weight={item.sortWeight}
              data-updated-at={item.updatedAt}
              data-content-slug={item.slug}
              hidden={index >= visibleLimit}
              key={item.id}
            >
              <div className="discovery-card__visual">
                <a href={sitePath(`/content/${item.slug}`)}>
                  <img
                    src={sitePath(item.coverImage)}
                    alt={`${item.title}内容截图`}
                    width="640"
                    height="400"
                    loading="lazy"
                    data-home-content-image={showMoreLink && index < visibleLimit ? "true" : undefined}
                  />
                </a>
                <button
                  type="button"
                  className="like-button"
                  data-like-button
                  data-content-id={item.id}
                  data-content-title={item.title}
                  aria-label={`点赞 ${item.title}`}
                  aria-pressed="false"
                  title="有用就点个赞"
                >
                  <span className="like-button__icon" aria-hidden="true">👍︎</span>
                  <span className="like-button__tooltip" role="tooltip">有用就点个赞</span>
                </button>
              </div>
              <div className="discovery-card__body">
                <div className="discovery-card__meta">
                  <span>{item.recommendationTrack}</span>
                  <span>{item.timeToValue} · {item.adoptionLevel} · {item.networkRequirement}</span>
                </div>
                <h3><a href={sitePath(`/content/${item.slug}`)}>{item.title}</a></h3>
                <p className="discovery-card__reason">{withoutTerminalFullStops(item.recommendationReason)}</p>
                <div className="discovery-card__takeaway">
                  <span>你能带走</span>
                  <p>{withoutTerminalFullStops(item.takeaway)}</p>
                </div>
                <div className="discovery-card__tags">
                  {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="discovery-card__actions">
                  <a className="button-primary" href={sitePath(`/content/${item.slug}`)}>仔细看看</a>
                  {item.copyBlocks.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={status === "success"
                          ? "已复制给codex"
                          : status === "error"
                            ? "重新复制"
                            : "直接复制给codex"}
                        data-discovery-copy
                        data-copy-text={firstCopyBlock?.content}
                        onClick={() => void copyFirstBlock(item)}
                      >
                        {status === "success" ? "已复制给codex" : status === "error" ? "重新复制" : "直接复制给codex"}
                      </button>
                      {status && (
                        <span
                          className="visually-hidden"
                          role={status === "error" ? "alert" : "status"}
                        >
                          {status === "error" ? `复制失败，请重试：${item.title}` : `已复制：${item.title}`}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
            );
          })}
        </div>
        <div className="discovery-empty" data-discovery-empty hidden={results.length > 0}>
          <h2>没有找到匹配内容</h2>
          <p>试试缩短关键词，或清除筛选查看全部内容。</p>
          <button type="button" className="button-secondary" data-discovery-reset onClick={resetOptions}>
            清除筛选
          </button>
        </div>
    </section>
  );
}
