import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Car, Calendar, MapPin, Trophy, Plus, Loader2, QrCode, CreditCard, AlertCircle, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentModal } from "@/components/PaymentModal";
import { EventDocumentsViewer } from "@/components/EventDocumentsViewer";

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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedRegistrationForCancel, setSelectedRegistrationForCancel] = useState<any>(null);
  const [cancellationEligibility, setCancellationEligibility] = useState<any>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

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

  const cancelRegistration = (trpc.registrations as any).cancelMyRegistration.useMutation({
    onSuccess: (result: any) => {
      toast.success("Inscrição cancelada com sucesso!");
      if (result.refundProcessed) {
        toast.success(`Reembolso de R$ ${result.refundValue?.toFixed(2)} foi processado`);
      }
      setCancelDialogOpen(false);
      utils.registrations.myRegistrations.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar inscrição");
    },
  });
  
  const checkEligibility = (trpc.registrations as any).checkCancellationEligibility.useQuery(
    { registrationId: selectedRegistrationForCancel?.id || 0 },
    { enabled: !!(cancelDialogOpen && selectedRegistrationForCancel) }
  );
  
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
      pilotPhone: reg.phone || '',  // ✅ Corrigido: usar 'phone' do banco, não 'pilotPhone'
      pilotCPF: reg.pilotCPF || '',
      pilotAge: reg.pilotAge || '',
      pilotBirthDate: formatDateForInput(reg.pilotBirthDate),
      pilotShirtSize: reg.pilotShirtSize || '',
      navigatorName: reg.navigatorName || '',
      navigatorEmail: reg.navigatorEmail || '',
      navigatorPhone: reg.navigatorPhone || '',
      navigatorCPF: reg.navigatorCPF || '',
      navigatorAge: reg.navigatorAge || '',
      navigatorBirthDate: formatDateForInput(reg.navigatorBirthDate),
      navigatorShirtSize: reg.navigatorShirtSize || '',
      vehicleBrand: reg.vehicleBrand || '',
      vehicleModel: reg.vehicleModel || '',
      vehicleYear: reg.vehicleYear || '',
      vehicleColor: reg.vehicleColor || '',
      vehiclePlate: reg.vehiclePlate || '',
    });
    setEditDialogOpen(true);
  };
  
  const handleUpdateRegistration = () => {
    if (!editForm.pilotName || !editForm.pilotEmail || !editForm.pilotPhone || !editForm.pilotCPF) {
      toast.error("Preencha todos os campos obrigatórios do piloto");
      return;
    }
    updateRegistration.mutate(editForm);
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
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Amigo Racing</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost">Home</Button>
            </Link>
            {(user?.role === 'organizer' || user?.role === 'admin') && (
              <Link href="/organizer">
                <Button variant="outline">Painel Organizador</Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground">Olá, {user?.name}</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? 'Saindo...' : 'Sair'}
            </Button>
          </nav>
        </div>
      </header>

      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Meu Painel do Competidor</h1>
          <p className="text-muted-foreground">Gerencie suas inscrições e veículos</p>
        </div>

        <Tabs defaultValue="registrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="registrations">Minhas Inscrições</TabsTrigger>
            <TabsTrigger value="vehicles">Meus Veículos</TabsTrigger>
          </TabsList>

          {/* Registrations Tab */}
          <TabsContent value="registrations" className="space-y-4">
            {regsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : registrations && registrations.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
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
                        <Badge variant={reg.status === 'paid' ? 'default' : reg.status === 'pending' ? 'secondary' : 'destructive'}>
                          {reg.status === 'paid' ? 'Pago' : reg.status === 'pending' ? 'Pendente' : 'Cancelado'}
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
                      {reg.qrCode && (
                        <div className="flex items-center gap-2 text-sm text-primary">
                          <QrCode className="h-4 w-4" />
                          <span>QR Code disponível</span>
                        </div>
                      )}
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
                    {reg.eventDocuments && (
                      <div className="px-6 py-4">
                        <EventDocumentsViewer
                          documents={(() => {
                            try {
                              const docs = JSON.parse(reg.eventDocuments);
                              return Array.isArray(docs) ? docs : [];
                            } catch {
                              return [];
                            }
                          })()}
                        />
                      </div>
                    )}
                    <CardFooter className="flex gap-2">
                      {canEditRegistration(reg) && (
                        <Button
                          size="sm"
                          variant="outline"
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
                      {reg.status === 'paid' && reg.qrCode && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={reg.qrCode} target="_blank" rel="noopener noreferrer">
                            <QrCode className="mr-2 h-4 w-4" />
                            Ver QR Code
                          </a>
                        </Button>
                      )}
                      {(() => {
                        const allowCancel = Boolean(reg.allow_cancel);
                        const isValidStatus = reg.status === 'pending' || reg.status === 'paid';
                        if (!allowCancel || !isValidStatus) return null;
                        
                        const now = new Date();
                        const eventDate = reg.eventStartDate ? new Date(reg.eventStartDate) : null;
                        if (!eventDate) return null;
                        
                        const deadlineDate = new Date(eventDate);
                        const daysBeforeEvent = Number(reg.cancel_deadline_days) || 0;
                        deadlineDate.setDate(deadlineDate.getDate() - daysBeforeEvent);
                        const isWithinDeadline = now < deadlineDate;
                        return (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!isWithinDeadline}
                            onClick={() => {
                              setSelectedRegistrationForCancel(reg);
                              setCancelDialogOpen(true);
                            }}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                          </Button>
                        );
                      })()}
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
          <TabsContent value="vehicles" className="space-y-4">
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

            {vehiclesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : vehicles && vehicles.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Dialog de Edição de Inscrição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
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
                    value={editForm.pilotPhone || ''}
                    onChange={(e) => setEditForm({ ...editForm, pilotPhone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="pilotCPF">CPF *</Label>
                  <Input
                    id="pilotCPF"
                    value={editForm.pilotCPF || ''}
                    onChange={(e) => setEditForm({ ...editForm, pilotCPF: e.target.value })}
                  />
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
                <div>
                  <Label htmlFor="pilotBirthDate">Data de Nascimento *</Label>
                  <Input
                    id="pilotBirthDate"
                    type="date"
                    value={editForm.pilotBirthDate || ''}
                    onChange={(e) => {
                      setEditForm({ ...editForm, pilotBirthDate: e.target.value });
                      if (e.target.value) {
                        const birthDate = new Date(e.target.value);
                        const today = new Date();
                        let age = today.getFullYear() - birthDate.getFullYear();
                        const monthDiff = today.getMonth() - birthDate.getMonth();
                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                          age--;
                        }
                        setEditForm((prev: any) => ({ ...prev, pilotAge: age.toString() }));
                      }
                    }}
                  />
                </div>
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
                    <Label htmlFor="navigatorEmail">Email</Label>
                    <Input
                      id="navigatorEmail"
                      type="email"
                      value={editForm.navigatorEmail || ''}
                      onChange={(e) => setEditForm({ ...editForm, navigatorEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="navigatorPhone">Telefone</Label>
                    <Input
                      id="navigatorPhone"
                      value={editForm.navigatorPhone || ''}
                      onChange={(e) => setEditForm({ ...editForm, navigatorPhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="navigatorCPF">CPF</Label>
                    <Input
                      id="navigatorCPF"
                      value={editForm.navigatorCPF || ''}
                      onChange={(e) => setEditForm({ ...editForm, navigatorCPF: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="navigatorAge">Idade</Label>
                    <Input
                      id="navigatorAge"
                      type="number"
                      min="0"
                      max="150"
                      value={editForm.navigatorAge || ''}
                      onChange={(e) => setEditForm({ ...editForm, navigatorAge: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="navigatorBirthDate">Data de Nascimento</Label>
                    <Input
                      id="navigatorBirthDate"
                      type="date"
                      value={editForm.navigatorBirthDate || ''}
                      onChange={(e) => {
                        setEditForm({ ...editForm, navigatorBirthDate: e.target.value });
                        if (e.target.value) {
                          const birthDate = new Date(e.target.value);
                          const today = new Date();
                          let age = today.getFullYear() - birthDate.getFullYear();
                          const monthDiff = today.getMonth() - birthDate.getMonth();
                          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                            age--;
                          }
                          setEditForm((prev: any) => ({ ...prev, navigatorAge: age.toString() }));
                        }
                      }}
                    />
                  </div>
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
      </Dialog>
      
      {/* Payment Modal */}
      {selectedRegistrationForPayment && (
        <PaymentModal
          open={paymentModalOpen}
          onOpenChange={setPaymentModalOpen}
          registrationId={selectedRegistrationForPayment.id}
          amount={selectedRegistrationForPayment.categoryPrice || 0}
          eventName={selectedRegistrationForPayment.eventName || ''}
          categoryName={selectedRegistrationForPayment.categoryName || ''}
        />
      )}
      
      {/* Cancellation Dialog */}
      <Dialog open={cancelDialogOpen && !!selectedRegistrationForCancel} onOpenChange={(open) => {
        if (!open) {
          setCancelDialogOpen(false);
          setSelectedRegistrationForCancel(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Inscricao</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar esta inscricao?
            </DialogDescription>
          </DialogHeader>
          {checkEligibility.data && (
            <div className="space-y-4 py-4">
              {!checkEligibility.data.canCancel ? (
                <div className="flex gap-3 p-3 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">{checkEligibility.data.reason}</p>
                    {checkEligibility.data.daysUntilEvent !== undefined && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Faltam {checkEligibility.data.daysUntilEvent} dias para o evento. Prazo: {checkEligibility.data.deadlineDays} dias.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Faltam {checkEligibility.data.daysUntilEvent} dias para o evento.
                  </p>
                  {checkEligibility.data.willRefund ? (
                    <div className="flex gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <span className="text-sm text-green-700 dark:text-green-200">
                        Reembolso automatico sera processado
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                      <p className="text-sm text-yellow-800">Para solicitar o reembolso (conforme a política do evento), entre em contato diretamente com o organizador.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCancelDialogOpen(false);
              setSelectedRegistrationForCancel(null);
            }}>
              Manter Inscricao
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRegistrationForCancel) {
                  cancelRegistration.mutate({ registrationId: selectedRegistrationForCancel.id });
                }
              }}
              disabled={cancelRegistration.isPending || (checkEligibility.data && !checkEligibility.data.canCancel)}
            >
              {cancelRegistration.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
