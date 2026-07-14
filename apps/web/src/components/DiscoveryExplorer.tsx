import { useEffect, useMemo, useState } from "react";
import { queryContent, type QueryOptions } from "../lib/content-query";
import {
  ADOPTION_LEVEL_OPTIONS,
  DISCOVERY_FORMATS,
  DISCOVERY_TRACKS,
  recommendContent,
  TIME_TO_VALUE_OPTIONS,
  type DiscoveryPreferences,
  type DiscoveryTrack,
} from "../lib/discovery-recommendation";
import type { ContentItem } from "../lib/schema";

const initialOptions: QueryOptions = {
  query: "",
  category: "全部",
  sort: "featured",
};

const initialPreferences: DiscoveryPreferences = {
  timeToValue: "10 分钟",
  goal: "工作提效",
  format: "可复制内容",
  adoptionLevel: "直接使用",
};

const trackDescriptions: Record<DiscoveryTrack, string> = {
  灵感实验: "有新鲜感、可演示，适合快速打开思路。",
  工作提效: "能进入日常流程，优先解决真实工作问题。",
  团队实践: "来自协作现场，可用于复盘、对齐和推广。",
  前沿信号: "追踪正在形成的新工具、新能力和行业变化。",
};

type TrackFilter = "全部" | DiscoveryTrack;

