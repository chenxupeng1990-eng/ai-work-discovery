import { useMemo, useState } from "react";
import { slugForTrack } from "../lib/categories";
import {
  ADOPTION_LEVEL_OPTIONS,
  DISCOVERY_FORMATS,
  DISCOVERY_TRACKS,
  recommendContent,
  TIME_TO_VALUE_OPTIONS,
  type DiscoveryPreferences,
} from "../lib/discovery-recommendation";
import { withoutTerminalFullStops } from "../lib/card-text";
import { sitePath } from "../lib/site-path";
import type { ContentItem } from "../lib/schema";
import "./QuickMatch.css";

const initialPreferences: DiscoveryPreferences = {
  timeToValue: "10 分钟",
  goal: "工作提效",
  format: "可复制内容",
  adoptionLevel: "直接使用",
};

export function QuickMatch({ items }: { items: ContentItem[] }) {
  const [preferences, setPreferences] = useState<DiscoveryPreferences>(initialPreferences);
  const rankedItems = useMemo(
    () => recommendContent(items, preferences, items.length),
    [items, preferences],
  );
  const categoryCount = items.filter(
    (item) => item.recommendationTrack === preferences.goal,
  ).length;
  const categoryHref = sitePath(`/category/${slugForTrack(preferences.goal)}`);

  return (
    <section
      className="quick-match-section section"
      data-home-section="quick-match"
      aria-labelledby="quick-match-title"
    >
      <div className="container">
        <div className="starter-picker">
          <div className="starter-picker__heading">
            <div className="quick-match-heading">
              <p>快速匹配</p>
              <h2 id="quick-match-title">先挑 3 项适合现在尝试的内容</h2>
            </div>
            <div className="starter-picker__summary">
              <p>按投入时间、目标、结果形式和使用门槛实时推荐。</p>
              <a href={categoryHref} data-quick-category-link>
                查看「{preferences.goal}」全部 {categoryCount} 条
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="starter-picker__controls">
            <PreferenceGroup
              label="多久见效"
              preferenceKey="timeToValue"
              options={TIME_TO_VALUE_OPTIONS}
              value={preferences.timeToValue}
              onChange={(timeToValue) => setPreferences({ ...preferences, timeToValue })}
            />
            <PreferenceGroup
              label="主要目标"
              preferenceKey="goal"
              options={DISCOVERY_TRACKS}
              value={preferences.goal}
              onChange={(goal) => setPreferences({ ...preferences, goal })}
              categoryMeta={Object.fromEntries(DISCOVERY_TRACKS.map((goal) => [
                goal,
                {
                  href: sitePath(`/category/${slugForTrack(goal)}`),
                  count: items.filter((item) => item.recommendationTrack === goal).length,
                },
              ]))}
            />
            <PreferenceGroup
              label="想拿走什么"
              preferenceKey="format"
              options={DISCOVERY_FORMATS}
              value={preferences.format}
              onChange={(format) => setPreferences({ ...preferences, format })}
            />
            <PreferenceGroup
              label="接受的门槛"
              preferenceKey="adoptionLevel"
              options={ADOPTION_LEVEL_OPTIONS}
              value={preferences.adoptionLevel}
              onChange={(adoptionLevel) => setPreferences({ ...preferences, adoptionLevel })}
            />
          </div>

          <p className="visually-hidden" data-quick-status role="status" aria-live="polite">
            已按{preferences.timeToValue}、{preferences.goal}、{preferences.format}、
            {preferences.adoptionLevel}更新 {Math.min(3, rankedItems.length)} 项推荐
          </p>
          <div className="starter-results" data-quick-results>
            {rankedItems.map((item, index) => (
              <article
                className="starter-result"
                key={item.id}
                hidden={index >= 3}
                data-quick-result
                data-content-id={item.id}
                data-track={item.recommendationTrack}
                data-time-to-value={item.timeToValue}
                data-adoption-level={item.adoptionLevel}
                data-content-type={item.type}
                data-has-copy={String(item.copyBlocks.length > 0)}
                data-featured={String(item.featured)}
                data-sort-weight={item.sortWeight}
                data-updated-at={item.updatedAt}
              >
                <div className="starter-result__meta">
                  <span data-quick-rank>0{index + 1}</span>
                  <em>{item.recommendationTrack}</em>
                </div>
                <h3><a href={sitePath(`/content/${item.slug}`)}>{item.title}</a></h3>
                <p>{withoutTerminalFullStops(item.recommendationReason)}</p>
                <div className="starter-result__takeaway">
                  <span>可以带走</span>
                  <strong>{withoutTerminalFullStops(item.takeaway)}</strong>
                </div>
                <a className="starter-result__link" href={sitePath(`/content/${item.slug}`)}>查看实践</a>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PreferenceGroup<T extends string>({
  label,
  preferenceKey,
  options,
  value,
  onChange,
  categoryMeta,
}: {
  label: string;
  preferenceKey: keyof DiscoveryPreferences;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  categoryMeta?: Record<string, { href: string; count: number }>;
}) {
  return (
    <fieldset className="preference-group" data-preference-key={preferenceKey}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            data-preference-value={option}
            data-category-href={categoryMeta?.[option]?.href}
            data-category-count={categoryMeta?.[option]?.count}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
