import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global ErrorBoundary — evita tela branca quando qualquer componente
 * lança um erro de render. Mostra uma tela mínima com botão "Recarregar".
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
      // Limpa caches leves para evitar loop de erro por estado corrompido
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    window.location.reload();
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
          padding: "24px",
          textAlign: "center",
          background: "var(--background, #ffffff)",
          color: "var(--foreground, #0d0d0d)",
          fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, marginBottom: 8 }}>
          Algo deu errado
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, margin: 0, marginBottom: 20, maxWidth: 320 }}>
          O aplicativo encontrou um erro inesperado. Recarregue para tentar novamente.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            background: "#E11D48",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "12px 22px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Recarregar app
        </button>
      </div>
    );
  }
}
