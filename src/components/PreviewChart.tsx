import { demoCandles } from "../data/demo";
export default function PreviewChart({
  market = "0",
  equity = false,
}: {
  market?: string;
  equity?: boolean;
}) {
  const candles = market === "0" ? demoCandles(market) : [];
  if (!candles.length)
    return (
      <p role="status">
        Chart unavailable. ETH/SOL require actual recorded history.
      </p>
    );
  const low = Math.min(...candles.map((c) => c.low)),
    high = Math.max(...candles.map((c) => c.high));
  const y = (value: number) => 210 - ((value - low) / (high - low)) * 180;
  return (
    <svg
      className="preview-chart"
      viewBox="0 0 760 245"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        equity
          ? "Illustrative demo balance path. Not account history."
          : "Deterministic demo candlestick chart. Not recorded market data."
      }
    >
      <defs>
        <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#007BA7" stopOpacity=".26" />
          <stop offset="1" stopColor="#007BA7" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 85, 130, 175, 220].map((v) => (
        <line
          key={v}
          x1="0"
          x2="760"
          y1={v}
          y2={v}
          stroke="#24252b"
          strokeWidth=".6"
        />
      ))}
      {[0, 150, 300, 450, 600, 750].map((v) => (
        <line
          key={v}
          x1={v}
          x2={v}
          y1="0"
          y2="245"
          stroke="#24252b"
          strokeWidth=".6"
        />
      ))}
      {equity ? (
        <>
          <path
            d={
              "M0 245 " +
              candles.map((c, i) => `L${i * 8} ${y(c.close)}`).join(" ") +
              " L760 245 Z"
            }
            fill="url(#preview-fill)"
          />
          <path
            d={candles
              .map((c, i) => `${i ? "L" : "M"}${i * 8} ${y(c.close)}`)
              .join(" ")}
            stroke="#37b4d9"
            fill="none"
            strokeWidth="2"
          />
        </>
      ) : (
        candles.map((c, i) => (
          <g
            key={i}
            fill={c.close >= c.open ? "#32a9cb" : "#ed4a93"}
            stroke={c.close >= c.open ? "#32a9cb" : "#ed4a93"}
          >
            <line
              x1={i * 7.8 + 5}
              x2={i * 7.8 + 5}
              y1={y(c.high)}
              y2={y(c.low)}
              strokeWidth="1"
            />
            <rect
              x={i * 7.8 + 2.5}
              y={y(Math.max(c.open, c.close))}
              width="5"
              height={Math.max(1.3, Math.abs(y(c.open) - y(c.close)))}
              strokeWidth="0"
            />
          </g>
        ))
      )}
    </svg>
  );
}
