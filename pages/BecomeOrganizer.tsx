import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Clock, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function BecomeOrganizer() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    organizerName: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
  });

  const { data: myRequests, isLoading: loadingRequests, refetch } = trpc.organizerRequests.myRequests.useQuery();

  const createRequest = trpc.organizerRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Solicitação enviada com sucesso!");
      setFormData({
        organizerName: "",
        description: "",
        contactEmail: "",
        contactPhone: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao enviar solicitação");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.organizerName || !formData.contactEmail) {
      toast.error("Por favor, preencha os campos obrigatórios");
      return;
    }
    createRequest.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pendente
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Aprovado
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Rejeitado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container py-12 max-w-4xl">
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Button>
        <h1 className="text-4xl font-bold mb-2">Torne-se um Organizador</h1>
        <p className="text-muted-foreground text-lg">
          Crie e gerencie seus próprios eventos off-road na plataforma Amigo Racing.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Enviar Solicitação</CardTitle>
              <CardDescription>
                Preencha os dados abaixo para solicitar acesso de organizador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organizerName">Nome da Organização / Equipe *</Label>
                <Input
                  id="organizerName"
                  placeholder="Ex: Equipe Lama e Ação"
                  value={formData.organizerName}
                  onChange={(e) => setFormData({ ...formData, organizerName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">E-mail de Contato *</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  placeholder="contato@equipe.com.br"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Telefone de Contato</Label>
                <Input
                  id="contactPhone"
                  placeholder="(00) 00000-0000"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição das atividades / Experiência</Label>
                <Textarea
                  id="description"
                  placeholder="Conte-nos um pouco sobre sua experiência organizando eventos..."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={createRequest.isPending}
              >
                {createRequest.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Solicitação"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Minhas Solicitações</CardTitle>
              <CardDescription>
                Acompanhe o status das suas solicitações enviadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : myRequests && myRequests.length > 0 ? (
                <div className="space-y-4">
                  {myRequests.map((request) => (
                    <div
                      key={request.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold">{request.organizerName}</h4>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {request.description || "Sem descrição informada."}
                      </p>
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        Solicitado em: {format(new Date(request.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                      {request.rejectionReason && (
                        <div className="mt-2 text-sm bg-muted p-2 rounded">
                          <p className="font-medium text-xs mb-1">Nota do Administrador:</p>
                          <p>{request.rejectionReason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground">Nenhuma solicitação encontrada.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Por que ser organizador?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p>✓ Crie eventos públicos ou privados.</p>
              <p>✓ Gerencie inscrições e pagamentos de forma automatizada.</p>
              <p>✓ Gere ordens de largada e listas de competidores.</p>
              <p>✓ Acesso a ferramentas exclusivas de cronometragem e check-in.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}