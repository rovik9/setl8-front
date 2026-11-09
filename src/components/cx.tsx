import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";

/** Adds `cx-in` once the element scrolls into view (transform-only reveal, no opacity change). */
export function Reveal({
  as: Tag = "div",
  className = "",
  children,
  delay = 0,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`cx-reveal ${seen ? "cx-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/** Integer count-up (eased) that starts when scrolled into view; static under reduced motion. */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1100,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (reduce || !el || typeof IntersectionObserver === "undefined") {
      setValue(to);
      return;
    }
    let frame = 0;
    setValue(0);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, reduce, duration]);
  return (
    <span ref={ref} className="cx-count">
      <span className="cx-sr">{`${prefix}${to.toLocaleString("en-US")}${suffix}`}</span>
      <span aria-hidden="true">
        {prefix}
        {value.toLocaleString("en-US")}
        {suffix}
      </span>
    </span>
  );
}
