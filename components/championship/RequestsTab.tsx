// Aba "Solicitações": organizadores locais pedindo para incluir o evento deles
// como etapa deste campeonato (o fluxo colaborativo de copa).
//
// Extraída da ChampionshipDetails sem mudança de comportamento — só a filtragem
// por campeonato, que era repetida em três lugares da página (inclusive no
// contador da aba), passou a acontecer uma vez só, na página.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Loader2, MapPin, Trophy, XCircle } from "lucide-react";

export interface PedidoDeEtapa {
  id: string;
  eventName: string;
  eventCity: string;
  eventDate: string | Date;
}

export interface RequestsTabProps {
  championshipId: number;
  /** Já filtrados para este campeonato pela página. */
  pedidos: PedidoDeEtapa[];
  isLoading: boolean;
}

export default function RequestsTab({ championshipId, pedidos, isLoading }: RequestsTabProps) {
  const utils = trpc.useUtils();

  const responderMutation = trpc.championships.respondToStageRequest.useMutation({
    onSuccess: () => {
      toast.success("Solicitação respondida!");
      utils.championships.getPendingStageRequests.invalidate();
      utils.championships.getStages.invalidate({ championshipId });
    },
    onError: erro => toast.error(erro.message || "Erro ao responder solicitação"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Solicitações de etapas (Collab)
        </CardTitle>
        <CardDescription>
          Organizadores locais que pediram para incluir seus eventos neste campeonato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
            <h3 className="text-lg font-medium text-muted-foreground mb-1">Pista limpa!</h3>
            <p className="text-sm text-muted-foreground">
              Não há solicitações de vínculo pendentes para este campeonato.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pedidos.map(pedido => (
              <Card key={pedido.id} className="border border-border/50 bg-card overflow-hidden">
                <div className="p-4">
                  <div className="flex gap-2 items-start mb-2">
                    <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-lg leading-tight">{pedido.eventName}</h4>
                      <p className="text-sm text-muted-foreground">{pedido.eventCity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <CalendarDays className="h-4 w-4" />
                    {new Date(pedido.eventDate).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="bg-muted/30 px-4 py-3 flex gap-2 justify-end border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => responderMutation.mutate({ requestId: pedido.id, status: "REJECTED" })}
                    disabled={responderMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Recusar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => responderMutation.mutate({ requestId: pedido.id, status: "APPROVED" })}
                    disabled={responderMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Aprovar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
