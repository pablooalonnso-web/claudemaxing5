"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import styles from "@/styles/intelligence.module.css";

function parts(target: number, now: number) {
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return [
    ["days", days],
    ["hours", hours],
    ["minutes", minutes],
    ["seconds", seconds],
  ] as const;
}

export function Countdown({ target }: { target: string }) {
  const t = useT("intelligence");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const at = Date.parse(target);
  return (
    <div className={styles.countdown} role="timer" aria-label={t("countdown.aria")} aria-live="off">
      {parts(at, now ?? at).map(([unit, value]) => (
        <div className={styles.timeUnit} key={unit}>
          <span className={styles.digit}>{now === null ? "–" : String(value).padStart(2, "0")}</span>
          <span className={styles.unit}>{t(`countdown.${unit}`)}</span>
        </div>
      ))}
    </div>
  );
}
