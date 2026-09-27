"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import DashboardRetryButton from "@/components/DashboardRetryButton";

export default class DashboardSectionBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The server logs the section error. Avoid rendering sensitive error text.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="card mb-24">
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{this.props.title}</strong>
              <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>
                This section could not load just now. Other dashboard sections remain usable.
              </p>
            </div>
            <DashboardRetryButton onRetry={() => this.setState({ failed: false })} />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
