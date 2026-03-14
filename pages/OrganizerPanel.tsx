import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { Calendar, MapPin, Plus, Loader2, Users, DollarSign, Trash2, Pencil, ShoppingBag, Trophy, ClipboardCheck, Upload, X, CalendarDays, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { EventGalleryManager } from "@/components/EventGalleryManager";
import { EventDocumentsManager } from "@/components/EventDocumentsManager";
import { EventNavigationFilesManager } from "@/components/EventNavigationFilesManager";
import { OrganizerMembersManager } from "@/components/OrganizerMembersManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compressImage } from '@/lib/imageCompression';
import Navbar from "@/components/Navbar";
import { EventEditDialog } from "@/components/events/EventEditDialog";

// Type for event with categories (extended from base type)
type EventWithCategories = {
  id: number;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  location: string;
  city: string;
  state: string | null;
  status: "open" | "closed" | "cancelled";
  isExternal: boolean;
  hasShirts: boolean;
  imageUrl: string | null;
  organizerId: number;
  createdAt: Date;
  updatedAt: Date;
  categories?: Array<{
    id: number;
    name: string;
    description: string | null;
    price: number | null;
    slots: number | null;
    parentId: number | null;
    eventId: number;
    createdAt: Date;
  }>;
  registrationCount?: number;
};


// OrganizerPanel - Versão corrigida para produção
export default function OrganizerPanel() {
  const { user, isAuthenticated, loading, logout } = useAuth();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      window.location.href = '/';
    },
  });

  const { data: organizers } = trpc.organizers.myOrganizers.useQuery(undefined, { enabled: isAuthenticated });
  const { data: events, isLoading: eventsLoading } = trpc.events.myEvents.useQuery(undefined, { enabled: isAuthenticated });

  const { data: myContext } = trpc.organizerMembers.myContext.useQuery(undefined, { enabled: isAuthenticated });

  const { data: myPermissions } = trpc.organizerMembers.myPermissions.useQuery(undefined, { enabled: isAuthenticated });
  const isPrincipal = myPermissions?.includes('principal') || false;
  const canFinance = myPermissions?.includes('finance') || isPrincipal;
  const canStore = myPermissions?.includes('store') || isPrincipal;
  const canRegistrations = myPermissions?.includes('registrations') || isPrincipal;
  const canEvents = myPermissions?.includes('events') || isPrincipal;

  const principalUserId = myContext?.principalUserId || user?.id || 0;

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [externalEventDialogOpen, setExternalEventDialogOpen] = useState(false);
  const [championshipDialogOpen, setChampionshipDialogOpen] = useState(false);
  const [editEventDialogOpen, setEditEventDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(0);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showExternal, setShowExternal] = useState(false);
  const { data: eventCategories } = trpc.categories.listByEvent.useQuery(
    { eventId: editingEvent?.id || 0 },
    { enabled: !!editingEvent?.id }
  );

  const [eventForm, setEventForm] = useState({
    name: "",
    description: "",
    startDate: "",
    startTime: "08:00",
    endDate: "",
    endTime: "18:00",
    location: "",
    city: "",
    state: "",
    imageUrl: "",
    showRegistrations: true,
    allowCancellation: false,
    hasShirts: true,
  });

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

  const [categoryForm, setCategoryForm] = useState({
    vehicleType: "" as "Carros" | "Motos" | "Outra" | "",
    customVehicleType: "",
    level: "" as "Master" | "Graduado" | "Turismo" | "Rally" | "Light" | "Outra" | "",
    customLevel: "",
    price: "",
    slots: "",
    eventId: 0,
  });

  const [championshipForm, setChampionshipForm] = useState({
    name: "",
    year: new Date().getFullYear().toString(),
    discardRule: "0",
  });

  const [pagseguroEmail, setPagseguroEmail] = useState("");

  const [bankConfigForm, setBankConfigForm] = useState({
    legalName: "",
    document: "",
    bank: "",
    agency: "",
    agencyDigit: "",
    account: "",
    accountDigit: "",
    accountType: "" as "checking" | "savings" | "",
    phone: "",
    pixKey: "",
  });

  const [isBankConfigured, setIsBankConfigured] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingExternalImage, setIsUploadingExternalImage] = useState(false);


  const { data: championships, isLoading: championshipsLoading } = trpc.championships.getAllByOrganizer.useQuery(
    { organizerId: principalUserId },
    { enabled: !!principalUserId }
  );


  const utils = trpc.useUtils();
  const uploadImage = trpc.upload.image.useMutation();

  // Carregar dados bancários existentes quando o usuário estiver autenticado
  useEffect(() => {
    if (user) {
      // Se o usuário já tem recipient configurado, marcar como configurado
      if (user.recipientId) {
        setIsBankConfigured(true);
      }

      // Carregar os dados existentes para o formulário para não zerar
      setBankConfigForm(prev => ({
        ...prev,
        legalName: user.bankHolderName || user.name || "",
        document: user.bankDocument || "",
        bank: user.bankCode || "",
        agency: user.bankAgency || "",
        agencyDigit: user.bankAgencyDv || "",
        account: user.bankAccount || "",
        accountDigit: user.bankAccountDv || "",
        accountType: (user.bankAccountType === 'checking' || user.bankAccountType === 'conta_corrente' ? 'checking' : user.bankAccountType === 'savings' || user.bankAccountType === 'conta_poupanca' ? 'savings' : "") as any,
        phone: user.phone || "",
        pixKey: user.pixKey || "",
      }));
    }
  }, [user]);

  const createEvent = trpc.events.create.useMutation({
    onSuccess: () => {
      toast.success("Evento criado com sucesso!");
      setEventDialogOpen(false);
      setEventForm({
        name: "",
        description: "",
        startDate: "",
        startTime: "08:00",
        endDate: "",
        endTime: "18:00",
        location: "",
        city: "",
        state: "",
        imageUrl: "",
        showRegistrations: true,
        allowCancellation: false,
        hasShirts: true,
      });
      utils.events.myEvents.invalidate();
      utils.events.listOpen.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar evento");
    },
  });

  const updatePagSeguroEmailMutation = trpc.organizers.updatePagSeguroEmail.useMutation({
    onSuccess: () => {
      toast.success("Email PagSeguro atualizado com sucesso!");
      utils.organizers.myOrganizers.invalidate();
      setPagseguroEmail("");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar email PagSeguro");
    },
  });

  const setupRecipient = trpc.payments.setupRecipient.useMutation({
    onSuccess: () => {
      toast.success("Configuração bancária salva com sucesso!");
      utils.organizers.myOrganizers.invalidate();
      utils.auth.me.invalidate(); // Garante que o usuário local receba o novo telefone/recipientId
      setIsBankConfigured(true);
      setIsEditingBank(false);
      // Não limpa o formulário para mostrar os dados cadastrados
    },
    onError: (error: any) => {
      console.error("Erro ao configurar conta Pagar.me:", error);

      // Mensagem específica para erro de permissão
      if (error.message && error.message.includes("403")) {
        toast.error(
          "Erro de permiss\u00e3o: A chave API do Pagar.me n\u00e3o tem permiss\u00f5es para criar recipients. Verifique as configura\u00e7\u00f5es da sua conta no painel Pagar.me.",
          { duration: 8000 }
        );
      } else if (error.message && error.message.includes("401")) {
        toast.error(
          "Erro de autentica\u00e7\u00e3o: Verifique se o IP do servidor est\u00e1 autorizado no painel Pagar.me.",
          { duration: 6000 }
        );
      } else {
        toast.error(error.message || "Erro ao salvar configura\u00e7\u00e3o banc\u00e1ria. Verifique os dados e tente novamente.");
      }
    },
  });

  const handleSaveBankConfig = () => {
    if (!bankConfigForm.document || !bankConfigForm.bank || !bankConfigForm.agency ||
      !bankConfigForm.account || !bankConfigForm.accountDigit || !bankConfigForm.accountType) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const cleanDocument = bankConfigForm.document.replace(/\D/g, '');
    const cleanBankCode = bankConfigForm.bank.replace(/\D/g, ''); // Extrair apenas números

    setupRecipient.mutate({
      document: cleanDocument,
      phone: bankConfigForm.phone.replace(/\D/g, ''),
      pixKey: bankConfigForm.pixKey || undefined,
      bankAccount: {
        bank_code: cleanBankCode,
        agencia: bankConfigForm.agency.replace(/\D/g, ''),
        agencia_dv: bankConfigForm.agencyDigit.replace(/\D/g, ''),
        conta: bankConfigForm.account.replace(/\D/g, ''),
        conta_dv: bankConfigForm.accountDigit.replace(/\D/g, ''),
        type: bankConfigForm.accountType === "checking" ? "conta_corrente" : "conta_poupanca",
        legal_name: bankConfigForm.legalName || user?.name || 'Organizador',
        document_number: cleanDocument,
      },
    });
  };

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
      utils.events.myEvents.invalidate();
      utils.events.listOpen.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao adicionar evento externo");
    },
  });

  const createCategory = trpc.categories.create.useMutation({
    onSuccess: () => {
      toast.success("Categoria criada com sucesso!");
      setCategoryDialogOpen(false);
      setCategoryForm({ vehicleType: "", customVehicleType: "", level: "", customLevel: "", price: "", slots: "", eventId: 0 });
      utils.events.myEvents.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar categoria");
    },
  });

  const createChampionship = trpc.championships.create.useMutation({
    onSuccess: () => {
      toast.success("Campeonato criado com sucesso!");
      setChampionshipDialogOpen(false);
      setChampionshipForm({ name: "", year: new Date().getFullYear().toString(), discardRule: "0" });
      utils.championships.getAllByOrganizer.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar campeonato");
    },
  });

  const handleCreateChampionship = () => {
    if (!championshipForm.name || !championshipForm.year) {
      toast.error("Preencha o nome e o ano do campeonato");
      return;
    }

    const yearNum = parseInt(championshipForm.year, 10);
    const discardNum = parseInt(championshipForm.discardRule, 10);

    if (isNaN(yearNum) || yearNum < 2000) {
      toast.error("Informe um ano válido");
      return;
    }

    createChampionship.mutate({
      name: championshipForm.name,
      year: yearNum,
      organizerId: principalUserId,
      discardRule: isNaN(discardNum) ? 0 : discardNum,
    });
  };

  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoria excluída com sucesso!");
      utils.events.myEvents.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir categoria");
    },
  });

  const deleteEvent = trpc.events.delete.useMutation({
    onSuccess: async () => {
      toast.success("Evento deletado com sucesso!");
      // Invalidar e forçar refetch imediato
      await utils.events.myEvents.invalidate();
      await utils.events.listOpen.refetch();
      await utils.events.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao deletar evento");
    },
  });




  const handleCreateEvent = async () => {
    console.log("[OrganizerPanel] handleCreateEvent clicado");

    // Validação detalhada para ajudar o usuário
    const missing = [];
    if (!eventForm.name) missing.push("Nome");
    if (!eventForm.startDate) missing.push("Data de Início");
    if (!eventForm.endDate) missing.push("Data de Fim");
    if (!eventForm.location) missing.push("Local");
    if (!eventForm.city) missing.push("Cidade");

    if (missing.length > 0) {
      console.log("[OrganizerPanel] Validação falhou:", eventForm);
      toast.error(`Por favor, preencha: ${missing.join(", ")}. (Lembre-se de selecionar a HORA nas datas)`);
      return;
    }

    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    // Imagem já está em base64 — salvar diretamente, sem storage externo
    const imageUrl = eventForm.imageUrl;

    // Combinar data e hora
    const startDateTime = `${eventForm.startDate}T${eventForm.startTime || "00:00"}`;
    const endDateTime = `${eventForm.endDate}T${eventForm.endTime || "23:59"}`;

    console.log("[OrganizerPanel] Enviando mutação createEvent:", {
      ...eventForm,
      startDate: startDateTime,
      endDate: endDateTime,
      imageUrl: imageUrl || undefined,
    });

    createEvent.mutate({
      ...eventForm,
      imageUrl: imageUrl || undefined,
      startDate: startDateTime,
      endDate: endDateTime,
    });
  };

  const handleCreateExternalEvent = async () => {
    if (!externalEventForm.name || !externalEventForm.startDate || !externalEventForm.endDate || !externalEventForm.location || !externalEventForm.city) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Imagem já está em base64 — salvar diretamente, sem storage externo
    const imageUrl = externalEventForm.imageUrl;

    // Combinar data e hora
    const startDateTime = `${externalEventForm.startDate}T${externalEventForm.startTime || "00:00"}`;
    const endDateTime = `${externalEventForm.endDate}T${externalEventForm.endTime || "23:59"}`;

    createExternalEvent.mutate({
      ...externalEventForm,
      imageUrl: imageUrl || undefined,
      startDate: startDateTime,
      endDate: endDateTime,
    });
  };

  const { data: championshipsList, isLoading: isChampsLoading } = trpc.championships.getAllActive.useQuery();

  const requestToJoin = trpc.championships.requestToJoinChampionship.useMutation({
    onSuccess: () => {
      toast.success("Solicitação de vínculo enviada ao organizador do campeonato!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao solicitar vínculo");
    },
  });

  console.log('Campeonatos (Modal):', championshipsList, 'Usando organizerId:', principalUserId);

  const handleEditClick = (event: any) => {
    setEditingEvent(event);
    setEditEventDialogOpen(true);
  };


  const handleCreateCategory = async () => {
    // Validar campos obrigatórios
    if (!categoryForm.vehicleType || !categoryForm.level || !categoryForm.eventId) {
      toast.error("Selecione o tipo de veículo e o nível");
      return;
    }

    // Validar campos personalizados
    if (categoryForm.vehicleType === "Outra" && !categoryForm.customVehicleType.trim()) {
      toast.error("Preencha o nome da categoria personalizada");
      return;
    }

    if (categoryForm.level === "Outra" && !categoryForm.customLevel.trim()) {
      toast.error("Preencha o nome da subcategoria personalizada");
      return;
    }

    const price = parseFloat(categoryForm.price as string);
    const slots = parseInt(categoryForm.slots as string);

    if (isNaN(price) || isNaN(slots) || price <= 0 || slots <= 0) {
      toast.error("Preencha preço e vagas corretamente");
      return;
    }

    // Determinar nome da categoria pai (fixo ou personalizado)
    const parentCategoryName = categoryForm.vehicleType === "Outra"
      ? categoryForm.customVehicleType.trim()
      : categoryForm.vehicleType;

    // Determinar nome da subcategoria (fixo ou personalizado)
    const subcategoryName = categoryForm.level === "Outra"
      ? categoryForm.customLevel.trim()
      : categoryForm.level;

    // Verificar se categoria pai existe
    const event = events?.find(e => e.id === categoryForm.eventId) as any as (EventWithCategories | undefined);
    let parentCategory = event?.categories?.find((c: any) =>
      c.name === parentCategoryName && !c.parentId && c.price === null
    );
    let updatedEvent = event;

    // Se categoria pai não existe, criar primeiro
    let parentCategoryId: number | undefined;
    if (!parentCategory) {
      try {
        const result = await createCategory.mutateAsync({
          name: parentCategoryName,
          description: `Categoria para ${parentCategoryName.toLowerCase()}`,
          eventId: categoryForm.eventId,
        }, {});

        // Usar o insertId retornado diretamente
        parentCategoryId = (result as any).insertId;

        if (!parentCategoryId) {
          toast.error("Erro ao obter ID da categoria pai");
          return;
        }
      } catch (error) {
        toast.error("Erro ao criar categoria pai");
        return;
      }
    } else {
      parentCategoryId = parentCategory.id;
    }

    // Criar subcategoria usando o parentCategoryId
    createCategory.mutate({
      name: subcategoryName,
      description: `Categoria ${subcategoryName} para ${parentCategoryName.toLowerCase()}`,
      price,
      slots,
      parentId: parentCategoryId,
      eventId: categoryForm.eventId,
    }, {
      onSuccess: () => {
        toast.success("Categoria criada com sucesso!");
        setCategoryDialogOpen(false);
        setCategoryForm({ vehicleType: "", customVehicleType: "", level: "", customLevel: "", price: "", slots: "", eventId: 0 });
      },
      onError: (error: any) => {
        console.error("Erro ao criar subcategoria:", error);
        toast.error(`Erro ao criar subcategoria: ${error.message || 'Tente novamente'}`);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== 'organizer' && user?.role !== 'admin')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-muted-foreground mb-4">
              Acesso restrito a organizadores
            </p>
            {!isAuthenticated ? (
              <Button asChild>
                <a href={getLoginUrl()}>Entrar</a>
              </Button>
            ) : (
              <Link href="/dashboard">
                <Button>Voltar ao Painel do Competidor</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar se usuário tem permissão (organizer ou admin)
  if (!loading && isAuthenticated && user && user.role !== 'organizer' && user.role !== 'admin') {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Acesso Restrito</h2>
            <p className="text-muted-foreground mb-4">
              Você não tem permissão para acessar o Painel Organizador.
            </p>
            <p className="text-muted-foreground mb-6">
              Solicite acesso como organizador para criar e gerenciar eventos.
            </p>
            <Button onClick={() => window.location.href = '/become-organizer'}>
              Solicitar Acesso como Organizador
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Painel do Organizador</h1>
            <p className="text-muted-foreground">Gerencie seus eventos e campeonatos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPrincipal && <OrganizerMembersManager />}

            {canEvents && (
              <Dialog open={championshipDialogOpen} onOpenChange={setChampionshipDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Trophy className="h-4 w-4" />
                    Criar Campeonato
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Novo Campeonato</DialogTitle>
                    <DialogDescription>Crie um novo campeonato para agregar etapas e somar pontos.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="champ-name">Nome do Campeonato *</Label>
                      <Input
                        id="champ-name"
                        value={championshipForm.name}
                        onChange={e => setChampionshipForm({ ...championshipForm, name: e.target.value })}
                        placeholder="Ex: Copa Paulista Off-Road"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="champ-year">Ano *</Label>
                        <Input
                          id="champ-year"
                          type="number"
                          min="2000"
                          value={championshipForm.year}
                          onChange={e => setChampionshipForm({ ...championshipForm, year: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="champ-discard">Regra de Descarte</Label>
                        <Input
                          id="champ-discard"
                          type="number"
                          min="0"
                          value={championshipForm.discardRule}
                          onChange={e => setChampionshipForm({ ...championshipForm, discardRule: e.target.value })}
                          placeholder="Ex: 1"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setChampionshipDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreateChampionship} disabled={createChampionship.isPending}>
                      {createChampionship.isPending ? "Criando..." : "Criar Campeonato"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {canEvents && (
              <Dialog open={externalEventDialogOpen} onOpenChange={setExternalEventDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Evento Externo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Adicionar Evento Externo</DialogTitle>
                    <DialogDescription>
                      Adicione eventos externos ao calendário (sem inscrição pelo site)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="ext-name">Nome do Evento *</Label>
                      <Input
                        id="ext-name"
                        value={externalEventForm.name}
                        onChange={(e) => setExternalEventForm({ ...externalEventForm, name: e.target.value })}
                        placeholder="Ex: Rally dos Sertões 2026"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ext-description">Descrição</Label>
                      <Textarea
                        id="ext-description"
                        value={externalEventForm.description}
                        onChange={(e) => setExternalEventForm({ ...externalEventForm, description: e.target.value })}
                        placeholder="Descrição do evento"
                        rows={4}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ext-startDate" className="flex justify-between">
                          <span>Data de Início *</span>
                          <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="ext-startDate"
                            type="date"
                            className="flex-1"
                            value={externalEventForm.startDate}
                            onChange={(e) => setExternalEventForm({ ...externalEventForm, startDate: e.target.value })}
                          />
                          <Input
                            type="time"
                            className="w-[100px]"
                            value={externalEventForm.startTime}
                            onChange={(e) => setExternalEventForm({ ...externalEventForm, startTime: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-endDate" className="flex justify-between">
                          <span>Data de Término *</span>
                          <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="ext-endDate"
                            type="date"
                            className="flex-1"
                            value={externalEventForm.endDate}
                            onChange={(e) => setExternalEventForm({ ...externalEventForm, endDate: e.target.value })}
                          />
                          <Input
                            type="time"
                            className="w-[100px]"
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
                          value={externalEventForm.city}
                          onChange={(e) => setExternalEventForm({ ...externalEventForm, city: e.target.value })}
                          placeholder="Ex: Brasília"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ext-state">Estado</Label>
                        <Input
                          id="ext-state"
                          value={externalEventForm.state}
                          onChange={(e) => setExternalEventForm({ ...externalEventForm, state: e.target.value })}
                          placeholder="Ex: DF"
                          maxLength={2}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Visibilidade</Label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="showInListing"
                            checked={externalEventForm.showInListing === true}
                            onChange={() => setExternalEventForm({ ...externalEventForm, showInListing: true })}
                            className="w-4 h-4"
                          />
                          <span>Calendário + Página Inicial</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="showInListing"
                            checked={externalEventForm.showInListing === false}
                            onChange={() => setExternalEventForm({ ...externalEventForm, showInListing: false })}
                            className="w-4 h-4"
                          />
                          <span>Apenas Calendário</span>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ext-image">Imagem do Evento</Label>
                      <Input
                        id="ext-image"
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              setIsUploadingExternalImage(true);
                              const compressedBase64 = await compressImage(file);
                              const { url } = await uploadImage.mutateAsync({
                                base64: compressedBase64,
                                fileName: `event_external_${file.name}`,
                                contentType: file.type
                              });
                              setExternalEventForm({ ...externalEventForm, imageUrl: url });
                              toast.success('Imagem enviada com sucesso!');
                            } catch (error) {
                              toast.error('Erro ao processar imagem');
                            } finally {
                              setIsUploadingExternalImage(false);
                            }
                          }
                        }}
                      />
                      {isUploadingExternalImage && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Subindo imagem...
                        </div>
                      )}
                      {externalEventForm.imageUrl && !isUploadingExternalImage && (
                        <div className="mt-2 h-32 rounded border bg-muted flex items-center justify-center overflow-hidden">
                          <img 
                            src={externalEventForm.imageUrl} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">Recomendado: 1200x600px (formato 2:1)</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateExternalEvent} disabled={createExternalEvent.isPending || isUploadingExternalImage}>
                      {createExternalEvent.isPending ? "Adicionando..." : isUploadingExternalImage ? "Enviando Imagem..." : "Adicionar Evento Externo"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Dialog de Edição de Evento */}
            <EventEditDialog
              open={editEventDialogOpen}
              onOpenChange={setEditEventDialogOpen}
              event={editingEvent}
            />

            <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Evento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Criar Novo Evento</DialogTitle>
                  <DialogDescription>
                    Preencha as informações do evento
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-name">Nome do Evento *</Label>
                    <Input
                      id="event-name"
                      value={eventForm.name}
                      onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                      placeholder="Ex: Rally do Amigo 2026"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-description">Descrição</Label>
                    <Textarea
                      id="event-description"
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                      placeholder="Descreva o evento..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start-date" className="flex justify-between">
                        <span>Data Início *</span>
                        <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="start-date"
                          type="date"
                          className="flex-1"
                          value={eventForm.startDate}
                          onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                        />
                        <Input
                          type="time"
                          className="w-[100px]"
                          value={eventForm.startTime}
                          onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-date" className="flex justify-between">
                        <span>Data Fim *</span>
                        <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="end-date"
                          type="date"
                          className="flex-1"
                          value={eventForm.endDate}
                          onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                        />
                        <Input
                          type="time"
                          className="w-[100px]"
                          value={eventForm.endTime}
                          onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Local *</Label>
                    <Input
                      id="location"
                      value={eventForm.location}
                      onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                      placeholder="Ex: Fazenda Santa Rita, Km 45"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade *</Label>
                      <Input
                        id="city"
                        value={eventForm.city}
                        onChange={(e) => setEventForm({ ...eventForm, city: e.target.value })}
                        placeholder="Ex: São José do Rio Preto"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input
                        id="state"
                        value={eventForm.state}
                        onChange={(e) => setEventForm({ ...eventForm, state: e.target.value })}
                        placeholder="Ex: SP"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-image">Imagem do Evento</Label>
                    <Input
                      id="event-image"
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            setIsUploadingImage(true);
                            const compressedBase64 = await compressImage(file);
                            const { url } = await uploadImage.mutateAsync({
                              base64: compressedBase64,
                              fileName: `event_main_${file.name}`,
                              contentType: file.type
                            });
                            setEventForm({ ...eventForm, imageUrl: url });
                            toast.success('Imagem enviada com sucesso!');
                          } catch (error) {
                            toast.error('Erro ao processar imagem');
                          } finally {
                            setIsUploadingImage(false);
                          }
                        }
                      }}
                    />
                    {isUploadingImage && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Subindo imagem...
                      </div>
                    )}
                    {eventForm.imageUrl && !isUploadingImage && (
                      <div className="mt-2 h-32 rounded border bg-muted flex items-center justify-center overflow-hidden">
                        <img 
                          src={eventForm.imageUrl} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">Recomendado: 1200x600px (formato 2:1)</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="show-registrations"
                      checked={eventForm.showRegistrations ?? true}
                      onChange={(e) => setEventForm({ ...eventForm, showRegistrations: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="show-registrations" className="text-sm font-normal cursor-pointer">
                      Permitir que competidores vejam a lista de inscritos
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="allow-cancellation"
                      checked={eventForm.allowCancellation ?? false}
                      onChange={(e) => setEventForm({ ...eventForm, allowCancellation: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="allow-cancellation" className="text-sm font-normal cursor-pointer">
                      Permitir que competidores solicitem cancelamento da inscrição
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="has-shirts"
                      checked={eventForm.hasShirts ?? true}
                      onChange={(e) => setEventForm({ ...eventForm, hasShirts: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="has-shirts" className="text-sm font-normal cursor-pointer">
                      Evento possui camiseta (Habilita a escolha de tamanhos na inscrição)
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateEvent} disabled={createEvent.isPending || isUploadingImage}>
                    {createEvent.isPending ? "Criando..." : isUploadingImage ? "Enviando Imagem..." : "Criar Evento"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Pagar.me Configuration Card */}
        {organizers && organizers.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Configurações de Pagamento</CardTitle>
              <CardDescription>
                Configure seus dados bancários para receber repasses automáticos (90% do valor das inscrições)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isBankConfigured && !isEditingBank ? (
                // Modo visualização
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="default" className="bg-green-600">Conta Configurada ✓</Badge>
                    <Button variant="outline" size="sm" onClick={() => setIsEditingBank(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar Configurações
                    </Button>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Sua conta de recebedor foi configurada com sucesso no Pagar.me.
                      Você receberá automaticamente 90% do valor de cada inscrição.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Por questões de segurança, os dados bancários completos não são exibidos.
                      Se precisar alterar, clique em "Editar Configurações".
                    </p>
                  </div>
                </div>
              ) : (
                // Modo edição
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="legalName">Nome do Titular *</Label>
                    <Input
                      id="legalName"
                      placeholder="Nome exato como consta na conta bancária"
                      value={bankConfigForm.legalName}
                      onChange={(e) => setBankConfigForm({ ...bankConfigForm, legalName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="document">CPF ou CNPJ *</Label>
                    <Input
                      id="document"
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      value={bankConfigForm.document}
                      onChange={(e) => setBankConfigForm({ ...bankConfigForm, document: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bank">Banco *</Label>
                      <Input
                        id="bank"
                        placeholder="Ex: 001 (Banco do Brasil)"
                        value={bankConfigForm.bank}
                        onChange={(e) => setBankConfigForm({ ...bankConfigForm, bank: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agency">Agência *</Label>
                      <Input
                        id="agency"
                        placeholder="Ex: 1234"
                        value={bankConfigForm.agency}
                        onChange={(e) => setBankConfigForm({ ...bankConfigForm, agency: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agencyDigit">Dígito</Label>
                      <Input
                        id="agencyDigit"
                        placeholder="Ex: 5"
                        maxLength={1}
                        value={bankConfigForm.agencyDigit}
                        onChange={(e) => setBankConfigForm({ ...bankConfigForm, agencyDigit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="account">Conta *</Label>
                      <Input
                        id="account"
                        placeholder="Ex: 12345678"
                        value={bankConfigForm.account}
                        onChange={(e) => setBankConfigForm({ ...bankConfigForm, account: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountDigit">Dígito *</Label>
                      <Input
                        id="accountDigit"
                        placeholder="Ex: 9"
                        maxLength={2}
                        value={bankConfigForm.accountDigit}
                        onChange={(e) => setBankConfigForm({ ...bankConfigForm, accountDigit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountType">Tipo de Conta *</Label>
                    <Select
                      value={bankConfigForm.accountType}
                      onValueChange={(value) => setBankConfigForm({ ...bankConfigForm, accountType: value as 'checking' | 'savings' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Conta Corrente</SelectItem>
                        <SelectItem value="savings">Conta Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone de Contato *</Label>
                    <Input
                      id="phone"
                      placeholder="Ex: 11999999999"
                      value={bankConfigForm.phone}
                      onChange={(e) => setBankConfigForm({ ...bankConfigForm, phone: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Necessário para a conta Pagar.me (apenas números com DDD)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pixKey">Chave PIX (opcional)</Label>
                    <Input
                      id="pixKey"
                      placeholder="CPF, CNPJ, email, telefone ou chave aleatória"
                      value={bankConfigForm.pixKey}
                      onChange={(e) => setBankConfigForm({ ...bankConfigForm, pixKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Informe sua chave PIX para facilitar transferências futuras
                    </p>
                  </div>
                  {/* Recipient ID - somente leitura */}
                  <div className="space-y-2">
                    <Label>ID do Recebedor Pagar.me</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={user?.recipientId || ''}
                        placeholder="Ainda não configurado — salve os dados acima para gerar"
                        className="bg-muted text-muted-foreground font-mono text-xs cursor-default"
                      />
                      {user?.recipientId ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/30">
                          ✓ Ativo
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400 border border-yellow-500/30">
                          ⏳ Pendente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ID gerado automaticamente pelo Pagar.me após salvar os dados bancários
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Estes dados serão usados para criar sua conta de recebedor no Pagar.me. Você receberá automaticamente 90% do valor de cada inscrição.
                    Os 10% restantes ficam com a plataforma como taxa administrativa.
                  </p>

                  <Button
                    onClick={handleSaveBankConfig}
                    disabled={setupRecipient.isPending || !bankConfigForm.document || !bankConfigForm.bank || !bankConfigForm.agency || !bankConfigForm.account || !bankConfigForm.accountDigit || !bankConfigForm.accountType}
                  >
                    {setupRecipient.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar Configurações'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="events" className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b mb-8 gap-4">
            <TabsList className="justify-start border-0 rounded-none h-auto p-0 bg-transparent gap-6">
              <TabsTrigger
                value="events"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-semibold transition-none shadow-none"
              >
                Eventos
              </TabsTrigger>
              <TabsTrigger
                value="championships"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-semibold transition-none shadow-none"
              >
                Campeonatos
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center space-x-2 pb-2 sm:pb-0 px-4">
              <input
                type="checkbox"
                id="show-external"
                checked={showExternal}
                onChange={(e) => setShowExternal(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="show-external" className="text-sm text-muted-foreground cursor-pointer">
                Exibir eventos externos
              </Label>
            </div>
          </div>

          <TabsContent value="events">
            {/* Events List Content */}
            {eventsLoading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (events && events.length > 0) ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                {(events as any as EventWithCategories[])
                  .filter((event) => showExternal ? true : !event.isExternal)
                  .map((event) => (
                  <Card key={event.id} className="overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="mb-2 w-full">
                          <CardTitle className="text-xl truncate">{event.name}</CardTitle>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 shrink-0" />
                            {(() => {
                              // @ts-ignore
                              const dateStr = event.startDate instanceof Date
                                ? event.startDate.toISOString().split('T')[0]
                                : (event as any).startDate;
                              const parts = String(dateStr).split('T')[0].split('-');
                              if (parts.length < 3) return "Data Inválida";
                              const [year, month, day] = parts;
                              const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                              return format(localDate, "dd/MM/yyyy", { locale: ptBR });
                            })()}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 shrink-0" />
                            <span className="truncate">{event.city}, {event.state || 'SP'}</span>
                          </div>
                          {(event as any).registrationCount !== undefined && (
                            <div className="flex items-center gap-1 text-orange-600 font-medium pt-1">
                              <Users className="h-4 w-4 shrink-0" />
                              <span>{(event as any).registrationCount} inscritos</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {event.imageUrl && (
                        <div className="shrink-0 flex items-center justify-center px-2">
                          <img
                            src={encodeURI(event.imageUrl)}
                            alt={event.name}
                            className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover border border-border shadow-sm"
                          />
                        </div>
                      )}

                      <Badge variant={event.status === 'open' ? 'default' : 'secondary'} className="shrink-0 self-start mt-1">
                        {event.status === 'open' ? 'Aberto' : event.status === 'closed' ? 'Fechado' : 'Cancelado'}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      {event.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                          {event.description}
                        </p>
                      )}
                      {(event as EventWithCategories).categories && (event as EventWithCategories).categories!.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">Categorias:</h4>
                          <div className="space-y-3">
                            {/* Categorias Pai */}
                            {(event as EventWithCategories).categories!.filter((c: any) => !c.parentId).map((parentCategory: any) => (
                              <div key={parentCategory.id} className="space-y-2">
                                {/* Categoria Pai */}
                                <div className="flex items-center justify-between p-2 bg-primary/10 rounded font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">📁 {parentCategory.name}</span>
                                  </div>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tem certeza que deseja excluir a categoria "{parentCategory.name}"? Todas as subcategorias também serão excluídas.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteCategory.mutate({ id: parentCategory.id })}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Excluir
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>

                                {/* Subcategorias */}
                                <div className="ml-4 space-y-2">
                                  {(event as EventWithCategories).categories!.filter((c: any) => c.parentId === parentCategory.id).map((subcategory: any) => (
                                    <div key={subcategory.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium">└─ {subcategory.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          R$ {(subcategory.price || 0).toFixed(2)} • {subcategory.slots || 0} vagas
                                        </p>
                                      </div>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir Subcategoria</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Tem certeza que deseja excluir a subcategoria "{subcategory.name}"? Esta ação não pode ser desfeita.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteCategory.mutate({ id: subcategory.id })}
                                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                              Excluir
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}

                            {/* Categorias sem pai (legacy) */}
                            {(event as EventWithCategories).categories!.filter((c: any) => c.parentId === null && c.price !== null).map((category: any) => (
                              <div key={category.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{category.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    R$ {(category.price || 0).toFixed(2)} • {category.slots || 0} vagas
                                  </p>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tem certeza que deseja excluir a categoria "{category.name}"? Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteCategory.mutate({ id: category.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex flex-wrap gap-2">
                       <Button
                         size="sm"
                         variant="outline"
                         className="w-full md:w-auto"
                         onClick={() => {
                           setSelectedEventId(event.id);
                           setCategoryForm({ vehicleType: "", customVehicleType: "", level: "", customLevel: "", price: "", slots: "", eventId: event.id });
                           setCategoryDialogOpen(true);
                         }}
                       >
                         <Plus className="mr-2 h-4 w-4" />
                         Adicionar Categoria
                       </Button>
                       <Link href={`/events/${event.id}`} className="w-full md:w-auto">
                         <Button size="sm" variant="outline" className="w-full">
                           <Pencil className="h-4 w-4 mr-2" />
                           Editar Categorias
                         </Button>
                       </Link>
                       <Button size="sm" variant="outline" className="w-full md:w-auto" onClick={() => handleEditClick(event)}>
                         <Pencil className="h-4 w-4 mr-2" />
                         Editar Evento
                       </Button>
                       <Link href={`/organizer/events/${event.id}/start-order`} className="w-full md:w-auto">
                         <Button size="sm" variant="outline" className="w-full">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                           </svg>
                           Ordem de Largada
                         </Button>
                       </Link>
                       {canStore && (
                         <Link href={`/organizer/events/${event.id}/store`} className="w-full md:w-auto">
                           <Button size="sm" variant="outline" className="w-full bg-primary/10 hover:bg-primary/20 text-primary border-primary/20">
                             <ShoppingBag className="h-4 w-4 mr-2" />
                             Loja do EventO
                           </Button>
                         </Link>
                       )}
                       <Link href={`/organizer/events/${event.id}/secretariat`} className="w-full md:w-auto">
                         <Button size="sm" variant="outline" className="w-full bg-primary/10 hover:bg-primary/20 text-primary border-primary/20">
                           <ClipboardCheck className="h-4 w-4 mr-2" />
                           Secretaria / Check-in
                         </Button>
                       </Link>
                       <Link href={`/registrations?eventId=${event.id}`} className="w-full md:w-auto">
                         <Button size="sm" variant="outline" className="w-full bg-primary/10 hover:bg-primary/20 text-primary border-primary/20">
                           <Users className="h-4 w-4 mr-2" />
                           Inscritos
                         </Button>
                       </Link>
                       <AlertDialog>
                         <AlertDialogTrigger asChild className="w-full md:w-auto">
                           <Button size="sm" variant="destructive" className="w-full">
                             <Trash2 className="h-4 w-4 mr-2" />
                             Deletar Evento
                           </Button>
                         </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Deleção</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja deletar o evento "{event.name}"? Esta ação não pode ser desfeita e todas as categorias e inscrições associadas serão removidas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteEvent.mutate({ id: event.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Deletar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground mb-4">
                    Você ainda não criou nenhum evento
                  </p>
                  <Button onClick={() => setEventDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Evento
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="championships">
            {championshipsLoading ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse h-[140px] bg-muted" />
                ))}
              </div>
            ) : (championships && championships.length > 0) ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {championships.map((champ) => (
                  <Card
                    key={champ.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors flex flex-col"
                    onClick={() => window.location.href = `/organizer/championships/${champ.id}`}
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-xl line-clamp-2">{champ.name}</CardTitle>
                        <div className="bg-primary/10 text-primary rounded-md px-2 py-1 text-xs font-bold shrink-0">
                          {champ.year}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 mb-auto">
                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                        <CalendarDays className="h-4 w-4 mr-2" />
                        Criado em {new Date(champ.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </CardContent>
                    <CardFooter className="p-5 pt-0 border-t mt-4 flex justify-between items-center bg-muted/20">
                      <span className="text-xs text-muted-foreground">Ver detalhes</span>
                      <Trophy className="h-4 w-4 text-primary" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <p className="text-lg text-muted-foreground mb-4">
                    Você ainda não criou nenhum campeonato
                  </p>
                  <Button onClick={() => setChampionshipDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Campeonato
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Modal Único para Criação de Categoria */}
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Categoria</DialogTitle>
              <DialogDescription>
                Adicione uma categoria ao evento selecionado
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Botão 1: Tipo de Veículo */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">1. Tipo de Veículo *</Label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="vehicleType"
                      value="Carros"
                      checked={categoryForm.vehicleType === "Carros"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, vehicleType: e.target.value as "Carros", customVehicleType: "" })}
                      className="w-4 h-4"
                    />
                    <span>Carros</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="vehicleType"
                      value="Motos"
                      checked={categoryForm.vehicleType === "Motos"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, vehicleType: e.target.value as "Motos", customVehicleType: "" })}
                      className="w-4 h-4"
                    />
                    <span>Motos</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="vehicleType"
                      value="Outra"
                      checked={categoryForm.vehicleType === "Outra"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, vehicleType: e.target.value as "Outra" })}
                      className="w-4 h-4"
                    />
                    <span>Outra</span>
                  </label>
                </div>
                {categoryForm.vehicleType === "Outra" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-vehicle">Nome da Categoria *</Label>
                    <Input
                      id="custom-vehicle"
                      value={categoryForm.customVehicleType}
                      onChange={(e) => setCategoryForm({ ...categoryForm, customVehicleType: e.target.value })}
                      placeholder="Ex: UTVs, Quadriciclos, etc."
                    />
                  </div>
                )}
              </div>

              {/* Botão 2: Nível */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">2. Nível *</Label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Master"
                      checked={categoryForm.level === "Master"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Master", customLevel: "" })}
                      className="w-4 h-4"
                    />
                    <span>Master</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Graduado"
                      checked={categoryForm.level === "Graduado"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Graduado", customLevel: "" })}
                      className="w-4 h-4"
                    />
                    <span>Graduado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Turismo"
                      checked={categoryForm.level === "Turismo"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Turismo", customLevel: "" })}
                      className="w-4 h-4"
                    />
                    <span>Turismo</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Rally"
                      checked={categoryForm.level === "Rally"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Rally", customLevel: "" })}
                      className="w-4 h-4"
                    />
                    <span>Rally</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Light"
                      checked={categoryForm.level === "Light"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Light", customLevel: "" })}
                      className="w-4 h-4"
                    />
                    <span>Light</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="level"
                      value="Outra"
                      checked={categoryForm.level === "Outra"}
                      onChange={(e) => setCategoryForm({ ...categoryForm, level: e.target.value as "Outra" })}
                      className="w-4 h-4"
                    />
                    <span>Outra</span>
                  </label>
                </div>
                {categoryForm.level === "Outra" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-level">Nome da Subcategoria *</Label>
                    <Input
                      id="custom-level"
                      value={categoryForm.customLevel}
                      onChange={(e) => setCategoryForm({ ...categoryForm, customLevel: e.target.value })}
                      placeholder="Ex: Iniciante, Avançado, etc."
                    />
                  </div>
                )}
              </div>

              {/* Preço e Vagas */}
              {categoryForm.vehicleType && categoryForm.level && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cat-price">Preço (R$) *</Label>
                    <Input
                      id="cat-price"
                      type="number"
                      step="0.01"
                      value={categoryForm.price}
                      onChange={(e) => setCategoryForm({ ...categoryForm, price: e.target.value })}
                      placeholder="150.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cat-slots">Vagas *</Label>
                    <Input
                      id="cat-slots"
                      type="number"
                      value={categoryForm.slots}
                      onChange={(e) => setCategoryForm({ ...categoryForm, slots: e.target.value })}
                      placeholder="50"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreateCategory} disabled={createCategory.isPending}>
                {createCategory.isPending ? "Criando..." : "Criar Categoria"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div >
  );
}
