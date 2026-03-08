import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Users, DollarSign, Calendar, CheckCircle, History, ArrowLeft, Trash2 } from "lucide-react";

import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Navbar from "@/components/Navbar";


const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
  if (!baseTime) return "08:00";
  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
  const newHours = Math.floor(totalSeconds / 3600) % 24;
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

export default function Registrations() {
  const [, setLocation] = useLocation();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<number | null>(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [registrationToDelete, setRegistrationToDelete] = useState<any>(null);

  // Buscar eventos do organizador
  const { data: events = [] } = trpc.events.myEvents.useQuery();

  // Buscar inscritos do evento selecionado
  const { data: registrations = [], isLoading: loadingRegistrations } = trpc.registrations.listByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Buscar configurações de largada para numeração e horários
  const { data: startConfigs = [] } = trpc.startOrder.getByEvent.useQuery(
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

  // Mutation para excluir inscrição
  const deleteRegistration = trpc.registrations.delete.useMutation({
    onSuccess: async () => {
      toast.success("Inscrição excluída com sucesso!");
      setDeleteConfirmDialogOpen(false);
      setRegistrationToDelete(null);
      await utils.registrations.listByEvent.invalidate();
      await utils.registrations.getStatistics.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir inscrição");
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

  // Mapeamento de registrationId -> { number, time } baseado na configuração de largada
  const startOrderMap = useMemo(() => {
    const map = new Map<number, { number: number; time: string }>();
    if (!startConfigs || !registrations || !categories) return map;

    // Subcategorias (que são as que possuem pilotos)
    const subcats = categories.filter(cat => !!cat.parentId);

    // Ordenar subcategorias pela posição na configuração
    const sortedSubcats = [...subcats].sort((a, b) => {
      const configA = startConfigs.find(c => c.categoryId === a.id);
      const configB = startConfigs.find(c => c.categoryId === b.id);
      return (configA?.orderPosition || 0) - (configB?.orderPosition || 0);
    });

    sortedSubcats.forEach(category => {
      const config = startConfigs.find(c => c.categoryId === category.id);
      if (!config) return;

      const categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');

      // Ordem customizada se houver
      if (config.registrationOrder) {
        try {
          const order = typeof config.registrationOrder === 'string'
            ? JSON.parse(config.registrationOrder)
            : config.registrationOrder;
          if (Array.isArray(order) && order.length > 0) {
            const orderMap = new Map(order.map((id, idx) => [id, idx]));
            categoryRegs.sort((a, b) => ((orderMap.get(a.id) ?? 999) as number) - ((orderMap.get(b.id) ?? 999) as number));
          }
        } catch (e) { }
      }

      categoryRegs.forEach((reg, index) => {
        map.set(reg.id, {
          number: config.numberStart + index,
          time: calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds)
        });
      });
    });
    return map;
  }, [startConfigs, registrations, categories]);

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





  const handleExportEventList = async () => {
    if (!selectedEventId || !events || registrations.length === 0) {
      toast.error("Selecione um evento com inscrições para exportar");
      return;
    }

    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;

    try {
      toast.info("Gerando PDF da Lista de Evento...");

      // Carregar a logo oficial dinamicamente
      let amigoLogoBase64 = "";
      try {
        const response = await fetch('/logo-light.png');
        const blob = await response.blob();
        amigoLogoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("Não foi possível carregar a logo oficial", e);
      }

      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Função simplificada de header (baseada no StartOrderManager)
      const generateHeader = (title: string, subtitle: string) => {
        // Logo oficial se carregada
        if (amigoLogoBase64) {
          doc.addImage(amigoLogoBase64, 'PNG', pageWidth - 44, 10, 30, 0);
        }

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(title, pageWidth / 2, 28, { align: "center" });

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(subtitle, pageWidth / 2, 36, { align: "center" });

        doc.setDrawColor(229, 231, 235);
        doc.line(14, 50, pageWidth - 14, 50);
      };

      generateHeader(event.name, "Lista de Participantes - Oficial");

      // Agrupar e ordenar itens por categoria seguindo a logica do StartOrderManager
      const sortedItems: any[] = [];
      const subcategories = categories.filter(cat => !!cat.parentId);
      const sortedSubcats = [...subcategories].sort((a, b) => {
        const configA = startConfigs.find(c => c.categoryId === a.id);
        const configB = startConfigs.find(c => c.categoryId === b.id);
        return (configA?.orderPosition || 0) - (configB?.orderPosition || 0);
      });

      sortedSubcats.forEach(category => {
        const config = startConfigs.find(c => c.categoryId === category.id);
        if (!config) return;

        let categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');

        // registrationOrder logic
        if (config.registrationOrder) {
          try {
            const order = typeof config.registrationOrder === 'string' ? JSON.parse(config.registrationOrder) : config.registrationOrder;
            if (Array.isArray(order) && order.length > 0) {
              const orderMap = new Map(order.map((id, idx) => [id, idx]));
              categoryRegs.sort((a, b) => ((orderMap.get(a.id) ?? 999) as number) - ((orderMap.get(b.id) ?? 999) as number));
            }
          } catch (e) { }
        }

        categoryRegs.forEach((reg, index) => {
          const parent = categories.find(c => c.id === category.parentId);
          sortedItems.push({
            ...reg,
            categoryName: parent ? `${parent.name} - ${category.name}` : category.name,
            number: config.numberStart + index,
            startTime: calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds)
          });
        });
      });

      const categoriesMap = new Map<string, any[]>();
      sortedItems.forEach(item => {
        if (!categoriesMap.has(item.categoryName)) categoriesMap.set(item.categoryName, []);
        categoriesMap.get(item.categoryName)!.push(item);
      });

      let currentY = 60;

      categoriesMap.forEach((items, categoryName) => {
        if (currentY > 165) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFillColor(249, 115, 22, 0.1);
        doc.rect(14, currentY - 5, pageWidth - 28, 8, 'F');
        doc.setTextColor(234, 88, 12);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(categoryName, 17, currentY);
        currentY += 5;

        const formatExtras = (purchasedItems: any) => {
          if (!purchasedItems) return '-';
          try {
            const items = typeof purchasedItems === 'string' ? JSON.parse(purchasedItems) : purchasedItems;
            if (!Array.isArray(items) || items.length === 0) return '-';
            return items.map((p: any) => {
              if (p.sizes && Array.isArray(p.sizes) && p.sizes.length > 0) {
                return `${p.quantity}x ${p.name} (${p.sizes.filter(Boolean).join(', ')})`;
              }
              return `${p.quantity}x ${p.name}`;
            }).join(' | ');
          } catch (e) {
            return '-';
          }
        };

        const tableBody = items.map(reg => [
          `# ${reg.number}`,
          reg.pilotName,
          reg.pilotCpf || '-',
          reg.pilotShirtSize || '-',
          reg.navigatorName || '-',
          reg.navigatorCpf || '-',
          reg.navigatorShirtSize || '-',
          reg.team || '-',
          reg.status === 'paid' ? 'Confirmado' : 'Pendente',
          formatExtras(reg.purchasedProducts)
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Nº', 'Piloto', 'CPF Piloto', 'Camis.', 'Navegador', 'CPF Nav.', 'Camis.', 'Equipe', 'Status', 'Extras']],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'center' },
          columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 35 }, 2: { cellWidth: 25 }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 35 }, 5: { cellWidth: 25 }, 6: { cellWidth: 12, halign: 'center' }, 7: { cellWidth: 25 }, 8: { cellWidth: 20, halign: 'center' }, 9: { cellWidth: 35 } },
          styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
          margin: { left: 14, right: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      });

      doc.save(`lista_evento_${event.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
      toast.success("PDF da Lista de Evento gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF da Lista de Evento");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-8 space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/organizer")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Painel
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Users className="h-7 w-7 md:h-8 md:w-8 text-primary" />
              Inscritos
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">Gerencie as inscrições dos seus eventos</p>
          </div>
          {selectedEventId && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleExportEventList} variant="outline" className="h-10">
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Exportar Lista do Evento</span>
                <span className="sm:hidden">Exportar PDF</span>
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
              variant="ghost"
              onClick={() => setSelectedEventId(null)}
              className="mb-2 h-10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Seleção de Eventos
            </Button>

            {/* Cards de Estatísticas */}
            {selectedEventId && statistics && (
              <>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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

                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg md:text-xl">Estatísticas por Categoria</CardTitle>
                    <CardDescription>Detalhamento de inscrições e vagas</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <div className="overflow-x-auto scrollbar-hide">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">Categoria</TableHead>
                            <TableHead className="text-right">Confirmados</TableHead>
                            <TableHead className="text-right">Pendentes</TableHead>
                            <TableHead className="text-right">Disponíveis</TableHead>
                            <TableHead className="text-right">Receita</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.byCategory.map((cat) => (
                            <TableRow key={cat.categoryId}>
                              <TableCell className="font-medium">{cat.categoryName}</TableCell>
                              <TableCell className="text-right">
                                <Badge className="bg-green-600">{cat.confirmedRegistrations}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline">{cat.pendingRegistrations}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {cat.totalSlots ? cat.availableSlots : "∞"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(cat.revenue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
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
                    <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
                      <Table>
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
                            <TableHead>Equipe</TableHead>
                            <TableHead>Cancelamento</TableHead>
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
                                {(() => {
                                  const info = startOrderMap.get(registration.id);
                                  return (
                                    <input
                                      type="number"
                                      className="w-16 px-2 py-1 text-sm border rounded min-h-10 sm:min-h-8 bg-muted/30"
                                      placeholder="Nº"
                                      value={info?.number ?? (registration as any).startNumber ?? ""}
                                      readOnly
                                    />
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="px-1 sm:px-2">
                                {(() => {
                                  const info = startOrderMap.get(registration.id);
                                  return (
                                    <input
                                      type="time"
                                      className="w-24 px-2 py-1 text-sm border rounded min-h-10 sm:min-h-8 bg-muted/30"
                                      value={info?.time ?? (registration as any).startTime ?? ""}
                                      readOnly
                                    />
                                  );
                                })()}
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
                              <TableCell className="px-1 sm:px-2">{registration.team || "-"}</TableCell>
                              <TableCell className="px-1 sm:px-2">
                                <div className="flex items-center gap-2 justify-between">
                                  {registration.status === 'cancellation_requested' ? (
                                    <div className="flex flex-col gap-1">
                                      <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-[10px] sm:text-xs">
                                        Solicitado
                                      </Badge>
                                      {registration.cancellationReason && (
                                        <div className="group relative">
                                          <span className="text-[10px] text-muted-foreground underline cursor-help">Ver motivo</span>
                                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-2 bg-popover border rounded-md shadow-lg text-xs break-words whitespace-normal font-normal">
                                            {registration.cancellationReason}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : registration.status === 'cancelled' ? (
                                    <Badge variant="destructive" className="text-[10px] sm:text-xs">Cancelado</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}

                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="Excluir Inscrição"
                                    onClick={() => {
                                      setRegistrationToDelete(registration);
                                      setDeleteConfirmDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
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

        {/* Dialog de Confirmação de Exclusão */}
        <Dialog open={deleteConfirmDialogOpen} onOpenChange={setDeleteConfirmDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Excluir Inscrição
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir permanentemente a inscrição de <strong>{registrationToDelete?.pilotName}</strong>?
                <br /><br />
                Esta ação não pode ser desfeita e removerá todos os dados relacionados a esta inscrição.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteRegistration.mutate({ registrationId: registrationToDelete?.id })}
                disabled={deleteRegistration.isPending}
              >
                {deleteRegistration.isPending ? "Excluindo..." : "Excluir Permanentemente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
