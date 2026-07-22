import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import type { ContentItem } from "../lib/schema";
import { sitePath } from "../lib/site-path";

interface HeroCarouselProps {
  items: ContentItem[];
}

type PauseReason = "focus" | "hidden" | "hover";

function useReducedMotionPreference() {
  const [motionAllowed, setMotionAllowed] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;

    const updatePreference = () => setMotionAllowed(!mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return motionAllowed;
}

export function HeroCarousel({ items }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplayRevision, setAutoplayRevision] = useState(0);
  const [paused, setPaused] = useState(false);
  const motionAllowed = useReducedMotionPreference();
  const pauseReasons = useRef<Record<PauseReason, boolean>>({
    focus: false,
    hidden: false,
    hover: false,
  });

  const setPauseReason = useCallback((reason: PauseReason, value: boolean) => {
    pauseReasons.current[reason] = value;
    setPaused(Object.values(pauseReasons.current).some(Boolean));
  }, []);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + items.length) % items.length);
    setAutoplayRevision((current) => current + 1);
  }, [items.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % items.length);
    setAutoplayRevision((current) => current + 1);
  }, [items.length]);

  const showItem = useCallback((index: number) => {
    setActiveIndex(index);
    setAutoplayRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!motionAllowed || paused || items.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [autoplayRevision, items.length, motionAllowed, paused]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPauseReason("hidden", document.visibilityState === "hidden");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [setPauseReason]);

  if (items.length === 0) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevious();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNext();
    }
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setPauseReason("focus", false);
    }
  };

  return (
    <section
      className="hero-carousel"
      data-home-section="spotlight"
      data-hero-carousel
      role="region"
      aria-roledescription="carousel"
      aria-label="精选内容"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPauseReason("hover", true)}
      onMouseLeave={() => setPauseReason("hover", false)}
      onFocus={() => setPauseReason("focus", true)}
      onBlur={handleBlur}
    >
      <div className="hero-carousel__slides">
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <article
              className={`hero-carousel__slide${isActive ? " is-active" : ""}`}
              key={item.id}
              data-hero-slide
              data-slide-index={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${items.length}`}
              aria-hidden={isActive ? undefined : true}
              inert={!isActive}
            >
              <img
                className="hero-carousel__cover"
                src={sitePath(item.coverImage)}
                alt=""
                width="1536"
                height="960"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                data-home-content-image={index === 0 ? true : undefined}
              />
              <div className="hero-carousel__overlay" aria-hidden="true" />
              <div className="hero-carousel__content container">
                <div className="hero-carousel__brand">
                  <img src={sitePath("/images/brand/qifei-logo-white.png")} alt="" width="40" height="40" />
                  <span>QIFEI AI Work Discovery</span>
                </div>
                <p className="hero-carousel__meta">
                  <span>{item.category}</span>
                  <span>{item.recommendationTrack}</span>
                  <span>{item.timeToValue}</span>
                </p>
                <h1>{item.title}</h1>
                <p className="hero-carousel__reason">{item.recommendationReason}</p>
                <a className="hero-carousel__cta" href={sitePath(`/content/${item.slug}`)} data-home-content-link>
                  查看内容
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {items.length > 1 && (
        <div className="hero-carousel__controls container">
          <div className="hero-carousel__arrows">
            <button type="button" data-hero-previous onClick={showPrevious} aria-label="上一项精选">
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" data-hero-next onClick={showNext} aria-label="下一项精选">
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="hero-carousel__dots" role="group" aria-label="选择精选内容">
            {items.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === activeIndex ? "is-active" : ""}
                data-hero-dot
                data-slide-index={index}
                aria-label={`转到第 ${index + 1} 项：${item.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => showItem(index)}
              />
            ))}
          </div>
        </div>
      )}

      <p
        className="visually-hidden"
        data-hero-status
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        第 {activeIndex + 1} 项，共 {items.length} 项
      </p>

      <style>{`
        .hero-carousel {
          position: relative;
          height: clamp(500px, 62vh, 620px);
          overflow: hidden;
          color: var(--color-pure-white);
          background: var(--color-apple-ink);
        }

        .hero-carousel__slides,
        .hero-carousel__slide,
        .hero-carousel__cover,
        .hero-carousel__overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .hero-carousel__slide {
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--motion-enter) var(--motion-apple);
        }

        .hero-carousel__slide.is-active {
          z-index: 1;
          opacity: 1;
          pointer-events: auto;
        }

        .hero-carousel__cover {
          object-fit: cover;
          object-position: center;
        }

        .hero-carousel__overlay {
          background: linear-gradient(90deg, rgba(0, 0, 0, 0.86) 0%, rgba(0, 0, 0, 0.62) 46%, rgba(0, 0, 0, 0.14) 100%);
        }

        .hero-carousel__content {
          position: relative;
          z-index: 1;
          height: 100%;
          padding-block: 42px 94px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: flex-start;
        }

        .hero-carousel__brand {
          margin-bottom: auto;
          display: flex;
          align-items: center;
          gap: var(--spacing-12);
          font-size: var(--text-body-sm);
          font-weight: var(--font-weight-semibold);
        }

        .hero-carousel__brand img {
          width: 40px;
          height: 40px;
          object-fit: contain;
        }

        .hero-carousel__meta {
          margin-bottom: var(--spacing-16);
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-8) var(--spacing-16);
          font-size: 14px;
        }

        .hero-carousel__meta span + span::before {
          margin-right: var(--spacing-16);
          content: "·";
          color: rgba(255, 255, 255, 0.58);
        }

        .hero-carousel h1 {
          max-width: 900px;
          margin-bottom: var(--spacing-16);
          font-size: var(--text-heading-lg);
          line-height: var(--leading-heading);
          text-wrap: balance;
        }

        .hero-carousel__reason {
          max-width: 720px;
          margin-bottom: var(--spacing-24);
          color: rgba(255, 255, 255, 0.84);
          font-size: var(--text-body-sm);
        }

        .hero-carousel__cta {
          min-height: 44px;
          padding-inline: var(--spacing-20);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-button);
          color: var(--color-apple-ink);
          background: var(--color-pure-white);
          font-size: 15px;
        }

        .hero-carousel__cta:hover {
          background: var(--color-fog-canvas);
        }

        .hero-carousel__controls {
          position: absolute;
          z-index: 2;
          right: 0;
          bottom: var(--spacing-32);
          left: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          pointer-events: none;
        }

        .hero-carousel__arrows,
        .hero-carousel__dots {
          display: flex;
          align-items: center;
          pointer-events: auto;
        }

        .hero-carousel__arrows {
          gap: var(--spacing-8);
          margin-left: auto;
          order: 2;
        }

        .hero-carousel__arrows button {
          width: 44px;
          height: 44px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.36);
          border-radius: 50%;
          color: var(--color-pure-white);
          background: rgba(0, 0, 0, 0.34);
          cursor: pointer;
        }

        .hero-carousel__arrows button:hover {
          background: rgba(0, 0, 0, 0.58);
        }

        .hero-carousel__arrows span {
          font-size: 22px;
          line-height: 1;
        }

        .hero-carousel__dots {
          gap: 0;
        }

        .hero-carousel__dots button {
          width: 44px;
          height: 44px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: transparent;
          cursor: pointer;
        }

        .hero-carousel__dots button::before {
          width: 10px;
          height: 10px;
          border: 1px solid rgba(255, 255, 255, 0.74);
          border-radius: 50%;
          content: "";
        }

        .hero-carousel__dots button.is-active::before {
          background: var(--color-pure-white);
        }

        @media (max-width: 960px) {
          .hero-carousel h1 {
            font-size: var(--text-heading);
          }
        }

        @media (max-width: 720px) {
          .hero-carousel {
            height: clamp(500px, 62vh, 540px);
          }

          .hero-carousel__overlay {
            background: linear-gradient(0deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.5) 68%, rgba(0, 0, 0, 0.22) 100%);
          }

          .hero-carousel__content {
            padding-block: var(--spacing-28) 100px;
          }

          .hero-carousel__brand {
            font-size: 14px;
          }

          .hero-carousel__brand img {
            width: 32px;
            height: 32px;
          }

          .hero-carousel h1 {
            font-size: 34px;
          }

          .hero-carousel__reason {
            display: -webkit-box;
            overflow: hidden;
            font-size: 15px;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .hero-carousel__controls {
            bottom: var(--spacing-24);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-carousel__slide {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
