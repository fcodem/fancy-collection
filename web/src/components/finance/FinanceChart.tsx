"use client";

import { useEffect, useRef, useState } from "react";
import type { Chart as ChartJs, ChartConfiguration } from "chart.js";

const CHART_COLORS = [
  "#7B1F45",
  "#C9A846",
  "#2E7D32",
  "#1565C0",
  "#E65100",
  "#6A1B9A",
  "#00838F",
  "#AD1457",
  "#4527A0",
  "#00695C",
];

type ChartType = "pie" | "bar" | "doughnut";

type ChartModule = typeof import("chart.js/auto");

let chartModulePromise: Promise<ChartModule> | null = null;

function loadChartModule(): Promise<ChartModule> {
  if (!chartModulePromise) {
    chartModulePromise = import("chart.js/auto");
  }
  return chartModulePromise;
}

function useChartCanvas({
  enabled,
  config,
}: {
  enabled: boolean;
  config: ChartConfiguration | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJs | null>(null);
  const [chartError, setChartError] = useState("");

  useEffect(() => {
    if (!enabled || !config) return;

    let cancelled = false;

    (async () => {
      try {
        const mod = await loadChartModule();
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        chartRef.current?.destroy();
        chartRef.current = new mod.Chart(canvas, config);
        if (!cancelled) setChartError("");
      } catch (e) {
        if (!cancelled) {
          setChartError(e instanceof Error ? e.message : "Chart failed to load");
        }
      }
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [enabled, config]);

  return { canvasRef, chartError };
}

export function FinanceChart({
  type = "pie",
  labels,
  values,
  title,
  height = 280,
  horizontal = false,
}: {
  type?: ChartType;
  labels: string[];
  values: number[];
  title?: string;
  height?: number;
  horizontal?: boolean;
}) {
  const config: ChartConfiguration | null =
    labels.length > 0
      ? {
          type,
          data: {
            labels,
            datasets: [
              {
                label: title || "Amount",
                data: values,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: type === "bar" ? 0 : 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: horizontal ? "y" : "x",
            plugins: {
              legend: {
                position: type === "bar" ? "top" : "bottom",
                labels: { boxWidth: 12, font: { size: 11 } },
              },
              title: title ? { display: true, text: title, font: { size: 13 } } : undefined,
            },
            scales:
              type === "bar"
                ? {
                    x: {
                      ticks: {
                        callback: (v) => `₹${Number(v).toLocaleString("en-IN")}`,
                      },
                    },
                    y: { ticks: { font: { size: 11 } } },
                  }
                : undefined,
          },
        }
      : null;

  const { canvasRef, chartError } = useChartCanvas({ enabled: labels.length > 0, config });

  if (!labels.length) return null;

  return (
    <div style={{ position: "relative", height }}>
      {chartError ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }} role="status">
          Chart unavailable: {chartError}
        </p>
      ) : (
        <canvas ref={canvasRef} aria-label={title || "Finance chart"} />
      )}
    </div>
  );
}

export function FinanceCompareChart({
  labels,
  revenue,
  purchases,
  title = "Revenue vs Stock Purchased",
}: {
  labels: string[];
  revenue: number[];
  purchases: number[];
  title?: string;
}) {
  const config: ChartConfiguration | null =
    labels.length > 0
      ? {
          type: "bar",
          data: {
            labels,
            datasets: [
              { label: "Revenue", data: revenue, backgroundColor: "#7B1F45" },
              { label: "Stock Purchased", data: purchases, backgroundColor: "#C9A846" },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "top" },
              title: { display: true, text: title, font: { size: 13 } },
            },
            scales: {
              y: {
                ticks: {
                  callback: (v) => `₹${Number(v).toLocaleString("en-IN")}`,
                },
              },
            },
          },
        }
      : null;

  const { canvasRef, chartError } = useChartCanvas({ enabled: labels.length > 0, config });

  if (!labels.length) return null;

  return (
    <div style={{ position: "relative", height: 320 }}>
      {chartError ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }} role="status">
          Chart unavailable: {chartError}
        </p>
      ) : (
        <canvas ref={canvasRef} aria-label={title} />
      )}
    </div>
  );
}
