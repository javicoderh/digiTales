"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { YAYOI_QUOTES } from "./yayoiQuotes";

type ExperimentalYayoiQuotesProps = {
  active: boolean;
};

type QuoteStyle = CSSProperties & {
  "--yayoi-quote-duration": string;
};

export default function ExperimentalYayoiQuotes({
  active,
}: ExperimentalYayoiQuotesProps) {
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const updateMotionPreference = () => {
      setReducedMotion(motionPreference.matches);
    };

    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      motionPreference.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setCurrentQuoteIndex(0);
      return;
    }

    if (reducedMotion) return;

    const currentQuote = YAYOI_QUOTES[currentQuoteIndex];
    const quoteTimer = window.setTimeout(() => {
      setCurrentQuoteIndex(
        (currentIndex) => (currentIndex + 1) % YAYOI_QUOTES.length,
      );
    }, currentQuote.durationMs);

    return () => {
      window.clearTimeout(quoteTimer);
    };
  }, [active, currentQuoteIndex, reducedMotion]);

  const currentQuote = YAYOI_QUOTES[currentQuoteIndex];
  const quoteStyle: QuoteStyle = {
    "--yayoi-quote-duration": `${currentQuote.durationMs}ms`,
  };

  return (
    <aside
      className={`experimental-yayoi-quotes${
        active ? " experimental-yayoi-quotes--active" : ""
      }`}
      aria-hidden={!active}
      aria-label="Citas de Yayoi Kusama"
    >
      <figure
        key={`${active ? "active" : "inactive"}-${currentQuoteIndex}`}
        className="experimental-yayoi-quotes__content"
        style={quoteStyle}
      >
        <span className="experimental-yayoi-quotes__accent" aria-hidden="true" />
        <p className="experimental-yayoi-quotes__japanese" lang="ja">
          {currentQuote.japanese}
        </p>
        <figcaption className="experimental-yayoi-quotes__spanish" lang="es">
          “{currentQuote.spanish}”
        </figcaption>
      </figure>
    </aside>
  );
}
