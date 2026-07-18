"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

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
          <div className="card-body">
            <strong>{this.props.title}</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>
              This section is temporarily unavailable. Other dashboard sections remain usable.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