export function DiscoveryExplorer({ items }: { items: ContentItem[] }) {
  const [options, setOptions] = useState<QueryOptions>(initialOptions);
  const [track, setTrack] = useState<TrackFilter>("全部");
  const [preferences, setPreferences] = useState<DiscoveryPreferences>(initialPreferences);
  const [copyStatus, setCopyStatus] = useState<Record<string, "success" | "error">>({});

  const recommendations = useMemo(
    () => recommendContent(items, preferences, 3),
    [items, preferences],
  );
  const results = useMemo(() => {
    const queried = queryContent(items, options);
    return track === "全部"
      ? queried
      : queried.filter((item) => item.recommendationTrack === track);
  }, [items, options, track]);

  useEffect(() => {
    const syncTrackFromUrl = () => {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get("track");
      const nextTrack = requested && DISCOVERY_TRACKS.includes(requested as DiscoveryTrack)
        ? requested as DiscoveryTrack
        : "全部";
      setTrack(nextTrack);
      if (nextTrack !== "全部") {
        setPreferences((current) => current.goal === nextTrack ? current : { ...current, goal: nextTrack });
      }
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
    if (nextTrack !== "全部") {
      setPreferences((current) => current.goal === nextTrack ? current : { ...current, goal: nextTrack });
    }
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
      await navigator.clipboard.writeText(block.content);
      setCopyStatus((current) => ({ ...current, [item.id]: "success" }));
    } catch {
      setCopyStatus((current) => ({ ...current, [item.id]: "error" }));
    }
  };

  return (
    <section className="discovery-explorer" aria-labelledby="discovery-results-title">
      <div className="track-intro" aria-labelledby="track-intro-title">
        <div className="section-heading">
          <p>从目标出发</p>
          <h2 id="track-intro-title">今天想发现什么？</h2>
        </div>
        <div className="track-grid">
          {DISCOVERY_TRACKS.map((itemTrack, index) => (
            <button
              key={itemTrack}
              type="button"
              aria-pressed={track === itemTrack}
              onClick={() => selectTrack(track === itemTrack ? "全部" : itemTrack)}
            >
              <span>0{index + 1}</span>
              <strong>{itemTrack}</strong>
              <small>{trackDescriptions[itemTrack]}</small>
            </button>
          ))}
        </div>
      </div>

      <section className="starter-picker" aria-labelledby="starter-picker-title">
        <div className="starter-picker__heading">
          <div className="section-heading">
            <p>快速匹配</p>
            <h2 id="starter-picker-title">先挑 3 项适合现在尝试的内容</h2>
          </div>
          <p>按投入时间、目标、结果形式和使用门槛实时推荐。</p>
        </div>

        <div className="starter-picker__controls">
          <PreferenceGroup
            label="多久见效"
            options={TIME_TO_VALUE_OPTIONS}
            value={preferences.timeToValue}
            onChange={(timeToValue) => setPreferences({ ...preferences, timeToValue })}
          />
          <PreferenceGroup
            label="主要目标"
            options={DISCOVERY_TRACKS}
            value={preferences.goal}
            onChange={(goal) => setPreferences({ ...preferences, goal })}
          />
          <PreferenceGroup
            label="想拿走什么"
            options={DISCOVERY_FORMATS}
            value={preferences.format}
            onChange={(format) => setPreferences({ ...preferences, format })}
          />
          <PreferenceGroup
            label="接受的门槛"
            options={ADOPTION_LEVEL_OPTIONS}
            value={preferences.adoptionLevel}
            onChange={(adoptionLevel) => setPreferences({ ...preferences, adoptionLevel })}
          />
        </div>

        <p className="visually-hidden" role="status" aria-live="polite">
          已按{preferences.timeToValue}、{preferences.goal}、{preferences.format}、
          {preferences.adoptionLevel}更新 {recommendations.length} 项推荐
        </p>
        <div className="starter-results">
          {recommendations.map((item, index) => (
            <article className="starter-result" key={item.id}>
              <div className="starter-result__meta">
                <span>0{index + 1}</span>
                <em>{item.recommendationTrack}</em>
              </div>
              <h3><a href={`/content/${item.slug}`}>{item.title}</a></h3>
              <p>{item.recommendationReason}</p>
              <div className="starter-result__takeaway">
                <span>可以带走</span>
                <strong>{item.takeaway}</strong>
              </div>
              <a className="text-link" href={`/content/${item.slug}`}>查看实践</a>
            </article>
          ))}
        </div>
      </section>

      <div className="discovery-controls" data-discovery-controls>
        <label className="discovery-search">
          <span className="visually-hidden">搜索内容</span>
          <span className="discovery-search__icon" aria-hidden="true" />
          <input
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
        <h2 id="discovery-results-title">{track === "全部" ? "全部发现" : track}</h2>
        <div role="status" aria-label="搜索结果数量" aria-live="polite">
          找到 {results.length} 项内容
        </div>
      </div>

      {results.length > 0 ? (
        <div className="discovery-grid">
          {results.map((item) => {
            const status = copyStatus[item.id];
            return (
            <article className="discovery-card" data-discovery-card key={item.id}>
              <a className="discovery-card__visual" href={`/content/${item.slug}`}>
                <img
                  src={item.coverImage}
                  alt={`${item.title}内容截图`}
                  width="640"
                  height="400"
                  loading="lazy"
                />
              </a>
              <div className="discovery-card__body">
                <div className="discovery-card__meta">
                  <span>{item.recommendationTrack}</span>
                  <span>{item.timeToValue} · {item.adoptionLevel} · {item.networkRequirement}</span>
                </div>
                <h3><a href={`/content/${item.slug}`}>{item.title}</a></h3>
                <p className="discovery-card__reason">{item.recommendationReason}</p>
                <div className="discovery-card__takeaway">
                  <span>你能带走</span>
                  <p>{item.takeaway}</p>
                </div>
                <div className="discovery-card__tags">
                  {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="discovery-card__actions">
                  <a className="button-primary" href={`/content/${item.slug}`}>拿来试试</a>
                  {item.copyBlocks.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={status === "success"
                          ? `已复制 ${item.title}`
                          : status === "error"
                            ? `重试复制 ${item.title}`
                            : `复制 ${item.title}`}
                        onClick={() => void copyFirstBlock(item)}
                      >
                        {status === "success" ? "已复制" : status === "error" ? "重试复制" : "复制首个内容块"}
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
      ) : (
        <div className="discovery-empty">
          <h2>没有找到匹配内容</h2>
          <p>试试缩短关键词，或清除筛选查看全部内容。</p>
          <button type="button" className="button-secondary" onClick={resetOptions}>
            清除筛选
          </button>
        </div>
      )}
    </section>
  );
}

function PreferenceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="preference-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
