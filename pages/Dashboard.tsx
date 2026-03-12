import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { Car, Calendar, MapPin, Plus, Loader2, QrCode, CreditCard, AlertCircle, X, ShoppingBag, Hash, Download, FileText, Trophy } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QRCodeSVG } from 'qrcode.react';
import { useState } from "react";
import { toast } from "sonner";
import { PaymentModal } from "@/components/PaymentModal";
import { EventDocumentsViewer } from "@/components/EventDocumentsViewer";
import Navbar from "@/components/Navbar";

export default function Dashboard() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, navigate] = useLocation();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      window.location.href = '/';
    },
  });

  const { data: registrations, isLoading: regsLoading } = trpc.registrations.myRegistrations.useQuery(undefined, { enabled: isAuthenticated });
  const { data: vehicles, isLoading: vehiclesLoading } = trpc.vehicles.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: storeOrders, isLoading: storeOrdersLoading } = trpc.store.getMyOrders.useQuery(undefined, { enabled: isAuthenticated });


  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    brand: "",
    model: "",
    plate: "",
    year: new Date().getFullYear(),
    color: "",
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedRegistrationForPayment, setSelectedRegistrationForPayment] = useState<any>(null);

  // Cancellation state
  const [cancelRequestDialogOpen, setCancelRequestDialogOpen] = useState(false);
  const [selectedRegistrationForCancel, setSelectedRegistrationForCancel] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const [qrCodeModalOpen, setQrCodeModalOpen] = useState(false);
  const [selectedRegForQrCode, setSelectedRegForQrCode] = useState<any>(null);
  const [selectedQrCode, setSelectedQrCode] = useState("");

  const utils = trpc.useUtils();
  const createVehicle = trpc.vehicles.create.useMutation({
    onSuccess: () => {
      toast.success("Veículo cadastrado com sucesso!");
      setVehicleDialogOpen(false);
      setVehicleForm({ brand: "", model: "", plate: "", year: new Date().getFullYear(), color: "" });
      utils.vehicles.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao cadastrar veículo");
    },
  });

  const updateRegistration = trpc.registrations.updateMyRegistration.useMutation({
    onSuccess: () => {
      toast.success("Inscrição atualizada com sucesso!");
      setEditDialogOpen(false);
      utils.registrations.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar inscrição");
    },
  });

  const requestCancellation = trpc.registrations.requestCancellation.useMutation({
    onSuccess: (result) => {
      toast.success(result.message || "Solicitação de cancelamento enviada!");
      setCancelRequestDialogOpen(false);
      utils.registrations.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao solicitar cancelamento");
    },
  });

  const canEditRegistration = (reg: any) => {
    if (reg.status === 'cancelled') return false;

    // Verificar se ainda é possível editar (até 1 dia antes do evento)
    // Como não temos a data do evento aqui, vamos permitir e deixar o backend validar
    return true;
  };

  // Função para formatar data para input type="date"
  const formatDateForInput = (date: any) => {
    if (!date) return '';
    try {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  const handleEditClick = (reg: any) => {
    setEditingRegistration(reg);
    setEditForm({
      registrationId: reg.id,
      pilotName: reg.pilotName || '',
      pilotEmail: reg.pilotEmail || '',
      phone: reg.pilotPhone || '',
      pilotCpf: reg.pilotCpf || '',
      pilotAge: reg.pilotAge || '',
      pilotShirtSize: reg.pilotShirtSize || '',
      navigatorName: reg.navigatorName || '',
      navigatorEmail: reg.navigatorEmail || '',
      navigatorCpf: reg.navigatorCPF || '',
      navigatorShirtSize: reg.navigatorShirtSize || '',
      vehicleBrand: reg.vehicleBrand || '',
      vehicleModel: reg.vehicleModel || '',
      vehicleYear: reg.vehicleYear || '',
      vehicleColor: reg.vehicleColor || '',
      vehiclePlate: reg.vehiclePlate || '',
      hasShirts: reg.eventHasShirts !== false,
    });
    setEditDialogOpen(true);
  };

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
      .substring(0, 14);
  };

  const isValidCPF = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, "");
    if (numbers.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(numbers)) return false;

    let sum = 0;
    let rest;

    for (let i = 1; i <= 9; i++) sum += parseInt(numbers.substring(i - 1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(numbers.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(numbers.substring(i - 1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(numbers.substring(10, 11))) return false;

    return true;
  };

  const handleCpfChange = (field: 'pilotCpf' | 'navigatorCpf', value: string) => {
    const formatted = formatCpf(value);
    setEditForm({ ...editForm, [field]: formatted });
  };

  const handleUpdateRegistration = () => {
    // Validação de campos obrigatórios
    if (!editForm.pilotName || !editForm.pilotEmail || !editForm.phone || !editForm.pilotCpf || !editForm.pilotAge) {
      toast.error("Preencha todos os campos obrigatórios do piloto");
      return;
    }

    // Preparação de dados
    const submitData = {
      ...editForm,
      // Limpeza de campos de texto (remover formatação)
      pilotCpf: editForm.pilotCpf.replace(/\D/g, ''),
      navigatorCpf: editForm.navigatorCpf ? editForm.navigatorCpf.replace(/\D/g, '') : null,
      phone: editForm.phone.replace(/\D/g, ''),
      // Conversão de tipos numéricos
      pilotAge: Number(editForm.pilotAge),
      vehicleYear: editForm.vehicleYear ? Number(editForm.vehicleYear) : null,
      // Garantir que opcionais vazios vão como null para o backend
      navigatorName: editForm.navigatorName || null,
      navigatorEmail: editForm.navigatorEmail || null,
      navigatorCity: editForm.navigatorCity || null,
      navigatorState: editForm.navigatorState || null,
      navigatorShirtSize: editForm.navigatorShirtSize || null,
      vehicleBrand: editForm.vehicleBrand || null,
      vehicleModel: editForm.vehicleModel || null,
      vehicleColor: editForm.vehicleColor || null,
      vehiclePlate: editForm.vehiclePlate || null,
      team: editForm.team || null,
      notes: editForm.notes || null,
      pilotShirtSize: editForm.hasShirts ? editForm.pilotShirtSize : null,
      navigatorShirtSize: (editForm.hasShirts && editForm.navigatorName) ? editForm.navigatorShirtSize : null,
    };

    updateRegistration.mutate(submitData);
  };

  const handleCreateVehicle = () => {
    if (!vehicleForm.brand || !vehicleForm.model || !vehicleForm.plate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createVehicle.mutate(vehicleForm);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-muted-foreground mb-4">Faça login para acessar o dashboard</p>
            <Button asChild>
              <a href={getLoginUrl()}>Entrar</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Meu Painel</h1>
            <p className="text-muted-foreground">Acompanhe suas inscrições, resultados e veículos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/">
              <Button variant="outline" className="h-10">
                <Calendar className="mr-2 h-4 w-4" />
                Explorar Eventos
              </Button>
            </Link>
          </div>
        </header>

        <Tabs defaultValue="registrations" className="space-y-6">
          <div className="overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-full md:w-auto h-11 items-center justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="registrations"
                className="inline-flex items-center justify-center whitespace-nowrap py-2 pr-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-11"
              >
                Minhas Inscrições
              </TabsTrigger>
              <TabsTrigger
                value="vehicles"
                className="inline-flex items-center justify-center whitespace-nowrap py-2 px-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-11"
              >
                Meus Veículos
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                className="inline-flex items-center justify-center whitespace-nowrap py-2 px-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-11"
              >
                Loja / Pedidos
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Registrations Tab */}
          <TabsContent value="registrations" className="space-y-6">
            {regsLoading ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : registrations && registrations.length > 0 ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                {registrations.map((reg) => (
                  <Card key={reg.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{reg.eventName || `Inscricao #${reg.id}`}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Inscricao #{reg.id} - {format(new Date(reg.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </CardDescription>
                        </div>
                        <Badge variant={reg.status === 'paid' ? 'default' : reg.status === 'pending' ? 'secondary' : reg.status === 'cancellation_requested' ? 'outline' : 'destructive'}>
                          {reg.status === 'paid' ? 'Pago' : reg.status === 'pending' ? 'Pendente' : reg.status === 'cancellation_requested' ? 'Cancelamento Solicitado' : 'Cancelado'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Evento ID: {reg.eventId}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span>Veículo ID: {reg.vehicleId}</span>
                      </div>
                      {reg.startNumber && (
                        <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                          </svg>
                          <span>Número de Largada: {reg.startNumber}</span>
                        </div>
                      )}
                      {reg.startTime && (
                        <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Horário de Largada: {reg.startTime.substring(0, 5)}</span>
                        </div>
                      )}
                    </CardContent>
                    {/* Documentos e Planilhas de Navegação */}
                    {(reg.eventDocuments || reg.eventNavigationFiles) && (
                      <div className="px-6 py-4 border-t bg-muted/5">
                        <div className="space-y-4">
                          {reg.eventDocuments && (
                            <div className="space-y-2">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Regulamentos e Documentos
                              </p>
                              <EventDocumentsViewer
                                documents={(() => {
                                  try {
                                    const docs = typeof reg.eventDocuments === 'string'
                                      ? JSON.parse(reg.eventDocuments)
                                      : reg.eventDocuments;
                                    return Array.isArray(docs) ? docs : [];
                                  } catch {
                                    return [];
                                  }
                                })()}
                              />
                            </div>
                          )}

                          {reg.eventNavigationFiles && (
                            <div className="space-y-2">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Planilhas de Navegação
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(() => {
                                  try {
                                    const navFiles = typeof reg.eventNavigationFiles === 'string'
                                      ? JSON.parse(reg.eventNavigationFiles)
                                      : reg.eventNavigationFiles;

                                    if (!Array.isArray(navFiles)) return null;

                                    // Filtro: Mostrar apenas arquivos da categoria do piloto ou arquivos "Geral" (null/all)
                                    const visibleFiles = navFiles.filter((file: any) =>
                                      !file.categoryId || file.categoryId === "all" || file.categoryId === reg.categoryId
                                    );

                                    if (visibleFiles.length === 0) {
                                      return <p className="text-[10px] text-muted-foreground italic col-span-full">Nenhuma planilha vinculada à sua categoria.</p>;
                                    }

                                    return visibleFiles.map((file: any, idx: number) => (
                                      <Button
                                        key={idx}
                                        variant="secondary"
                                        size="sm"
                                        className="h-9 justify-start text-xs font-semibold gap-2 border bg-white hover:bg-muted transition-all"
                                        asChild
                                      >
                                        <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer">
                                          <Hash className="h-3.5 w-3.5 text-primary" />
                                          <span className="truncate">{file.name || 'Planilha'}</span>
                                          <Download className="h-3 w-3 ml-auto opacity-40" />
                                        </a>
                                      </Button>
                                    ));
                                  } catch {
                                    return null;
                                  }
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <CardFooter className="flex flex-wrap gap-2">
                      {canEditRegistration(reg) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => handleEditClick(reg)}
                        >
                          Editar Inscrição
                        </Button>
                      )}
                      {reg.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              setSelectedRegistrationForPayment(reg);
                              setPaymentModalOpen(true);
                            }}
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Pagar
                          </Button>
                          {/* <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelRegistration.mutate({ id: reg.id })}
                            disabled={cancelRegistration.isPending}
                          >
                            Cancelar
                          </Button> */}
                        </>
                      )}
                      {reg.status === 'paid' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setSelectedRegForQrCode(reg);
                            setSelectedQrCode(reg.qrCode || "");
                            setQrCodeModalOpen(true);
                          }}
                        >
                          <QrCode className="mr-2 h-4 w-4" />
                          Ver QR Code
                        </Button>
                      )}
                      {reg.eventAllowCancellation && reg.status !== 'cancelled' && reg.status !== 'cancellation_requested' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto hover:bg-destructive/10"
                          onClick={() => {
                            setSelectedRegistrationForCancel(reg);
                            setCancellationReason("");
                            setCancelRequestDialogOpen(true);
                          }}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Solicitar Cancelamento
                        </Button>
                      )}
                      {reg.championshipId && (
                        <Link href={`/championship/${reg.championshipId}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                          >
                            <Trophy className="mr-2 h-4 w-4" />
                            Ver Classificação
                          </Button>
                        </Link>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground mb-4">
                    Você ainda não tem inscrições
                  </p>
                  <Link href="/">
                    <Button>Ver Eventos Disponíveis</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Vehicles Tab */}
          < TabsContent value="vehicles" className="space-y-4" >
            <div className="flex justify-end">
              <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
                <DialogTrigger>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Veículo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cadastrar Veículo</DialogTitle>
                    <DialogDescription>
                      Adicione um novo veículo ao seu cadastro
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="brand">Marca *</Label>
                      <Input
                        id="brand"
                        value={vehicleForm.brand}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                        placeholder="Ex: Honda, Yamaha, Toyota"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model">Modelo *</Label>
                      <Input
                        id="model"
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                        placeholder="Ex: CB500, Lander, Hilux"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plate">Placa *</Label>
                      <Input
                        id="plate"
                        value={vehicleForm.plate}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value.toUpperCase() })}
                        placeholder="ABC1234"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="year">Ano</Label>
                        <Input
                          id="year"
                          type="number"
                          value={vehicleForm.year}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, year: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="color">Cor</Label>
                        <Input
                          id="color"
                          value={vehicleForm.color}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                          placeholder="Ex: Preto, Vermelho"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateVehicle} disabled={createVehicle.isPending}>
                      {createVehicle.isPending ? "Cadastrando..." : "Cadastrar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {
              vehiclesLoading ? (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader>
                        <div className="h-6 bg-muted rounded w-3/4"></div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : vehicles && vehicles.length > 0 ? (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {vehicles.map((vehicle) => (
                    <Card key={vehicle.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              {vehicle.brand} {vehicle.model}
                            </CardTitle>
                            <CardDescription>{vehicle.plate}</CardDescription>
                          </div>
                          <Car className="h-6 w-6 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {vehicle.year && (
                          <p className="text-sm text-muted-foreground">Ano: {vehicle.year}</p>
                        )}
                        {vehicle.color && (
                          <p className="text-sm text-muted-foreground">Cor: {vehicle.color}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg text-muted-foreground mb-4">
                      Você ainda não tem veículos cadastrados
                    </p>
                    <Button onClick={() => setVehicleDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Primeiro Veículo
                    </Button>
                  </CardContent>
                </Card>
              )
            }
          </TabsContent >

          {/* Store Orders Tab */}
          < TabsContent value="store" className="space-y-4" >
            {
              storeOrdersLoading ? (
                <div className="flex justify-center py-8" >
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : storeOrders && storeOrders.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {storeOrders.map(({ order, product }: any) => (
                      <Card key={order.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {product.name}
                              </CardTitle>
                              <CardDescription>
                                Data: {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                              </CardDescription>
                            </div>
                            <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>
                              {order.status === 'PAID' ? 'Pago' : order.status === 'PENDING' ? 'Pendente' : order.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-sm"><strong>Comprador:</strong> {order.buyerName}</p>
                          <p className="text-sm"><strong>CPF:</strong> {order.buyerCpf ? formatCpf(order.buyerCpf) : "-"}</p>
                          <p className="text-sm">
                            <strong>Quantidade:</strong> {order.quantity}
                            {order.sizes && (
                              <span>
                                {" - "}<strong>Tamanho:</strong> {(() => {
                                  try {
                                    const parsed = typeof order.sizes === 'string' ? JSON.parse(order.sizes) : order.sizes;
                                    return Array.isArray(parsed) ? parsed.join(", ") : parsed;
                                  } catch {
                                    return String(order.sizes);
                                  }
                                })()}
                              </span>
                            )}
                          </p>
                          <p className="text-sm"><strong>Total:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalAmount)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="bg-muted/50 border rounded-lg p-4 flex items-start gap-3 text-sm text-muted-foreground mt-4">
                    <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="mb-1">
                        As camisetas do evento serão entregues na data marcada para a retirada dos kits.
                      </p>
                      <p>
                        Para solicitar envio, contatar o organizador.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Você ainda não realizou compras avulsas na loja.</p>
                  </CardContent>
                </Card>
              )}
          </TabsContent >

        </Tabs >

        {/* Dialog de Edição de Inscrição */}
        < Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen} >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Inscrição #{editingRegistration?.id}</DialogTitle>
              <DialogDescription>
                Edite os dados da sua inscrição. Edições são permitidas até 1 dia antes do evento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold">Dados do Piloto</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pilotName">Nome Completo *</Label>
                    <Input
                      id="pilotName"
                      value={editForm.pilotName || ''}
                      onChange={(e) => setEditForm({ ...editForm, pilotName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilotEmail">Email *</Label>
                    <Input
                      id="pilotEmail"
                      type="email"
                      value={editForm.pilotEmail || ''}
                      onChange={(e) => setEditForm({ ...editForm, pilotEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilotPhone">Telefone *</Label>
                    <Input
                      id="pilotPhone"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilotCpf">CPF *</Label>
                    <Input
                      id="pilotCpf"
                      value={editForm.pilotCpf || ''}
                      onChange={(e) => handleCpfChange('pilotCpf', e.target.value)}
                      maxLength={14}
                      className={editForm.pilotCpf && editForm.pilotCpf.length === 14 && !isValidCPF(editForm.pilotCpf) ? "border-red-500" : ""}
                    />
                    {editForm.pilotCpf && editForm.pilotCpf.length === 14 && !isValidCPF(editForm.pilotCpf) && (
                      <p className="text-[10px] text-red-500 mt-1">CPF inválido</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="pilotAge">Idade *</Label>
                    <Input
                      id="pilotAge"
                      type="number"
                      min="0"
                      max="150"
                      value={editForm.pilotAge || ''}
                      onChange={(e) => setEditForm({ ...editForm, pilotAge: e.target.value })}
                    />
                  </div>
                  {editForm.hasShirts && (
                    <div>
                      <Label htmlFor="pilotShirtSize">Tamanho da Camiseta *</Label>
                      <select
                        id="pilotShirtSize"
                        className="w-full border rounded-md px-3 py-2"
                        value={editForm.pilotShirtSize || ''}
                        onChange={(e) => setEditForm({ ...editForm, pilotShirtSize: e.target.value })}
                      >
                        <option value="pp">PP</option>
                        <option value="p">P</option>
                        <option value="m">M</option>
                        <option value="g">G</option>
                        <option value="gg">GG</option>
                        <option value="g1">G1</option>
                        <option value="g2">G2</option>
                        <option value="g3">G3</option>
                        <option value="g4">G4</option>
                        <option value="infantil">Infantil</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Seção de Navegador - sempre visível se houver dados */}
              {(
                <div className="space-y-2">
                  <h3 className="font-semibold">Dados do Navegador</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="navigatorName">Nome Completo</Label>
                      <Input
                        id="navigatorName"
                        value={editForm.navigatorName || ''}
                        onChange={(e) => setEditForm({ ...editForm, navigatorName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="navigatorEmail">Email do Navegador</Label>
                      <Input
                        id="navigatorEmail"
                        type="email"
                        value={editForm.navigatorEmail || ''}
                        onChange={(e) => setEditForm({ ...editForm, navigatorEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="navigatorCpf">CPF</Label>
                      <Input
                        id="navigatorCpf"
                        value={editForm.navigatorCpf || ''}
                        onChange={(e) => handleCpfChange('navigatorCpf', e.target.value)}
                        maxLength={14}
                        className={editForm.navigatorCpf && editForm.navigatorCpf.length === 14 && !isValidCPF(editForm.navigatorCpf) ? "border-red-500" : ""}
                      />
                      {editForm.navigatorCpf && editForm.navigatorCpf.length === 14 && !isValidCPF(editForm.navigatorCpf) && (
                        <p className="text-[10px] text-red-500 mt-1">CPF inválido</p>
                      )}
                    </div>
                    {editForm.hasShirts && (
                      <div>
                        <Label htmlFor="navigatorShirtSize">Tamanho da Camiseta</Label>
                        <select
                          id="navigatorShirtSize"
                          className="w-full border rounded-md px-3 py-2"
                          value={editForm.navigatorShirtSize || ''}
                          onChange={(e) => setEditForm({ ...editForm, navigatorShirtSize: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          <option value="pp">PP</option>
                          <option value="p">P</option>
                          <option value="m">M</option>
                          <option value="g">G</option>
                          <option value="gg">GG</option>
                          <option value="g1">G1</option>
                          <option value="g2">G2</option>
                          <option value="g3">G3</option>
                          <option value="g4">G4</option>
                          <option value="infantil">Infantil</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Seção de Veículo - sempre visível se houver dados */}
              {(
                <div className="space-y-2">
                  <h3 className="font-semibold">Dados do Veículo</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vehicleBrand">Marca</Label>
                      <Input
                        id="vehicleBrand"
                        value={editForm.vehicleBrand || ''}
                        onChange={(e) => setEditForm({ ...editForm, vehicleBrand: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vehicleModel">Modelo</Label>
                      <Input
                        id="vehicleModel"
                        value={editForm.vehicleModel || ''}
                        onChange={(e) => setEditForm({ ...editForm, vehicleModel: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vehicleYear">Ano</Label>
                      <Input
                        id="vehicleYear"
                        type="number"
                        value={editForm.vehicleYear || ''}
                        onChange={(e) => setEditForm({ ...editForm, vehicleYear: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vehicleColor">Cor</Label>
                      <Input
                        id="vehicleColor"
                        value={editForm.vehicleColor || ''}
                        onChange={(e) => setEditForm({ ...editForm, vehicleColor: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vehiclePlate">Placa</Label>
                      <Input
                        id="vehiclePlate"
                        value={editForm.vehiclePlate || ''}
                        onChange={(e) => setEditForm({ ...editForm, vehiclePlate: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateRegistration} disabled={updateRegistration.isPending}>
                {updateRegistration.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog >

        {/* Payment Modal */}
        {
          selectedRegistrationForPayment && (
            <PaymentModal
              open={paymentModalOpen}
              onOpenChange={setPaymentModalOpen}
              registrationId={selectedRegistrationForPayment.id}
              amount={selectedRegistrationForPayment.categoryPrice || 0}
              eventName={selectedRegistrationForPayment.eventName || ''}
              categoryName={selectedRegistrationForPayment.categoryName || ''}
            />
          )
        }

        {/* Modal QR Code */}
        <Dialog open={qrCodeModalOpen} onOpenChange={setQrCodeModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>QR Code de Check-in</DialogTitle>
              <DialogDescription>
                Apresente este QR Code no dia do check-in para confirmar sua inscrição #{selectedRegForQrCode?.id}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg">
              {selectedRegForQrCode ? (
                <div className="p-4 bg-white rounded-lg border border-gray-100">
                  <QRCodeSVG
                    value={JSON.stringify({
                      id: selectedRegForQrCode.id,
                      pilot: selectedRegForQrCode.pilotName,
                      event: selectedRegForQrCode.eventName,
                      status: 'paid'
                    })}
                    size={256}
                    level="H"
                    includeMargin={true}
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <p className="text-muted-foreground">Dados não disponíveis</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setQrCodeModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Solicitar Cancelamento */}
        <Dialog open={cancelRequestDialogOpen} onOpenChange={setCancelRequestDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar Cancelamento</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja solicitar o cancelamento da sua inscrição para o evento <strong>{selectedRegistrationForCancel?.eventName}</strong>?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-sm">
              <p className="text-muted-foreground">
                De acordo com o regulamento do evento, sua solicitação será analisada pelo organizador.
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancelReason">Motivo do Cancelamento (opcional)</Label>
                <textarea
                  id="cancelReason"
                  className="w-full min-h-[100px] p-3 border rounded-md bg-background focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Descreva brevemente o motivo do cancelamento..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setCancelRequestDialogOpen(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() => requestCancellation.mutate({
                  registrationId: selectedRegistrationForCancel.id,
                  reason: cancellationReason
                })}
                disabled={requestCancellation.isPending}
              >
                {requestCancellation.isPending ? "Enviando..." : "Confirmar Solicitação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main >
    </div >
  );
}
