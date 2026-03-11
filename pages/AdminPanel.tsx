import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, Users, Calendar, Trash2, Edit, TrendingUp, DollarSign, FileText, ArrowLeft, Check, X, Building, Mail, Phone, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";
import { EventEditDialog } from "@/components/events/EventEditDialog";
import { compressImage } from "@/lib/imageCompression";

export default function AdminPanel() {
  const { user, loading } = useAuth();

  // States for Modals & Selections
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [editRoleDialog, setEditRoleDialog] = useState(false);
  const [deleteEventDialog, setDeleteEventDialog] = useState(false);
  const [editEventDialog, setEditEventDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);

  const [newRole, setNewRole] = useState<"user" | "admin" | "participant" | "organizer">("user");
  const [rejectionReason, setRejectionReason] = useState("");

  const [externalEventDialogOpen, setExternalEventDialogOpen] = useState(false);
  const [externalEventForm, setExternalEventForm] = useState({
    name: "",
    description: "",
    startDate: "",
    startTime: "08:00",
    endDate: "",
    endTime: "18:00",
    location: "",
    city: "",
    state: "",
    showInListing: true,
    imageUrl: "",
    allowCancellation: false,
  });

  // Queries
  const isEnabled = user?.role === 'admin';
  const { data: users = [], refetch: refetchUsers } = trpc.admin.listUsers.useQuery(undefined, { enabled: isEnabled });
  const { data: events = [], refetch: refetchEvents } = trpc.admin.listAllEvents.useQuery(undefined, { enabled: isEnabled });
  const { data: dashboardStats } = trpc.admin.getDashboardStats.useQuery(undefined, { enabled: isEnabled });
  const { data: organizerRequests = [], refetch: refetchRequests } = trpc.organizerRequests.list.useQuery(undefined, { enabled: isEnabled });

  // Mutations
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("💥 Permissões atualizadas com sucesso!");
      refetchUsers();
      setEditRoleDialog(false);
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteEventMutation = trpc.admin.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("🗑️ Evento excluído do sistema.");
      refetchEvents();
      setDeleteEventDialog(false);
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const approveRequestMutation = trpc.organizerRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("🎉 Organizador aprovado com sucesso! Permissões concedidas.");
      refetchRequests();
      setApproveDialog(false);
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const rejectRequestMutation = trpc.organizerRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("🚫 Solicitação rejeitada.");
      refetchRequests();
      setRejectDialog(false);
      setRejectionReason("");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const createExternalEvent = trpc.events.createExternal.useMutation({
    onSuccess: () => {
      toast.success("Evento externo adicionado com sucesso!");
      setExternalEventDialogOpen(false);
      setExternalEventForm({
        name: "",
        description: "",
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        location: "",
        city: "",
        state: "",
        showInListing: true,
        imageUrl: "",
        allowCancellation: false,
      });
      refetchEvents();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao adicionar evento externo");
    },
  });

  // Handlers
  const handleApprove = () => selectedRequest && approveRequestMutation.mutate({ requestId: selectedRequest.id });
  const handleReject = () => selectedRequest && rejectRequestMutation.mutate({ requestId: selectedRequest.id, reason: rejectionReason });

  const handleCreateExternalEvent = async () => {
    if (!externalEventForm.name || !externalEventForm.startDate || !externalEventForm.endDate || !externalEventForm.location || !externalEventForm.city) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const startDateTime = `${externalEventForm.startDate}T${externalEventForm.startTime || "00:00"}`;
    const endDateTime = `${externalEventForm.endDate}T${externalEventForm.endTime || "23:59"}`;

    createExternalEvent.mutate({
      ...externalEventForm,
      imageUrl: externalEventForm.imageUrl || undefined,
      startDate: startDateTime,
      endDate: endDateTime,
    });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="w-12 h-12 text-primary animate-spin" />
    </div>
  );

  if (!user || user.role !== "admin") return <Redirect to="/" />;

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans pb-20 selection:bg-primary/30">

      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-orange-600/5 blur-[100px]" />
      </div>

      <div className="container relative z-10 pt-12 max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <Button variant="outline" className="mb-6 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-full px-6 transition-all" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Início
            </Button>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl border border-primary/20 shadow-[0_0_30px_rgba(234,88,12,0.15)]">
                <Shield className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight">
                  Painel Central (Admin)
                </h1>
                <p className="text-neutral-400 mt-2 text-lg font-medium">Controle total sobre o ecossistema Amigo Racing.</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="w-full flex justify-start bg-transparent border-b border-white/10 p-0 mb-8 rounded-none h-auto gap-8 overflow-x-auto no-scrollbar">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-white text-neutral-400 rounded-none pb-4 text-base font-medium px-2">
              <TrendingUp className="w-5 h-5 mr-2" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="requests" className="relative data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-white text-neutral-400 rounded-none pb-4 text-base font-medium px-2">
              <Building className="w-5 h-5 mr-2" />
              Solicitações
              {organizerRequests.filter((r: any) => r.status === 'pending').length > 0 && (
                <span className="absolute top-0 right-[-12px] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {organizerRequests.filter((r: any) => r.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-white text-neutral-400 rounded-none pb-4 text-base font-medium px-2">
              <Users className="w-5 h-5 mr-2" />
              Usuários Cadastrados
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-white text-neutral-400 rounded-none pb-4 text-base font-medium px-2">
              <Calendar className="w-5 h-5 mr-2" />
              Eventos Ativos
            </TabsTrigger>
          </TabsList>

          {/* DASHBOARD TAB */}
          <TabsContent value="dashboard" className="animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard title="Usuários Ativos" value={dashboardStats?.totalUsers || 0} icon={Users} color="text-blue-400" bg="bg-blue-400/10" border="border-blue-400/20" />
              <StatCard title="Eventos Globais" value={dashboardStats?.totalEvents || 0} icon={Calendar} color="text-purple-400" bg="bg-purple-400/10" border="border-purple-400/20" />
              <StatCard title="Inscrições Totais" value={dashboardStats?.totalRegistrations || 0} icon={FileText} color="text-emerald-400" bg="bg-emerald-400/10" border="border-emerald-400/20" />
              <StatCard title="Volume Financeiro" value={`R$ ${((dashboardStats?.totalRevenue || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} color="text-primary" bg="bg-primary/10" border="border-primary/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-white/[0.02] border-b border-white/5">
                  <CardTitle className="text-white font-bold">Distribuição de Status</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardStats?.eventsByStatus?.map((item: any) => (
                      <div key={item.status} className="flex justify-between items-center p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                        <Badge variant={item.status === 'open' ? 'default' : item.status === 'closed' ? 'secondary' : 'destructive'} className="px-3 py-1 text-sm uppercase font-bold tracking-wider">
                          {item.status}
                        </Badge>
                        <span className="text-3xl font-black text-white">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-white/[0.02] border-b border-white/5">
                  <CardTitle className="text-white font-bold">Crescimento de Inscrições</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardStats?.registrationsByMonth?.map((item: any) => (
                      <div key={item.month} className="flex justify-between items-center p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                        <span className="text-lg font-medium text-neutral-300">{item.month}</span>
                        <span className="text-3xl font-black text-white">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ORGANIZER REQUESTS TAB */}
          <TabsContent value="requests" className="animate-in fade-in duration-500">
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-white/[0.02] border-b border-white/5">
                <CardTitle className="text-white flex items-center gap-3 text-xl">
                  <Building className="w-6 h-6 text-primary" />
                  Solicitações de Organizadores
                </CardTitle>
                <CardDescription className="text-neutral-400">Analise os pedidos de equipes querendo criar eventos na plataforma.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-white/[0.02] border-b border-white/10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-neutral-400 font-semibold py-4">Equipe / Nome</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Contato</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Data</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Status</TableHead>
                      <TableHead className="text-right text-neutral-400 font-semibold py-4">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizerRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-neutral-500">Nenhuma solicitação encontrada.</TableCell>
                      </TableRow>
                    ) : organizerRequests.map((req: any) => (
                      <TableRow key={req.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <TableCell className="py-4">
                          <div className="font-bold text-white text-lg">{req.organizerName}</div>
                          {req.description && <div className="text-sm text-neutral-400 truncate max-w-[200px]" title={req.description}>{req.description}</div>}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center text-sm text-neutral-300 mb-1"><Mail className="w-3 h-3 mr-2 text-neutral-500" /> {req.contactEmail}</div>
                          {req.contactPhone && <div className="flex items-center text-sm text-neutral-300"><Phone className="w-3 h-3 mr-2 text-neutral-500" /> {req.contactPhone}</div>}
                        </TableCell>
                        <TableCell className="py-4 text-neutral-300">{new Date(req.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="py-4">
                          <Badge variant={req.status === 'approved' ? 'default' : req.status === 'rejected' ? 'destructive' : 'secondary'} className="px-3 py-1 font-bold">
                            {req.status === 'pending' ? 'Pendente' : req.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          {req.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-400" onClick={() => { setSelectedRequest(req); setApproveDialog(true); }}>
                                <Check className="w-4 h-4 mr-1" /> Aprovar
                              </Button>
                              <Button size="sm" variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400" onClick={() => { setSelectedRequest(req); setRejectDialog(true); }}>
                                <X className="w-4 h-4 mr-1" /> Rejeitar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users" className="animate-in fade-in duration-500">
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-white/[0.02] border-b border-white/5">
                <CardTitle className="text-white flex items-center gap-3 text-xl"><Users className="w-6 h-6 text-primary" /> Gestão de Usuários</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-white/[0.02] border-b border-white/10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-neutral-400 font-semibold py-4 pl-6">ID</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Usuário</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Permissão</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Cadastro</TableHead>
                      <TableHead className="text-right text-neutral-400 font-semibold py-4 pr-6">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u: any) => (
                      <TableRow key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <TableCell className="py-4 pl-6 text-neutral-500 font-mono">#{u.id}</TableCell>
                        <TableCell className="py-4">
                          <div className="font-bold text-white">{u.name || "Sem Nome"}</div>
                          <div className="text-sm text-neutral-400">{u.email}</div>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge className={`px-3 py-1 font-bold ${u.role === 'admin' ? 'bg-primary text-white hover:bg-primary/80' : u.role === 'organizer' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}>
                            {u.role.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-neutral-300">{new Date(u.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white hover:bg-white/10" onClick={() => { setSelectedUser(u); setNewRole(u.role); setEditRoleDialog(true); }}>
                            <Edit className="w-4 h-4 mr-2" /> Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EVENTS TAB */}
          <TabsContent value="events" className="animate-in fade-in duration-500">
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-white/[0.02] border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-white flex items-center gap-3 text-xl"><Calendar className="w-6 h-6 text-primary" /> Eventos Ativos</CardTitle>
                <Dialog open={externalEventDialogOpen} onOpenChange={setExternalEventDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-primary/50 text-white hover:bg-white/10 shrink-0">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Evento Externo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-neutral-900 border-white/10 text-white">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold">Adicionar Evento Externo</DialogTitle>
                      <DialogDescription className="text-neutral-400">
                        Adicione eventos externos ao calendário (sem inscrição pelo site)
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="ext-name">Nome do Evento *</Label>
                        <Input
                          id="ext-name"
                          className="bg-black border-white/10"
                          value={externalEventForm.name}
                          onChange={(e) => setExternalEventForm({ ...externalEventForm, name: e.target.value })}
                          placeholder="Ex: Rally dos Sertões"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ext-description">Descrição</Label>
                        <Textarea
                          id="ext-description"
                          className="bg-black border-white/10"
                          value={externalEventForm.description}
                          onChange={(e) => setExternalEventForm({ ...externalEventForm, description: e.target.value })}
                          placeholder="Descrição do evento"
                          rows={4}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="ext-startDate">Data de Início *</Label>
                          <div className="flex gap-2">
                            <Input
                              id="ext-startDate"
                              type="date"
                              className="bg-black border-white/10 flex-1"
                              value={externalEventForm.startDate}
                              onChange={(e) => setExternalEventForm({ ...externalEventForm, startDate: e.target.value })}
                            />
                            <Input
                              type="time"
                              className="bg-black border-white/10 w-[100px]"
                              value={externalEventForm.startTime}
                              onChange={(e) => setExternalEventForm({ ...externalEventForm, startTime: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ext-endDate">Data de Término *</Label>
                          <div className="flex gap-2">
                            <Input
                              id="ext-endDate"
                              type="date"
                              className="bg-black border-white/10 flex-1"
                              value={externalEventForm.endDate}
                              onChange={(e) => setExternalEventForm({ ...externalEventForm, endDate: e.target.value })}
                            />
                            <Input
                              type="time"
                              className="bg-black border-white/10 w-[100px]"
                              value={externalEventForm.endTime}
                              onChange={(e) => setExternalEventForm({ ...externalEventForm, endTime: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="ext-location">Local *</Label>
                        <Input
                          id="ext-location"
                          className="bg-black border-white/10"
                          value={externalEventForm.location}
                          onChange={(e) => setExternalEventForm({ ...externalEventForm, location: e.target.value })}
                          placeholder="Ex: Região Norte do Brasil"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="ext-city">Cidade *</Label>
                          <Input
                            id="ext-city"
                            className="bg-black border-white/10"
                            value={externalEventForm.city}
                            onChange={(e) => setExternalEventForm({ ...externalEventForm, city: e.target.value })}
                            placeholder="Ex: Brasília"
                          />
                        </div>
                        <div>
                          <Label htmlFor="ext-state">Estado</Label>
                          <Input
                            id="ext-state"
                            className="bg-black border-white/10"
                            value={externalEventForm.state}
                            onChange={(e) => setExternalEventForm({ ...externalEventForm, state: e.target.value })}
                            placeholder="Ex: DF"
                            maxLength={2}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Visibilidade</Label>
                        <div className="flex items-center space-x-6 text-sm text-neutral-300">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="showInListingAdmin"
                              checked={externalEventForm.showInListing === true}
                              onChange={() => setExternalEventForm({ ...externalEventForm, showInListing: true })}
                              className="w-4 h-4 accent-primary"
                            />
                            <span>Ver no Calendário e Home</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="showInListingAdmin"
                              checked={externalEventForm.showInListing === false}
                              onChange={() => setExternalEventForm({ ...externalEventForm, showInListing: false })}
                              className="w-4 h-4 accent-primary"
                            />
                            <span>Ocultar da Home (Apenas Calendário)</span>
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-image">Imagem do Evento</Label>
                        <Input
                          id="ext-image"
                          type="file"
                          accept="image/*"
                          className="bg-black border-white/10"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressedBase64 = await compressImage(file);
                                setExternalEventForm({ ...externalEventForm, imageUrl: compressedBase64 });
                              } catch (error) {
                                toast.error('Erro ao processar imagem');
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => setExternalEventDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleCreateExternalEvent} disabled={createExternalEvent.isPending} className="font-bold bg-primary hover:bg-primary/90 text-white">
                        {createExternalEvent.isPending ? "Adicionando..." : "Criar Evento Externo"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-white/[0.02] border-b border-white/10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-neutral-400 font-semibold py-4 pl-6">Evento</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Equipe Organizadora</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Data</TableHead>
                      <TableHead className="text-neutral-400 font-semibold py-4">Status</TableHead>
                      <TableHead className="text-right text-neutral-400 font-semibold py-4 pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev: any) => (
                      <TableRow key={ev.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <TableCell className="py-4 pl-6 font-bold text-white text-base max-w-[250px] truncate" title={ev.name}>{ev.name}</TableCell>
                        <TableCell className="py-4 text-neutral-300">{ev.organizerName || "Desconhecida"}</TableCell>
                        <TableCell className="py-4 text-neutral-300">{new Date(ev.startDate).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className={`px-3 py-1 font-bold ${ev.status === 'open' ? 'border-emerald-500/50 text-emerald-400' : ev.status === 'closed' ? 'border-amber-500/50 text-amber-400' : 'border-red-500/50 text-red-400'}`}>
                            {ev.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white hover:bg-white/10" onClick={() => { setSelectedEvent(ev); setEditEventDialog(true); }}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10" onClick={() => { setSelectedEvent(ev); setDeleteEventDialog(true); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* DIALOGS */}
      {/* Edit Role Dialog */}
      <Dialog open={editRoleDialog} onOpenChange={setEditRoleDialog}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Editar Permissões</DialogTitle>
            <DialogDescription className="text-neutral-400">Modifique o grau de acesso do usuário <strong>{selectedUser?.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Label className="text-neutral-300 mb-3 block">Cargo no Sistema</Label>
            <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
              <SelectTrigger className="bg-black border-white/10 text-white h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-white/10 text-white">
                <SelectItem value="user">Usuário Básico</SelectItem>
                <SelectItem value="participant">Participante Ativo</SelectItem>
                <SelectItem value="organizer">Organizador de Eventos</SelectItem>
                <SelectItem value="admin">Administrador Global</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => setEditRoleDialog(false)}>Cancelar</Button>
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold" onClick={() => selectedUser && updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole })} disabled={updateRoleMutation.isPending}>
              {updateRoleMutation.isPending ? "Aplicando..." : "Confirmar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Dialog */}
      <Dialog open={deleteEventDialog} onOpenChange={setDeleteEventDialog}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-500 flex items-center gap-2"><Trash2 className="w-6 h-6" /> Perigo: Excluir Evento</DialogTitle>
            <DialogDescription className="text-neutral-400 mt-2 text-base">
              Você está prestes a excluir permanentemente o evento <strong>{selectedEvent?.name}</strong>. Todas as inscrições, pagamentos e dados serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-6">
            <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => setDeleteEventDialog(false)}>Cancelar</Button>
            <Button variant="destructive" className="font-bold" onClick={() => selectedEvent && deleteEventMutation.mutate({ eventId: selectedEvent.id })} disabled={deleteEventMutation.isPending}>
              {deleteEventMutation.isPending ? "Excluindo..." : "Sim, Excluir Evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Request Dialog */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-emerald-400 flex items-center gap-2"><Check className="w-6 h-6" /> Aprovar Equipe</DialogTitle>
            <DialogDescription className="text-neutral-400 mt-2 text-base">
              Ao aprovar <strong>{selectedRequest?.organizerName}</strong>, o solicitante receberá acesso instantâneo ao Painel do Organizador e poderá criar/lucrar com provas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-6">
            <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => setApproveDialog(false)}>Cancelar</Button>
            <Button className="font-bold bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleApprove} disabled={approveRequestMutation.isPending}>
              {approveRequestMutation.isPending ? "Aprovando..." : "Conceder Acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Request Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-500 flex items-center gap-2"><X className="w-6 h-6" /> Rejeitar Solicitação</DialogTitle>
            <DialogDescription className="text-neutral-400 mt-2 text-base">
              Informe o motivo da rejeição para a equipe <strong>{selectedRequest?.organizerName}</strong>. Isso será enviado por e-mail para eles.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-neutral-300 mb-2 block">Motivo da Rejeição</Label>
            <Textarea
              placeholder="Ex: Dados incompletos, faltam links sociais..."
              className="bg-black border-white/10 text-white min-h-[100px] resize-none focus-visible:ring-red-500/50"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => setRejectDialog(false)}>Cancelar</Button>
            <Button variant="destructive" className="font-bold" onClick={handleReject} disabled={rejectRequestMutation.isPending || !rejectionReason.trim()}>
              {rejectRequestMutation.isPending ? "Rejeitando..." : "Bloquear Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <EventEditDialog
        open={editEventDialog}
        onOpenChange={setEditEventDialog}
        event={selectedEvent}
        onSuccess={() => refetchEvents()}
      />

    </div>
  );
}

// Helper Component for Stats
function StatCard({ title, value, icon: Icon, color, bg, border }: any) {
  return (
    <Card className={`bg-white/[0.03] backdrop-blur-md rounded-3xl border ${border} overflow-hidden shadow-lg relative group transition-all duration-300 hover:bg-white/[0.05]`}>
      <CardContent className="p-6 relative z-10">
        <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <p className="text-neutral-400 font-medium text-sm mb-1">{title}</p>
        <h3 className="text-3xl font-black text-white tracking-tight">{value}</h3>
      </CardContent>
      <div className={`absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 ${bg} rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity`} />
    </Card>
  );
}
