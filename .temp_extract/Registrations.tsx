import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Users, DollarSign, Calendar, CheckCircle, History, ArrowLeft } from "lucide-react";

import { toast } from "sonner";

export default function Registrations() {
  const [, setLocation] = useLocation();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<number | null>(null);
  
  // Buscar eventos do organizador
  const { data: events = [] } = trpc.events.myEvents.useQuery();
  
  // Buscar inscritos do evento selecionado
  const { data: registrations = [], isLoading: loadingRegistrations } = trpc.registrations.listByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );
  
  const utils = trpc.useUtils();
  
  // Mutation para confirmar pagamento
  // const confirmPayment = trpc.payments.confirm.useMutation({
  //   onSuccess: async () => {
  //     toast.success("Pagamento confirmado com sucesso!");
  //     await utils.registrations.listByEvent.invalidate();
  //     await utils.registrations.getStatistics.invalidate();
  //   },
  //   onError: (error: any) => {
  //     toast.error(error.message || "Erro ao confirmar pagamento");
  //   },
  // });
  
  // Mutation para atualizar número e horário de largada
  const updateStartInfo = trpc.registrations.updateStartInfo.useMutation({
    onSuccess: async () => {
      await utils.registrations.listByEvent.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar informações de largada");
    },
  });
  
  // Buscar estatísticas do evento selecionado
  const { data: statistics } = trpc.registrations.getStatistics.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );
  
  // Buscar categorias do evento para exibir nomes
  const { data: categories = [] } = trpc.categories.listByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );
  
  // Buscar histórico da inscrição selecionada
  const { data: history = [] } = trpc.registrations.getHistory.useQuery(
    { registrationId: selectedRegistrationId! },
    { enabled: !!selectedRegistrationId && historyDialogOpen }
  );
  
  const getCategoryName = (categoryId: number) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "N/A";
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-600">Confirmado</Badge>;
      case "pending":
        return <Badge variant="outline">Pendente</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };
  
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
  
  // Mutation para exportar Excel
  const exportExcel = trpc.registrations.exportToExcel.useQuery(
    { eventId: selectedEventId! },
    { enabled: false } // Não executar automaticamente
  );
  
  const exportKraken = trpc.registrations.exportKraken.useQuery(
    { eventId: selectedEventId! },
    { enabled: false } // Não executar automaticamente
  );
  
  const exportEventListMutation = trpc.startOrder.exportEventList.useMutation();
  
  const handleExportExcel = async () => {
    if (!selectedEventId || registrations.length === 0) {
      toast.error("Selecione um evento com inscrições para exportar");
      return;
    }
    
    try {
      toast.info("Gerando arquivo Excel...");
      
      // Chamar endpoint do backend
      const result = await exportExcel.refetch();
      
      if (!result.data) {
        throw new Error("Erro ao gerar arquivo");
      }
      
      // Converter base64 para blob
      const byteCharacters = atob(result.data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.data.filename;
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }
      
      toast.success("Arquivo exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar arquivo");
    }
  };
  
  const handleExportKraken = async () => {
    if (!selectedEventId || registrations.length === 0) {
      toast.error("Selecione um evento com inscrições para exportar");
      return;
    }
    
    try {
      toast.info("Gerando arquivo Kraken...");
      
      // Chamar endpoint do backend
      const result = await exportKraken.refetch();
      
      if (!result.data) {
        throw new Error("Erro ao gerar arquivo");
      }
      
      // Converter base64 para blob
      const byteCharacters = atob(result.data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.data.filename;
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }
      
      toast.success("Arquivo Kraken exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar Kraken:", error);
      toast.error("Erro ao exportar arquivo Kraken");
    }
  };
  
  const handleExportEventList = async () => {
    if (!selectedEventId) {
      toast.error("Selecione um evento para exportar");
      return;
    }
    
    try {
      toast.info("Gerando Lista do Evento...");
      
      // Chamar endpoint do backend
      const result = await exportEventListMutation.mutateAsync({ eventId: selectedEventId! });
      
      if (!result) {
        throw new Error("Erro ao gerar arquivo");
      }
      
      // Converter base64 para blob
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }
      
      toast.success("Lista do Evento exportada com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar Lista do Evento:", error);
      toast.error("Erro ao exportar Lista do Evento");
    }
  };
  
  return (
    <div className="container mx-auto py-8 space-y-6">
      <Button
        variant="ghost"
        onClick={() => setLocation("/organizer")}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Inscritos</h1>
          <p className="text-muted-foreground">Gerencie as inscrições dos seus eventos</p>
        </div>
        {selectedEventId && (
          <div className="flex gap-2">
            <Button onClick={handleExportExcel} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
            <Button onClick={handleExportKraken} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Kraken
            </Button>
            <Button onClick={handleExportEventList} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Lista do Evento
            </Button>
          </div>
        )}
      </div>
      
      {/* Tela de Seleção de Evento */}
      {!selectedEventId ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selecione um Evento</CardTitle>
              <CardDescription>Escolha o evento para visualizar e gerenciar os inscritos</CardDescription>
            </CardHeader>
          </Card>
          
          {events.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Você ainda não criou nenhum evento da plataforma.</p>
                <p className="text-sm text-muted-foreground mt-2">Eventos externos (apenas calendário) não aparecem aqui.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event: any) => (
                <Card 
                  key={event.id} 
                  className="cursor-pointer hover:border-orange-500 transition-colors overflow-hidden"
                  onClick={() => setSelectedEventId(event.id)}
                >
                  {/* Imagem de capa do evento */}
                  {event.imageUrl ? (
                    <div className="w-full h-48 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
                      <img 
                        src={encodeURI(event.imageUrl)} 
                        alt={event.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                      <Calendar className="h-16 w-16 text-white opacity-50" />
                    </div>
                  )}
                  
                  <CardHeader>
                    <CardTitle className="text-lg">{event.name}</CardTitle>
                    <CardDescription>
                      {new Date(new Date(event.startDate).getTime() + 3 * 60 * 60 * 1000).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric"
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{event.city}, {event.state}</span>
                      </div>
                      {getStatusBadge(event.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Botão Voltar */}
          <Button 
            variant="outline" 
            onClick={() => setSelectedEventId(null)}
          >
            ← Voltar para Seleção de Eventos
          </Button>
      
      {/* Cards de Estatísticas */}
      {selectedEventId && statistics && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Inscritos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalRegistrations}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(statistics.totalRevenue)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categorias</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.byCategory.length}</div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Estatísticas por Categoria */}
      {selectedEventId && statistics && statistics.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estatísticas por Categoria</CardTitle>
            <CardDescription>Detalhamento de inscrições e vagas por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <Table className="min-w-full text-sm md:text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-2 sm:px-4">Categoria</TableHead>
                    <TableHead className="text-right px-2 sm:px-4">Confirmados</TableHead>
                    <TableHead className="text-right px-2 sm:px-4">Pendentes</TableHead>
                    <TableHead className="text-right px-2 sm:px-4">Total Vagas</TableHead>
                    <TableHead className="text-right px-2 sm:px-4">Disponíveis</TableHead>
                    <TableHead className="text-right px-2 sm:px-4">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statistics.byCategory.map((cat) => (
                    <TableRow key={cat.categoryId}>
                      <TableCell className="font-medium px-2 sm:px-4">{cat.categoryName}</TableCell>
                      <TableCell className="text-right px-2 sm:px-4">
                        <Badge className="bg-green-600">{cat.confirmedRegistrations}</Badge>
                      </TableCell>
                      <TableCell className="text-right px-2 sm:px-4">
                        <Badge variant="outline">{cat.pendingRegistrations}</Badge>
                      </TableCell>
                      <TableCell className="text-right px-2 sm:px-4">{cat.totalSlots || "Ilimitado"}</TableCell>
                      <TableCell className="text-right px-2 sm:px-4">
                        {cat.totalSlots ? cat.availableSlots : "∞"}
                      </TableCell>
                      <TableCell className="text-right font-medium px-2 sm:px-4">
                        {formatCurrency(cat.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Tabela de Inscritos */}
      {selectedEventId && (
        <Card>
          <CardHeader>
            <CardTitle>Lista de Inscritos</CardTitle>
            <CardDescription>
              {registrations.length} inscrição(ões) encontrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRegistrations ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : registrations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma inscrição encontrada para este evento.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
                <Table className="min-w-full text-xs sm:text-sm md:text-base">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-1 sm:px-2">Piloto</TableHead>
                      <TableHead className="px-1 sm:px-2">Idade</TableHead>
                      <TableHead className="px-1 sm:px-2">Email</TableHead>
                      <TableHead className="px-1 sm:px-2">Categoria</TableHead>
                      <TableHead className="px-1 sm:px-2">Veículo</TableHead>
                      <TableHead className="px-1 sm:px-2">Status</TableHead>
                      <TableHead className="px-1 sm:px-2">Check-in</TableHead>
                      <TableHead className="px-1 sm:px-2">Número</TableHead>
                      <TableHead className="px-1 sm:px-2">Horário</TableHead>
                      <TableHead className="px-1 sm:px-2">Data</TableHead>
                      <TableHead className="px-1 sm:px-2">Observações</TableHead>
                      <TableHead className="text-right px-1 sm:px-2">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((registration) => (
                      <TableRow key={registration.id}>
                        <TableCell className="font-medium px-1 sm:px-2">{registration.pilotName}</TableCell>
                        <TableCell className="px-1 sm:px-2">{(registration as any).pilotAge || '-'}</TableCell>
                        <TableCell className="px-1 sm:px-2">{registration.pilotEmail}</TableCell>
                        <TableCell className="px-1 sm:px-2">{getCategoryName(registration.categoryId)}</TableCell>
                        <TableCell className="px-1 sm:px-2">
                          {registration.vehicleBrand && registration.vehicleModel
                            ? `${registration.vehicleBrand} ${registration.vehicleModel}`
                            : "N/A"}
                        </TableCell>
                        <TableCell className="px-1 sm:px-2">{getStatusBadge(registration.status)}</TableCell>
                        <TableCell className="px-1 sm:px-2">
                          {(registration as any).checkedInAt ? (
                            <Badge className="bg-blue-600 flex items-center gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" />
                              {new Date((registration as any).checkedInAt).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Pendente</span>
                          )}
                        </TableCell>
                        <TableCell className="px-1 sm:px-2">
                          <input
                            type="number"
                            className="w-16 px-2 py-1 text-sm border rounded min-h-10 sm:min-h-8"
                            placeholder="Nº"
                            value={(registration as any).startNumber || ""}
                            onChange={(e) => {
                              const value = e.target.value ? parseInt(e.target.value) : undefined;
                              updateStartInfo.mutate({
                                registrationId: registration.id,
                                startNumber: value,
                                startTime: (registration as any).startTime,
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="px-1 sm:px-2">
                          <input
                            type="time"
                            className="w-24 px-2 py-1 text-sm border rounded min-h-10 sm:min-h-8"
                            value={(registration as any).startTime || ""}
                            onChange={(e) => {
                              updateStartInfo.mutate({
                                registrationId: registration.id,
                                startNumber: (registration as any).startNumber,
                                startTime: e.target.value || undefined,
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="px-1 sm:px-2">{formatDate(registration.createdAt)}</TableCell>
                        <TableCell className="px-1 sm:px-2">
                          {(registration as any).notes ? (
                            <div className="max-w-xs truncate" title={(registration as any).notes}>
                              {(registration as any).notes}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right px-1 sm:px-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-2"
                              onClick={() => {
                                setSelectedRegistrationId(registration.id);
                                setHistoryDialogOpen(true);
                              }}
                            >
                              <History className="h-4 w-4" />
                              Histórico
                            </Button>
                            {/* {registration.status === "pending" && registration.paymentId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => confirmPayment.mutate({ id: registration.paymentId! })}
                                disabled={confirmPayment.isPending}
                              >
                                <CheckCircle className="h-4 w-4" />
                                Confirmar Pagamento
                              </Button>
                            ) : */}
                            {registration.status === "paid" ? (
                              <Badge className="bg-green-600">Confirmado</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
        </div>
      )}
      
      {/* Dialog de Histórico */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Alterações</DialogTitle>
            <DialogDescription>
              Todas as alterações feitas nesta inscrição
            </DialogDescription>
          </DialogHeader>
          
          {history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma alteração registrada
            </p>
          ) : (
            <div className="space-y-4">
              {history.map((entry: any) => (
                <div key={entry.id} className="border-l-2 border-primary pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm">{entry.fieldName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.changedAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">
                      <span className="font-medium">De:</span> {entry.oldValue || "(vazio)"}
                    </p>
                    <p>
                      <span className="font-medium">Para:</span> {entry.newValue || "(vazio)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Alterado por: {entry.changedByName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
