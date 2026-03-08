import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-3xl font-bold mb-2">Algo deu errado</h2>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Encontramos um erro inesperado. Não se preocupe, seus dados estão seguros.
            </p>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <summary className="cursor-pointer text-sm font-medium mb-2">
                  Detalhes técnicos (apenas em desenvolvimento)
                </summary>
                <pre className="text-xs text-muted-foreground whitespace-break-spaces mt-2">
                  {this.state.error?.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-4">
              <Button
                onClick={() => window.location.reload()}
                size="lg"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Recarregar Página
              </Button>
              <Button
                onClick={() => window.location.href = "/"}
                variant="outline"
                size="lg"
              >
                <Home className="mr-2 h-4 w-4" />
                Ir para Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
