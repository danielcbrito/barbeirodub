import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const SUPPORT_WHATSAPP_URL =
  "https://wa.me/5511963390043?text=" +
  encodeURIComponent("Olá! Preciso de suporte com o aplicativo.");

/**
 * Global ErrorBoundary — 100% sério, minimalista e corporativo.
 * Exibe detalhes do erro para diagnóstico rápido em desenvolvimento/testes.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[AppErrorBoundary] Uncaught error:", error, info);
  }

  private handleReload = () => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  private handleSupport = () => {
    window.open(SUPPORT_WHATSAPP_URL, "_blank", "noopener,noreferrer");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          textAlign: "center",
          background: "var(--background, #09090b)",
          color: "var(--foreground, #f4f4f5)",
          fontFamily:
            "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 340, width: "100%", margin: "0 auto" }}>
          {/* Ícone sóbrio e sutil */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(128, 128, 128, 0.1)",
              border: "1px solid rgba(128, 128, 128, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px auto",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.85 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: "0 0 8px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Algo deu errado
          </h1>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              opacity: 0.65,
              margin: "0 0 24px 0",
            }}
          >
            Ocorreu uma instabilidade temporária. Você pode tentar recarregar a
            página ou entrar em contato com nosso suporte.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={this.handleReload}
              type="button"
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                border: "none",
                background: "var(--foreground, #ffffff)",
                color: "var(--background, #09090b)",
                fontWeight: 600,
                fontSize: 13.5,
                cursor: "pointer",
                transition: "opacity 0.15s ease",
              }}
            >
              Recarregar página
            </button>

            <button
              onClick={this.handleSupport}
              type="button"
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                border: "1px solid rgba(128, 128, 128, 0.25)",
                background: "transparent",
                color: "inherit",
                fontWeight: 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              Falar com o suporte
            </button>
          </div>

          {this.state.error && (
            <details
              style={{
                marginTop: 20,
                textAlign: "left",
                fontSize: 11,
                opacity: 0.85,
                cursor: "pointer",
              }}
            >
              <summary style={{ padding: "4px 0", color: "#f87171", fontWeight: 600 }}>
                Detalhes do erro
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#fca5a5",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 140,
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                {this.state.error.name}: {this.state.error.message}
                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
