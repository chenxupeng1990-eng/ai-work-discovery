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
  const recommendations = useMemo(
    () => recommendContent(items, preferences, 3),
    [items, preferences],
  );
  const categoryCount = items.filter(
    (item) => item.recommendationTrack === preferences.goal,
  ).length;
  const categoryHref = `/category/${slugForTrack(preferences.goal)}`;

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
              <a href={categoryHref}>
                查看「{preferences.goal}」全部 {categoryCount} 条
                <span aria-hidden="true">→</span>
              </a>
            </div>
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
                <a className="starter-result__link" href={`/content/${item.slug}`}>查看实践</a>
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
