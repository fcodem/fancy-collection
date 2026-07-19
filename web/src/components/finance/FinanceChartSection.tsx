"use client";

import { Component, ReactNode } from "react";

type BoundaryState = { error: Error | null };

/** Isolates chart render failures from the rest of a finance report. */
export class FinanceChartSection extends Component<
  { children: ReactNode; title?: string },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="alert alert-warning"
          style={{ margin: "16px 0", fontSize: 13 }}
          role="status"
        >
          {this.props.title ? `${this.props.title}: ` : ""}
          Chart could not be displayed. The rest of this report is still available.
        </div>
      );
    }
    return this.props.children;
  }
}
