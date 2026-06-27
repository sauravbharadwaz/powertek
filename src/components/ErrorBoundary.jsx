import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Viewer error:", error, info);
  }
  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#070b11] p-6 text-center">
          <span className="font-mono text-sm text-rose-300">3D viewer hit an error</span>
          <span className="max-w-md font-mono text-[11px] text-muted-foreground">{String(this.state.error?.message || this.state.error)}</span>
          <button onClick={this.reset} className="rounded-md border border-border/60 px-3 py-1.5 font-mono text-[11px] text-foreground hover:bg-muted/50">
            Reset viewer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
