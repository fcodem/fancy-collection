"use client";

import { useEffect, useId, useState } from "react";
import Script from "next/script";

const CHART_COLORS = ["#7B1F45", "#C9A846", "#2E7D32", "#1565C0", "#E65100", "#6A1B9A", "#00838F", "#AD1457", "#4527A0", "#00695C"];

type ChartType = "pie" | "bar" | "doughnut";

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
  const id = useId().replace(/:/g, "");
  const canvasId = `chart-${id}`;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !labels.length) return;
    const Chart = (window as unknown as { Chart?: { new(el: HTMLCanvasElement, cfg: object): { destroy(): void } } }).Chart;
    if (!Chart) return;
    const el = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!el) return;

    const chart = new Chart(el, {
      type,
      data: {
        labels,
        datasets: [{
          label: title || "Amount",
          data: values,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderWidth: type === "bar" ? 0 : 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: {
          legend: { position: type === "bar" ? "top" : "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          title: title ? { display: true, text: title, font: { size: 13 } } : undefined,
        },
        scales: type === "bar" ? {
          x: { ticks: { callback: (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}` } },
          y: { ticks: { font: { size: 11 } } },
        } : undefined,
      },
    });
    return () => chart.destroy();
  }, [ready, labels, values, type, canvasId, title, horizontal]);

  if (!labels.length) return null;

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div style={{ position: "relative", height }}>
        <canvas id={canvasId} />
      </div>
    </>
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
  const id = useId().replace(/:/g, "");
  const canvasId = `compare-${id}`;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !labels.length) return;
    const Chart = (window as unknown as { Chart?: { new(el: HTMLCanvasElement, cfg: object): { destroy(): void } } }).Chart;
    if (!Chart) return;
    const el = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!el) return;

    const chart = new Chart(el, {
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
        plugins: { legend: { position: "top" }, title: { display: true, text: title, font: { size: 13 } } },
        scales: {
          y: { ticks: { callback: (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}` } },
        },
      },
    });
    return () => chart.destroy();
  }, [ready, labels, revenue, purchases, canvasId, title]);

  if (!labels.length) return null;

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div style={{ position: "relative", height: 320 }}>
        <canvas id={canvasId} />
      </div>
    </>
  );
}
