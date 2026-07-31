/**
 * Renders a small dependency-free SVG line chart for usage history data.
 */
import { Box, Stack, Typography } from "@mui/material";

export type UsageHistoryChartPoint = {
  observedAt: string;
  value: number;
};

export type UsageHistoryChartSeries = {
  id: string;
  label: string;
  color: string;
  points: UsageHistoryChartPoint[];
};

type UsageHistoryChartProps = {
  series: UsageHistoryChartSeries[];
  emptyLabel: string;
  valueFormatter: (value: number) => string;
  dateFormatter: (value: string) => string;
  ariaLabel: string;
  minValue?: number;
  maxValue?: number;
};

const VIEWBOX_WIDTH = 900;
const VIEWBOX_HEIGHT = 280;
const MARGIN = { top: 18, right: 22, bottom: 42, left: 58 };
const MAX_RENDERED_POINTS = 500;

/**
 * Renders one or more time series with shared axes.
 *
 * @param props Chart series and formatting callbacks.
 * @returns SVG chart, or an empty-state message.
 */
export function UsageHistoryChart({
  series,
  emptyLabel,
  valueFormatter,
  dateFormatter,
  ariaLabel,
  minValue = 0,
  maxValue
}: UsageHistoryChartProps) {
  const renderedSeries = series
    .map((entry) => ({ ...entry, points: samplePoints(entry.points) }))
    .filter((entry) => entry.points.length > 0);
  const timestamps = renderedSeries.flatMap((entry) => entry.points.map((point) => Date.parse(point.observedAt)));
  const values = renderedSeries.flatMap((entry) => entry.points.map((point) => point.value));

  if (renderedSeries.length === 0 || timestamps.length === 0) {
    return (
      <Box sx={{ alignItems: "center", display: "flex", minHeight: 220, justifyContent: "center" }}>
        <Typography color="text.secondary">{emptyLabel}</Typography>
      </Box>
    );
  }

  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const timestampRange = maxTimestamp === minTimestamp ? 1 : maxTimestamp - minTimestamp;
  const effectiveMaxValue = resolveMaxValue(values, minValue, maxValue);
  const valueRange = effectiveMaxValue === minValue ? 1 : effectiveMaxValue - minValue;
  const plotWidth = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;

  function readX(timestamp: number): number {
    return MARGIN.left + ((timestamp - minTimestamp) / timestampRange) * plotWidth;
  }

  function readY(value: number): number {
    const clampedValue = Math.min(effectiveMaxValue, Math.max(minValue, value));
    return MARGIN.top + plotHeight - ((clampedValue - minValue) / valueRange) * plotHeight;
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = effectiveMaxValue - (effectiveMaxValue - minValue) * ratio;
    return {
      value,
      y: MARGIN.top + plotHeight * ratio
    };
  });
  const dateTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const timestamp = minTimestamp + timestampRange * ratio;
    return {
      label: dateFormatter(new Date(timestamp).toISOString()),
      x: MARGIN.left + plotWidth * ratio
    };
  });

  return (
    <Box sx={{ overflow: "hidden", width: "100%" }}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width="100%"
        height="280"
        role="img"
        aria-label={ariaLabel}
      >
        {gridLines.map((line) => (
          <g key={`grid-${line.y}`}>
            <line
              x1={MARGIN.left}
              x2={VIEWBOX_WIDTH - MARGIN.right}
              y1={line.y}
              y2={line.y}
              stroke="currentColor"
              strokeOpacity="0.12"
            />
            <text
              x={MARGIN.left - 10}
              y={line.y + 4}
              textAnchor="end"
              fill="currentColor"
              opacity="0.65"
              fontSize="12"
            >
              {valueFormatter(line.value)}
            </text>
          </g>
        ))}
        <line
          x1={MARGIN.left}
          x2={VIEWBOX_WIDTH - MARGIN.right}
          y1={MARGIN.top + plotHeight}
          y2={MARGIN.top + plotHeight}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        {dateTicks.map((tick) => (
          <text
            key={`date-${tick.x}`}
            x={tick.x}
            y={VIEWBOX_HEIGHT - 14}
            textAnchor="middle"
            fill="currentColor"
            opacity="0.65"
            fontSize="12"
          >
            {tick.label}
          </text>
        ))}
        {renderedSeries.map((entry) => {
          const points = entry.points
            .map((point) => `${readX(Date.parse(point.observedAt))},${readY(point.value)}`)
            .join(" ");

          return (
            <g key={entry.id}>
              <polyline
                points={points}
                fill="none"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {entry.points.length <= 80 ? entry.points.map((point) => (
                <circle
                  key={`${entry.id}-${point.observedAt}`}
                  cx={readX(Date.parse(point.observedAt))}
                  cy={readY(point.value)}
                  r="3"
                  fill={entry.color}
                >
                  <title>{`${entry.label} · ${dateFormatter(point.observedAt)} · ${valueFormatter(point.value)}`}</title>
                </circle>
              )) : null}
            </g>
          );
        })}
      </svg>
      <Stack
        direction="row"
        spacing={2}
        sx={{ flexWrap: "wrap", justifyContent: "center", px: 1, rowGap: 0.5 }}
      >
        {renderedSeries.map((entry) => (
          <Stack key={`legend-${entry.id}`} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Box sx={{ bgcolor: entry.color, borderRadius: "50%", height: 9, width: 9 }} />
            <Typography variant="caption" color="text.secondary">{entry.label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Limits SVG work while preserving the beginning and end of a long series.
 *
 * @param points Original chart points.
 * @returns Points suitable for rendering.
 */
function samplePoints(points: UsageHistoryChartPoint[]): UsageHistoryChartPoint[] {
  if (points.length <= MAX_RENDERED_POINTS) {
    return points;
  }

  const step = (points.length - 1) / (MAX_RENDERED_POINTS - 1);
  return Array.from({ length: MAX_RENDERED_POINTS }, (_, index) => {
    return points[Math.round(index * step)] as UsageHistoryChartPoint;
  });
}

/**
 * Chooses a readable upper bound for the chart axis.
 *
 * @param values Values present in all series.
 * @param minValue Lower axis bound.
 * @param requestedMaxValue Optional fixed upper bound.
 * @returns Upper axis bound.
 */
function resolveMaxValue(
  values: number[],
  minValue: number,
  requestedMaxValue: number | undefined
): number {
  if (requestedMaxValue !== undefined) {
    return requestedMaxValue;
  }

  const largestValue = Math.max(...values, minValue);

  if (largestValue === minValue) {
    return minValue + 1;
  }

  return largestValue * 1.1;
}
