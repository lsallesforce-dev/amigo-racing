import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Users, Calendar, Trash2, Edit, TrendingUp, DollarSign, FileText, ArrowLeft } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect, useLocation } from "wouter";

// AdminPanel - Versão corrigida para produção
export default function AdminPanel() {
  const { user, loading } = useAuth();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [editRoleDialog, setEditRoleDialog] = useState(false);
  const [deleteEventDialog, setDeleteEventDialog] = useState(false);
  const [newRole, setNewRole] = useState<"user" | "admin" | "participant" | "organizer">("user");

  // Queries - só executam se user for admin
  const { data: users = [], refetch: refetchUsers } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === 'admin'
  });
  const { data: events = [], refetch: refetchEvents } = trpc.admin.listAllEvents.useQuery(undefined, {
    enabled: user?.role === 'admin'
  });
  const { data: dashboardStats } = trpc.admin.getDashboardStats.useQuery(undefined, {
    enabled: user?.role === 'admin'
  });

  // Mutations
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("✅ Role atualizada com sucesso!");
      refetchUsers();
      setEditRoleDialog(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error(`❌ Erro ao atualizar role: ${error.message}`);
    },
  });

  const deleteEventMutation = trpc.admin.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("✅ Evento deletado com sucesso!");
      refetchEvents();
      setDeleteEventDialog(false);
      setSelectedEvent(null);
    },
    onError: (error) => {
      toast.error(`❌ Erro ao deletar evento: ${error.message}`);
    },
  });

  // Mostrar loading enquanto verifica autenticação
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Verificar se usuário é admin
  if (!user || user.role !== "admin") {
    return <Redirect to="/" />;
  }

  const handleEditRole = (user: any) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setEditRoleDialog(true);
  };

  const handleSaveRole = () => {
    if (!selectedUser) return;
    updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
  };

  const handleDeleteEvent = (event: any) => {
    setSelectedEvent(event);
    setDeleteEventDialog(true);
  };

  const confirmDeleteEvent = () => {
    if (!selectedEvent) return;
    deleteEventMutation.mutate({ eventId: selectedEvent.id });
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, any> = {
      admin: "destructive",
      organizer: "default",
      participant: "secondary",
      user: "outline",
    };
    return <Badge variant={variants[role] || "outline"}>{role.toUpperCase()}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      open: "default",
      closed: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status.toUpperCase()}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100">
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold">Painel de Administrador</h1>
          </div>
          <p className="text-muted-foreground">Gerencie usuários e eventos da plataforma</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Eventos
            </TabsTrigger>
          </TabsList>

          {/* Tab: Dashboard */}
          <TabsContent value="dashboard">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
              {/* Card: Total Usuários */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.totalUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">Cadastrados na plataforma</p>
                </CardContent>
              </Card>

              {/* Card: Total Eventos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Eventos</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.totalEvents || 0}</div>
                  <p className="text-xs text-muted-foreground">Criados na plataforma</p>
                </CardContent>
              </Card>

              {/* Card: Total Inscrições */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.totalRegistrations || 0}</div>
                  <p className="text-xs text-muted-foreground">Realizadas na plataforma</p>
                </CardContent>
              </Card>

              {/* Card: Receita Total */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R$ {((dashboardStats?.totalRevenue || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground">Pagamentos confirmados</p>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos e Estatísticas Adicionais */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Card: Eventos por Status */}
              <Card>
                <CardHeader>
                  <CardTitle>Eventos por Status</CardTitle>
                  <CardDescription>Distribuição dos eventos na plataforma</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboardStats?.eventsByStatus && dashboardStats.eventsByStatus.length > 0 ? dashboardStats.eventsByStatus.map((item: any) => (
                      <div key={item.status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(item.status)}
                        </div>
                        <span className="text-2xl font-bold">{item.count}</span>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">Nenhum evento cadastrado</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Card: Inscrições por Mês */}
              <Card>
                <CardHeader>
                  <CardTitle>Inscrições por Mês</CardTitle>
                  <CardDescription>Últimos 6 meses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboardStats?.registrationsByMonth && dashboardStats.registrationsByMonth.length > 0 ? dashboardStats.registrationsByMonth.map((item: any) => (
                      <div key={item.month} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.month}</span>
                        <span className="text-2xl font-bold">{item.count}</span>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">Nenhuma inscrição nos últimos 6 meses</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Usuários */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Usuários</CardTitle>
                <CardDescription>Visualize e edite roles de todos os usuários cadastrados</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.id}</TableCell>
                        <TableCell className="font-medium">{user.name || "Sem nome"}</TableCell>
                        <TableCell>{user.email || "Sem email"}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleEditRole(user)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar Role
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Eventos */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Eventos</CardTitle>
                <CardDescription>Visualize e gerencie todos os eventos da plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Organizador</TableHead>
                      <TableHead>Dono</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.id}</TableCell>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>{event.organizerName || "N/A"}</TableCell>
                        <TableCell>{event.ownerName || "N/A"}</TableCell>
                        <TableCell>{new Date(new Date(event.startDate).getTime() + 3 * 60 * 60 * 1000).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>{getStatusBadge(event.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteEvent(event)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deletar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog: Editar Role */}
        <Dialog open={editRoleDialog} onOpenChange={setEditRoleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Role do Usuário</DialogTitle>
              <DialogDescription>
                Altere a role de <strong>{selectedUser?.name || "usuário"}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="block text-sm font-medium mb-2">Nova Role</label>
              <Select value={newRole} onValueChange={(value: any) => setNewRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="participant">Participant</SelectItem>
                  <SelectItem value="organizer">Organizer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRoleDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveRole} disabled={updateRoleMutation.isPending}>
                {updateRoleMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Confirmar Deleção de Evento */}
        <Dialog open={deleteEventDialog} onOpenChange={setDeleteEventDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Deleção</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja deletar o evento <strong>{selectedEvent?.name}</strong>?
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteEventDialog(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDeleteEvent} disabled={deleteEventMutation.isPending}>
                {deleteEventMutation.isPending ? "Deletando..." : "Deletar Evento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
