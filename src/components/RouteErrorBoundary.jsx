import { Component } from "react";

function safeErrorText(error) {
  try {
    if (typeof error === "string") {
      return error;
    }

    if (
      typeof error === "number" ||
      typeof error === "boolean" ||
      typeof error === "bigint"
    ) {
      return String(error);
    }

    if (error == null) {
      return "An unknown rendering error occurred.";
    }

    if (typeof error === "object") {
      let message;

      try {
        message = error.message;
      } catch {
        message = null;
      }

      if (typeof message === "string" && message.trim()) {
        return message;
      }

      try {
        const json = JSON.stringify(error);

        if (typeof json === "string" && json !== "{}") {
          return json;
        }
      } catch {
        // Some thrown objects cannot be serialized.
      }

      return "A component threw an error object without a readable message.";
    }

    return "A component encountered an unexpected rendering error.";
  } catch {
    return "An error occurred while displaying the original error.";
  }
}

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      message: "",
      componentStack: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: safeErrorText(error),
    };
  }

  componentDidCatch(error, info) {
    // Log only safe text, not an arbitrary thrown object.
    try {
      console.error(
        "[Khaavio] Component rendering failed:",
        safeErrorText(error),
      );
    } catch {
      // Keep the fallback visible even if logging fails.
    }

    this.setState({
      componentStack:
        typeof info?.componentStack === "string" ? info.componentStack : "",
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main style={styles.container}>
        <h1 style={styles.heading}>This page encountered an error</h1>

        <p style={styles.errorMessage}>
          {this.state.message || "An unknown rendering error occurred."}
        </p>

        {this.state.componentStack && (
          <details style={styles.details}>
            <summary>Component details</summary>
            <pre style={styles.stack}>{this.state.componentStack}</pre>
          </details>
        )}

        <button
          type="button"
          style={styles.button}
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </main>
    );
  }
}

const styles = {
  container: {
    minHeight: "100vh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    padding: "24px",
    background: "#f7f7ef",
    color: "#163d32",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  heading: {
    maxWidth: "500px",
    margin: 0,
    fontSize: "23px",
    textAlign: "center",
  },
  errorMessage: {
    maxWidth: "650px",
    color: "#963f32",
    fontSize: "14px",
    lineHeight: 1.7,
    textAlign: "center",
    overflowWrap: "anywhere",
  },
  details: {
    width: "100%",
    maxWidth: "750px",
    fontSize: "12px",
  },
  stack: {
    boxSizing: "border-box",
    width: "100%",
    padding: "14px",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    background: "#fffefa",
    border: "1px solid #e2e5db",
    borderRadius: "10px",
    fontSize: "11px",
  },
  button: {
    padding: "11px 18px",
    color: "#fffefa",
    background: "#07513b",
    border: 0,
    borderRadius: "999px",
    cursor: "pointer",
  },
};
