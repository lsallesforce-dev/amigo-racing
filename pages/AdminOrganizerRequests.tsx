import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Clock, UserCheck, UserX, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";

export default function AdminOrganizerRequests() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: requests, isLoading, refetch } = trpc.organizerRequests.list.useQuery(undefined, {
    enabled: user?.role === 'admin'
  });
  
  const approveRequest = trpc.organizerRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Solicitação aprovada com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao aprovar solicitação");
    },
  });

  const rejectRequest = trpc.organizerRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Solicitação rejeitada");
      setShowRejectDialog(false);
      setSelectedRequest(null);
      setRejectionReason("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao rejeitar solicitação");
    },
  });

  // Verificar se usuário é admin
  if (user && user.role !== "admin") {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleApprove = (request: any) => {
    approveRequest.mutate({ requestId: request.id });
  };

  const handleRejectClick = (request: any) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = () => {
    if (selectedRequest) {
      rejectRequest.mutate({
        requestId: selectedRequest.id,
        reason: rejectionReason || "",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full text-sm">
            <Clock className="h-4 w-4" />
            <span>Pendente</span>
          </div>
        );
      case "approved":
        return (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm">
            <CheckCircle className="h-4 w-4" />
            <span>Aprovada</span>
          </div>
        );
      case "rejected":
        return (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm">
            <XCircle className="h-4 w-4" />
            <span>Rejeitada</span>
          </div>
        );
      default:
        return null;
    }
  };

  const pendingRequests = requests?.filter((r: any) => r.status === "pending") || [];
  const processedRequests = requests?.filter((r: any) => r.status !== "pending") || [];

  return (
    <div className="container py-8 max-w-6xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => setLocation("/dashboard")}>
          ← Voltar ao Painel do Competidor
        </Button>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Gerenciar Solicitações de Organizador</h1>
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1 px-3 py-1">
                <Bell className="h-4 w-4" />
                {pendingRequests.length}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            Aprove ou rejeite solicitações de usuários que desejam se tornar organizadores
          </p>
        </div>

        {/* Solicitações Pendentes */}
        <Card>
          <CardHeader>
            <CardTitle>Solicitações Pendentes ({pendingRequests.length})</CardTitle>
            <CardDescription>Aguardando sua análise</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma solicitação pendente no momento
              </p>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request: any) => (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{request.organizerName}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Email:</span>
                        <p className="font-medium">{request.contactEmail}</p>
                      </div>
                      {request.contactPhone && (
                        <div>
                          <span className="text-muted-foreground">Telefone:</span>
                          <p className="font-medium">{request.contactPhone}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Enviada em:</span>
                        <p className="font-medium">
                          {new Date(request.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(request)}
                        disabled={approveRequest.isPending}
                        className="flex-1"
                      >
                        {approveRequest.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Aprovando...
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-2 h-4 w-4" />
                            Aprovar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleRejectClick(request)}
                        disabled={rejectRequest.isPending}
                        className="flex-1"
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Solicitações Processadas */}
        {processedRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Histórico ({processedRequests.length})</CardTitle>
              <CardDescription>Solicitações já processadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {processedRequests.map((request: any) => (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold">{request.organizerName}</h3>
                        <p className="text-sm text-muted-foreground">{request.description}</p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      Processada em: {new Date(request.reviewedAt).toLocaleDateString("pt-BR")}
                    </div>
                    
                    {request.status === "rejected" && request.rejectionReason && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                        <strong>Motivo:</strong> {request.rejectionReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Rejeição */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição (opcional). O usuário poderá ver esta mensagem.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Motivo da Rejeição</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Documentação incompleta, falta de experiência comprovada..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectRequest.isPending}
            >
              {rejectRequest.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejeitando...
                </>
              ) : (
                "Confirmar Rejeição"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
