import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { Calendar, MapPin, ArrowLeft, Users, DollarSign, Car, Trash2, Pencil, ShoppingBag, Trophy, Plus, Loader2, ArrowRight } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { EventGallery } from "@/components/EventGallery";
import { EventSponsors } from "@/components/EventSponsors";
import { PaymentModal } from "@/components/PaymentModal";
import Navbar from "@/components/Navbar";

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0");
  const { user, isAuthenticated } = useAuth();

  const { data: event, isLoading: eventLoading } = trpc.events.get.useQuery({ id: eventId });
  const { data: categories, isLoading: categoriesLoading } = trpc.categories.listByEvent.useQuery({ eventId });
  const { data: vehicles } = trpc.vehicles.list.useQuery(undefined, { enabled: isAuthenticated });
  const registrationsQuery = trpc.registrations.listByEvent.useQuery(
    { eventId }
    // Carregar automaticamente para mostrar contador no botão
  );
  const registrations = registrationsQuery.data || [];
  const registrationsLoading = registrationsQuery.isLoading;

  const { data: availableProducts } = trpc.store.getAvailable.useQuery(
    { eventId, organizerId: (event as any)?.organizer?.principalUserId },
    { enabled: !!event }
  );

  type CartItem = {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    sizes?: string[];
  };
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Standalone Checkout State
  const [standaloneProduct, setStandaloneProduct] = useState<any>(null);
  const [standaloneQuantity, setStandaloneQuantity] = useState<number>(1);
  const [standaloneSizes, setStandaloneSizes] = useState<string[]>([]);
  const [standaloneBuyerName, setStandaloneBuyerName] = useState(user?.name || "");
  const [standaloneBuyerEmail, setStandaloneBuyerEmail] = useState(user?.email || "");
  const [standaloneBuyerPhone, setStandaloneBuyerPhone] = useState("");
  const [standaloneBuyerCpf, setStandaloneBuyerCpf] = useState(user?.cpf || "");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const createStandaloneOrder = trpc.store.createStandaloneOrder.useMutation({
    onSuccess: (data) => {
      toast.success("Pedido registrado! Conclua o pagamento para garantir o item.");

      // Setup payment modal
      setPendingOrderId(data.order.id);
      setPendingPaymentAmount(standaloneProduct.price * standaloneQuantity);
      setPendingCategoryName("Loja Oficial");
      setPaymentModalOpen(true);

      setStandaloneProduct(null);
      // Reset state
      setStandaloneQuantity(1);
      setStandaloneSizes([]);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao processar pedido avulso.");
    }
  });

  const utils = trpc.useUtils();
  // @ts-ignore
  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoria deletada com sucesso!");
      utils.categories.listByEvent.invalidate({ eventId });
    },
    onError: (error: any) => {
      toast.error(`Erro ao deletar categoria: ${error.message || 'Tente novamente'}`);
    }
  });

  // Verificar se usuário é organizador do evento
  const isOrganizer = event && user && (
    (event as any).organizer?.principalUserId === user.id ||
    (event as any).organizer?.ownerId === user.openId ||
    user.role === 'admin'
  );

  // Estado para edição de categoria
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    price: "",
    slots: ""
  });

  // @ts-ignore
  const updateCategory = trpc.categories.update.useMutation({
    onSuccess: () => {
      toast.success("Categoria atualizada com sucesso!");
      setEditDialogOpen(false);
      utils.categories.listByEvent.invalidate({ eventId });
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar categoria: ${error.message || 'Tente novamente'}`);
    }
  });

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setEditFormData({
      name: category.name || "",
      description: category.description || "",
      price: category.price?.toString() || "",
      slots: category.slots?.toString() || ""
    });
    setEditDialogOpen(true);
  };

  const handleUpdateCategory = () => {
    if (!editingCategory) return;

    updateCategory.mutate({
      id: editingCategory.id,
      name: editFormData.name || undefined,
      description: editFormData.description || undefined,
      price: editFormData.price ? parseFloat(editFormData.price) : undefined,
      slots: editFormData.slots ? parseInt(editFormData.slots) : undefined
    });
  };

  const handleOpenRegistrationsDialog = async () => {
    setRegistrationsDialogOpen(true);
    await registrationsQuery.refetch();
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [registrationsDialogOpen, setRegistrationsDialogOpen] = useState(false);
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<string>("");

  // Estado para modal de pagamento
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pendingRegistrationId, setPendingRegistrationId] = useState<number | null>(null);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState<number>(0);
  const [pendingCategoryName, setPendingCategoryName] = useState<string>("");

  // Detectar se a categoria pai selecionada é "Motos"
  const selectedParentCategory = categories?.find(cat => cat.id.toString() === selectedParentCategoryId);
  const isMotosCategory = selectedParentCategory?.name === "Motos";
  const [formData, setFormData] = useState({
    categoryId: "",
    vehicleId: "",
    pilot_vehicle_brand: "",
    pilot_vehicle_model: "",
    pilot_name: user?.name || "",
    pilot_email: user?.email || "",
    pilot_cpf: "",
    pilot_city: "",
    pilot_state: "",
    pilot_phone: "",
    navigator_name: "",
    navigator_email: "",
    navigator_cpf: "",
    navigator_city: "",
    navigator_state: "",
    team: "",
    vehicle_info: "",
    pilot_shirt: "",
    navigator_shirt: "",
    notes: "",
    termsAccepted: false,
  });

  const createRegistration = trpc.registrations.create.useMutation({
    onSuccess: (data) => {
      toast.success("Inscrição realizada com sucesso!");
      setDialogOpen(false);

      // Buscar informações da categoria para o modal de pagamento
      const selectedCategory = categories?.find(cat => cat.id === parseInt(formData.categoryId));

      // Abrir modal de pagamento automaticamente
      if (data.registrationId && selectedCategory) {
        setPendingRegistrationId(Number(data.registrationId));
        setPendingPaymentAmount((selectedCategory.price || 0) + cartTotal);
        setPendingCategoryName(selectedCategory.name || "");
        setPaymentModalOpen(true);
      }
      setCart([]);
      setFormData({
        categoryId: "",
        vehicleId: "",
        pilot_vehicle_brand: "",
        pilot_vehicle_model: "",
        pilot_name: user?.name || "",
        pilot_email: user?.email || "",
        pilot_cpf: "",
        pilot_city: "",
        pilot_state: "",
        pilot_phone: "",
        navigator_name: "",
        navigator_email: "",
        navigator_cpf: "",
        navigator_city: "",
        navigator_state: "",
        team: "",
        vehicle_info: "",
        pilot_shirt: "",
        navigator_shirt: "",
        notes: "",
        termsAccepted: false,
      });
      utils.categories.listByEvent.invalidate({ eventId });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao realizar inscrição");
    },
  });

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (field: 'pilot_cpf' | 'navigator_cpf', value: string) => {
    const formatted = formatCpf(value);
    setFormData({ ...formData, [field]: formatted });
  };

  const handleRegister = () => {
    if (!formData.categoryId) {
      toast.error("Selecione uma categoria");
      return;
    }

    // Validar veículo apenas se não for Motos
    if (!isMotosCategory && (!formData.pilot_vehicle_brand || !formData.pilot_vehicle_model)) {
      toast.error("Preencha marca e modelo do veículo");
      return;
    }

    if (!formData.pilot_name || !formData.pilot_email || !formData.pilot_cpf || !formData.pilot_city || !formData.pilot_state) {
      toast.error("Preencha todos os campos obrigatórios do piloto (Nome, Email, CPF, Cidade, Estado)");
      return;
    }

    if (!formData.pilot_phone || formData.pilot_phone.replace(/\D/g, '').length < 10) {
      toast.error("O campo Telefone é obrigatório e deve ter pelo menos 10 dígitos. Role o formulário para baixo para preencher.");
      return;
    }

    // Validar camisetas apenas se o evento possuir camisetas
    if ((event as any)?.hasShirts !== false) {
      if (!formData.pilot_shirt) {
        toast.error("Selecione o tamanho da camiseta do piloto");
        return;
      }

      // Validar camiseta navegador apenas se não for Motos
      if (!isMotosCategory && !formData.navigator_shirt) {
        toast.error("Selecione o tamanho da camiseta do navegador");
        return;
      }
    }

    if ((event as any).terms && !formData.termsAccepted) {
      toast.error("Você deve aceitar os termos do evento para continuar");
      return;
    }

    createRegistration.mutate({
      eventId,
      categoryId: parseInt(formData.categoryId),
      vehicleBrand: formData.pilot_vehicle_brand || "Motos",
      vehicleModel: formData.pilot_vehicle_model || "N/A",
      pilotName: formData.pilot_name,
      pilotEmail: formData.pilot_email,
      pilotCpf: formData.pilot_cpf,
      pilotCity: formData.pilot_city,
      pilotState: formData.pilot_state,
      pilotShirtSize: (event as any)?.hasShirts !== false ? formData.pilot_shirt : "p", // Enviamo 'p' como fallback pois DB exige não-nulo para piloto
      phone: formData.pilot_phone,
      navigatorName: formData.navigator_name,
      navigatorEmail: formData.navigator_email,
      navigatorCpf: formData.navigator_cpf,
      navigatorCity: formData.navigator_city,
      navigatorState: formData.navigator_state,
      navigatorShirtSize: (event as any)?.hasShirts !== false ? formData.navigator_shirt : null,
      team: formData.team,
      notes: formData.notes,
      termsAccepted: formData.termsAccepted,
      purchasedProducts: cart.length > 0 ? cart : undefined,
    });
  };

  if (eventLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-muted-foreground">Evento não encontrado</p>
            <Link href="/">
              <Button className="mt-4">Voltar para Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container py-8">
        {/* Event Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">{event.name}</h1>
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  <span>{format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  <span>{event.city}, {event.state || 'SP'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!event.isExternal && event.showRegistrations && (
                <Button
                  variant="outline"
                  onClick={handleOpenRegistrationsDialog}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  <Users className="h-4 w-4" />
                  Inscritos no Evento
                </Button>
              )}
              <Badge variant={event.status === 'open' ? 'default' : 'secondary'} className="text-lg px-4 py-2 justify-center">
                {event.status === 'open' ? 'Inscrições Abertas' : 'Encerrado'}
              </Badge>
            </div>
          </div>

          {event.description && (
            <Card>
              <CardHeader>
                <CardTitle>Sobre o Evento</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{event.description}</p>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p><strong>Local:</strong> {event.location}</p>
                </div>
              </CardContent>
            </Card>
          )}




          {/* Loja Oficial (Standalone Purchases) */}
          {!event.isExternal && availableProducts && availableProducts.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold tracking-tight">Loja Oficial do Evento</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableProducts.map((product) => {
                  const sizes = product.availableSizes ? product.availableSizes.split(',').map(s => s.trim()) : [];
                  const needsSize = sizes.length > 0 || product.name.toLowerCase().includes('camis');

                  return (
                    <Card key={product.id} className="overflow-hidden flex flex-col border border-primary/10 shadow-sm hover:shadow-md transition-shadow">
                      {product.imageUrl && (
                        <div className="aspect-video w-full overflow-hidden bg-muted">
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <CardTitle className="text-lg">{product.name}</CardTitle>
                            {product.description && (
                              <CardDescription className="line-clamp-2 mt-1">{product.description}</CardDescription>
                            )}
                          </div>
                          <Badge variant="secondary" className="font-bold text-sm shrink-0">
                            R$ {product.price.toFixed(2)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardFooter className="p-4 pt-2 mt-auto">
                        {product.stock > 0 ? (
                          <Button
                            className="w-full flex items-center justify-center gap-2"
                            onClick={() => {
                              setStandaloneProduct(product);
                              setStandaloneQuantity(1);
                              setStandaloneSizes(needsSize ? [""] : []);
                            }}
                          >
                            <ShoppingBag className="w-4 h-4" /> Comprar Agora
                          </Button>
                        ) : (
                          <Button className="w-full" variant="outline" disabled>
                            Esgotado
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {event.isExternal && (event as any).externalUrl && (
            <div className="mt-8">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-8 text-center flex flex-col items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-full">
                    <Trophy className="w-8 h-8 text-primary" />
                  </div>
                  <div className="max-w-md">
                    <h3 className="text-xl font-bold mb-2">Inscrições e Informações</h3>
                    <p className="text-muted-foreground mb-6">Este é um evento externo da plataforma. Clique no botão abaixo para ser redirecionado ao site oficial e realizar sua inscrição.</p>
                    <Button asChild size="lg" className="w-full font-bold uppercase tracking-tight">
                      <a href={(event as any).externalUrl} target="_blank" rel="noopener noreferrer">
                        Ir para Site Oficial
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!event.isExternal && <h2 className="text-xl font-bold tracking-tight mb-4 mt-8">Categorias e Inscrições</h2>}
          {!event.isExternal && (categoriesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-3/4"></div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : categories && categories.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {/* Mostrar subcategorias como cards individuais */}
              {categories.filter(c => c.parentId !== null && c.price !== null).map((subcategory) => {
                const parentCategory = categories.find(c => c.id === subcategory.parentId);

                if (!parentCategory) return null;

                return (
                  <Card key={subcategory.id} className="relative">
                    <CardHeader>
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <span>📁</span>
                        <span>{parentCategory.name}</span>
                      </CardTitle>

                      {/* Botões de editar e deletar - visíveis apenas para organizador */}
                      {isOrganizer && (
                        <div className="absolute top-2 right-2 flex gap-1">
                          {/* Botão de editar */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleEditCategory(subcategory)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {/* Botão de deletar */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deletar categoria?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja deletar a categoria "{subcategory.name}"?
                                  Todas as inscrições associadas também serão removidas.
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteCategory.mutate({ id: subcategory.id })}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                      {/* Nome da subcategoria */}
                      <CardDescription className="text-base font-medium mt-2">
                        {subcategory.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span>R$ {(subcategory.price || 0).toFixed(2)} - R$ {(subcategory.price || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{subcategory.slots || 0} vagas</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        1 categoria disponível
                      </p>
                    </CardContent>
                    <CardFooter>
                      {(event as any).isExternal ? (
                        <div className="w-full text-center text-muted-foreground">
                          <Badge variant="secondary" className="mb-2">Evento Externo</Badge>
                          <p className="text-sm">Este evento não permite inscrição pelo site</p>
                        </div>
                      ) : isAuthenticated ? (
                        event.status === 'open' ? (
                          <Button
                            className="w-full"
                            onClick={() => {
                              setSelectedParentCategoryId(parentCategory.id.toString());
                              // Pré-preencher com primeiro veículo se houver
                              const firstVehicle = vehicles?.[0];
                              setFormData(prev => ({
                                ...prev,
                                categoryId: subcategory.id.toString(),
                                pilot_vehicle_brand: firstVehicle?.brand || "",
                                pilot_vehicle_model: firstVehicle?.model || "",
                                vehicleId: firstVehicle?.id?.toString() || "",
                              }));
                              setDialogOpen(true);
                            }}
                          >
                            Inscrever-se
                          </Button>
                        ) : (
                          <Button className="w-full" disabled>
                            Inscrições Encerradas
                          </Button>
                        )
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          asChild
                        >
                          <a href={getLoginUrl()}>Entrar para se inscrever</a>
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-lg text-muted-foreground">
                  Nenhuma categoria disponível para este evento
                </p>
              </CardContent>
            </Card>
          ))}

          <EventSponsors sponsors={(event as any).sponsors} />
          <EventGallery eventId={eventId} images={(event as any).gallery} />

          {/* Registration Dialog moved outside the loop */}
          {isAuthenticated && event && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Formulário de Inscrição</DialogTitle>
                  <DialogDescription>
                    Preencha os dados para se inscrever em {event.name}
                  </DialogDescription>
                </DialogHeader>

                {/* Indicador de categoria selecionada */}
                {formData.categoryId && (() => {
                  const selectedCategory = categories?.find(c => c.id.toString() === formData.categoryId);
                  const parentCat = categories?.find(c => c.id === selectedCategory?.parentId);
                  if (!selectedCategory || !parentCat) return null;
                  return (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">
                          Inscrevendo-se em:
                        </span>
                        <span className="text-sm font-semibold">
                          {parentCat.name} → {selectedCategory.name}
                        </span>
                        <span className="text-sm text-muted-foreground ml-auto">
                          R$ {(selectedCategory.price || 0).toFixed(2)}
                        </span>
                      </div>
                      {cartTotal > 0 && (
                        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-primary/10">
                          <span className="text-sm font-medium text-primary">
                            Loja Oficial:
                          </span>
                          <span className="text-sm font-semibold text-muted-foreground">
                            {cart.reduce((acc, item) => acc + item.quantity, 0)} itens
                          </span>
                          <span className="text-sm text-muted-foreground ml-auto">
                            + R$ {cartTotal.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 pt-1 border-t border-primary/20">
                        <span className="text-sm font-bold text-primary">
                          Total Geral:
                        </span>
                        <span className="text-sm font-bold text-primary ml-auto">
                          R$ {((selectedCategory.price || 0) + cartTotal).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-6 py-4">
                  {/* Categoria e Veículo */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Categoria e Veículo</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Campos de veículo - ocultar para Motos */}
                      {!isMotosCategory && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="pilot_vehicle_brand">Marca *</Label>
                            <Input
                              id="pilot_vehicle_brand"
                              value={formData.pilot_vehicle_brand}
                              onChange={(e) => setFormData({ ...formData, pilot_vehicle_brand: e.target.value })}
                              placeholder="Ex: Toyota, Honda, Jeep"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="pilot_vehicle_model">Modelo *</Label>
                            <Input
                              id="pilot_vehicle_model"
                              value={formData.pilot_vehicle_model}
                              onChange={(e) => setFormData({ ...formData, pilot_vehicle_model: e.target.value })}
                              placeholder="Ex: Hilux, CRV, Wrangler"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Dados do Piloto */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Dados do Piloto *</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pilot_name">Nome Completo *</Label>
                        <Input
                          id="pilot_name"
                          value={formData.pilot_name}
                          onChange={(e) => setFormData({ ...formData, pilot_name: e.target.value })}
                          placeholder="Nome completo do piloto"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pilot_email">Email *</Label>
                        <Input
                          id="pilot_email"
                          type="email"
                          value={formData.pilot_email}
                          onChange={(e) => setFormData({ ...formData, pilot_email: e.target.value })}
                          placeholder="email@exemplo.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pilot_cpf">CPF *</Label>
                        <Input
                          id="pilot_cpf"
                          value={formData.pilot_cpf}
                          onChange={(e) => handleCpfChange('pilot_cpf', e.target.value)}
                          placeholder="000.000.000-00"
                          maxLength={14}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pilot_city">Cidade *</Label>
                        <Input
                          id="pilot_city"
                          value={formData.pilot_city}
                          onChange={(e) => setFormData({ ...formData, pilot_city: e.target.value })}
                          placeholder="Cidade"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pilot_state_trigger">Estado *</Label>
                        <Select
                          value={formData.pilot_state}
                          onValueChange={(value) => setFormData({ ...formData, pilot_state: value })}
                        >
                          <SelectTrigger id="pilot_state_trigger">
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                          <SelectContent>
                            {BRAZILIAN_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pilot_phone">Telefone *</Label>
                        <Input
                          id="pilot_phone"
                          value={formData.pilot_phone}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '');
                            const formatted = value.length <= 11
                              ? value.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, p1, p2) => {
                                let result = ddd;
                                if (p1) result += ` ${p1}`;
                                if (p2) result += `-${p2}`;
                                return result;
                              })
                              : formData.pilot_phone;
                            setFormData({ ...formData, pilot_phone: formatted });
                          }}
                          placeholder="11 98765-4321"
                          maxLength={15}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dados do Navegador - ocultar para Motos */}
                  {!isMotosCategory && (
                    <>
                      <Separator />

                      <div className="space-y-4">
                        <h3 className="font-semibold">Dados do Navegador (Opcional)</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="navigator_name">Nome Completo</Label>
                            <Input
                              id="navigator_name"
                              value={formData.navigator_name}
                              onChange={(e) => setFormData({ ...formData, navigator_name: e.target.value })}
                              placeholder="Nome completo do navegador"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="navigator_email">Email</Label>
                            <Input
                              id="navigator_email"
                              type="email"
                              value={formData.navigator_email}
                              onChange={(e) => setFormData({ ...formData, navigator_email: e.target.value })}
                              placeholder="email@exemplo.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="navigator_cpf">CPF</Label>
                            <Input
                              id="navigator_cpf"
                              value={formData.navigator_cpf}
                              onChange={(e) => handleCpfChange('navigator_cpf', e.target.value)}
                              placeholder="000.000.000-00"
                              maxLength={14}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="navigator_city">Cidade</Label>
                            <Input
                              id="navigator_city"
                              value={formData.navigator_city}
                              onChange={(e) => setFormData({ ...formData, navigator_city: e.target.value })}
                              placeholder="Cidade"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="navigator_state_trigger">Estado</Label>
                            <Select
                              value={formData.navigator_state}
                              onValueChange={(value) => setFormData({ ...formData, navigator_state: value })}
                            >
                              <SelectTrigger id="navigator_state_trigger">
                                <SelectValue placeholder="UF" />
                              </SelectTrigger>
                              <SelectContent>
                                {BRAZILIAN_STATES.map((state) => (
                                  <SelectItem key={state} value={state}>
                                    {state}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <Separator />
                    </>
                  )}

                  {/* Equipe e Camisetas */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Informações Adicionais</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="form_team">Equipe</Label>
                        <Input
                          id="form_team"
                          value={formData.team}
                          onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                          placeholder="Nome da equipe"
                        />
                      </div>
                      {(event as any)?.hasShirts !== false && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="pilot_shirt_trigger">Camiseta Piloto *</Label>
                            <Select
                              value={formData.pilot_shirt}
                              onValueChange={(value) => setFormData({ ...formData, pilot_shirt: value })}
                            >
                              <SelectTrigger id="pilot_shirt_trigger">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pp">PP</SelectItem>
                                <SelectItem value="p">P</SelectItem>
                                <SelectItem value="m">M</SelectItem>
                                <SelectItem value="g">G</SelectItem>
                                <SelectItem value="gg">GG</SelectItem>
                                <SelectItem value="g1">G1</SelectItem>
                                <SelectItem value="g2">G2</SelectItem>
                                <SelectItem value="g3">G3</SelectItem>
                                <SelectItem value="g4">G4</SelectItem>
                                <SelectItem value="infantil">Infantil</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Campo Camiseta Navegador - ocultar para Motos */}
                          {!isMotosCategory && (
                            <div className="space-y-2">
                              <Label htmlFor="navigator_shirt_trigger">Camiseta Navegador*</Label>
                              <Select
                                value={formData.navigator_shirt}
                                onValueChange={(value) => setFormData({ ...formData, navigator_shirt: value })}
                              >
                                <SelectTrigger id="navigator_shirt_trigger">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pp">PP</SelectItem>
                                  <SelectItem value="p">P</SelectItem>
                                  <SelectItem value="m">M</SelectItem>
                                  <SelectItem value="g">G</SelectItem>
                                  <SelectItem value="gg">GG</SelectItem>
                                  <SelectItem value="g1">G1</SelectItem>
                                  <SelectItem value="g2">G2</SelectItem>
                                  <SelectItem value="g3">G3</SelectItem>
                                  <SelectItem value="g4">G4</SelectItem>
                                  <SelectItem value="infantil">Infantil</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Loja Oficial */}
                  {availableProducts && availableProducts.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold flex items-center gap-2">
                            <ShoppingBag className="h-5 w-5 text-primary" />
                            Loja Oficial (Adicionais)
                          </h3>
                        </div>
                        <div className="grid gap-4">
                          {availableProducts.map((p) => {
                            const cartItem = cart.find(i => i.productId === p.id);
                            const sizes = p.availableSizes ? p.availableSizes.split(',').map(s => s.trim()).filter(Boolean) : [];
                            const isCamisa = p.name.toLowerCase().includes('camis');
                            const needsSize = sizes.length > 0 || isCamisa;
                            const displaySizes = sizes.length > 0 ? sizes : ["PP", "P", "M", "G", "GG", "G1", "G2", "G3", "G4", "INF2", "INF4", "INF6", "INF8"];

                            return (
                              <div key={p.id} className="flex gap-4 p-3 border rounded-lg bg-card items-start">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="w-20 h-20 object-cover rounded-md border" />
                                ) : (
                                  <div className="w-20 h-20 bg-muted/30 rounded-md border flex items-center justify-center">
                                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div className="flex-1 space-y-1">
                                  <div className="flex justify-between">
                                    <h4 className="font-semibold">{p.name}</h4>
                                    <span className="font-bold text-primary">R$ {p.price.toFixed(2)}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>

                                  <div className="flex items-center gap-4 mt-3 pt-2">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs">Qtd:</Label>
                                      <Select
                                        value={cartItem?.quantity.toString() || "0"}
                                        onValueChange={(val) => {
                                          const qty = parseInt(val);
                                          if (qty === 0) {
                                            setCart(prev => prev.filter(i => i.productId !== p.id));
                                          } else {
                                            setCart(prev => {
                                              const existing = prev.find(i => i.productId === p.id);
                                              if (existing) {
                                                const currentSizes = existing.sizes || [];
                                                const newSizes = Array(qty).fill('').map((_, idx) => currentSizes[idx] || '');
                                                return prev.map(i => i.productId === p.id ? { ...i, quantity: qty, sizes: newSizes } : i);
                                              }
                                              const initialSizes = needsSize ? Array(qty).fill('') : undefined;
                                              return [...prev, { productId: p.id, name: p.name!, price: p.price, quantity: qty, sizes: initialSizes }];
                                            });
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="w-20 h-8 text-xs">
                                          <SelectValue placeholder="0" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from({ length: Math.min(p.stock, 50) + 1 }, (_, i) => i).map(n => (
                                            <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {cartItem && cartItem.quantity > 0 && needsSize && (
                                      <div className="flex flex-col gap-2">
                                        {Array.from({ length: cartItem.quantity }).map((_, idx) => (
                                          <div key={idx} className="flex items-center gap-2">
                                            <Label className="text-xs text-red-500 whitespace-nowrap">Tamanho {idx + 1} *:</Label>
                                            <Select
                                              value={cartItem.sizes?.[idx] || ""}
                                              onValueChange={(val) => {
                                                setCart(prev => prev.map(i => {
                                                  if (i.productId === p.id) {
                                                    const newSizes = [...(i.sizes || Array(i.quantity).fill(''))];
                                                    newSizes[idx] = val;
                                                    return { ...i, sizes: newSizes };
                                                  }
                                                  return i;
                                                }));
                                              }}
                                            >
                                              <SelectTrigger className={`w-24 h-8 text-xs ${!cartItem.sizes?.[idx] ? 'border-red-400 border-dashed' : ''}`}>
                                                <SelectValue placeholder="Escolha" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {displaySizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {(event as any).terms && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold text-sm">Termos do Evento</h3>
                    <div className="p-4 border rounded-lg bg-muted/50 max-h-[200px] overflow-y-auto text-sm whitespace-pre-wrap leading-relaxed">
                      {(event as any).terms}
                    </div>
                    <div className="flex items-start space-x-2">
                      <input
                        type="checkbox"
                        id="termsAccepted"
                        checked={formData.termsAccepted}
                        onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 mt-1"
                      />
                      <Label htmlFor="termsAccepted" className="text-sm font-medium leading-tight cursor-pointer">
                        Li e aceito os termos do evento e a declaração de responsabilidade. *
                      </Label>
                    </div>
                  </div>
                )}

                <DialogFooter className="pt-4">
                  <Button
                    onClick={handleRegister}
                    disabled={createRegistration.isPending}
                    className="w-full"
                  >
                    {createRegistration.isPending ? "Processando..." : "Confirmar Inscrição"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {!isAuthenticated && event && event.status === 'open' && (
            <div className="mt-8 text-center">
              <Button asChild>
                <a href={getLoginUrl()}>Faça login para se inscrever</a>
              </Button>
            </div>
          )}
        </div>

      </div>

      {/* Dialog de Inscritos */}
      <Dialog open={registrationsDialogOpen} onOpenChange={setRegistrationsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inscritos no Evento</DialogTitle>
            <DialogDescription>
              Lista de todos os competidores inscritos em {event?.name}
            </DialogDescription>
          </DialogHeader>

          {registrationsLoading ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Carregando inscritos...</p>
            </div>
          ) : registrations.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Nenhum inscrito ainda neste evento</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {registrations.map((reg: any) => (
                  <Card key={reg.id}>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Piloto
                          </h4>
                          <div className="space-y-1 text-sm">
                            <p><strong>Nome:</strong> {reg.pilotName}</p>
                            <p><strong>Email:</strong> {reg.pilotEmail}</p>
                            <p><strong>Cidade:</strong> {reg.pilotCity}, {reg.pilotState}</p>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Car className="h-4 w-4" />
                            Veículo e Categoria
                          </h4>
                          <div className="space-y-1 text-sm">
                            <p><strong>Categoria:</strong> {reg.categoryName || 'N/A'}</p>
                            <p><strong>Veículo:</strong> {reg.vehicleBrand} {reg.vehicleModel}</p>
                            {reg.team && <p><strong>Equipe:</strong> {reg.team}</p>}
                          </div>
                        </div>

                        {reg.navigatorName && (
                          <div className="md:col-span-2 pt-2 border-t">
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Navegador
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p><strong>Nome:</strong> {reg.navigatorName}</p>
                              {reg.navigatorEmail && <p><strong>Email:</strong> {reg.navigatorEmail}</p>}
                              {reg.navigatorCity && (
                                <p><strong>Cidade:</strong> {reg.navigatorCity}, {reg.navigatorState}</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="md:col-span-2 flex items-center justify-between pt-2 border-t">
                          <Badge variant={reg.status === 'paid' ? 'default' : 'outline'}>
                            {reg.status === 'paid' ? 'Confirmado' : 'Pendente'}
                          </Badge>
                          {reg.paymentStatus && (
                            <Badge variant={reg.paymentStatus === 'confirmed' ? 'default' : 'secondary'}>
                              Pagamento: {reg.paymentStatus === 'confirmed' ? 'Confirmado' : 'Pendente'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de edição de categoria */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoria</DialogTitle>
            <DialogDescription>
              Atualize as informações da categoria pai. As subcategorias serão atualizadas automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Categoria</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Ex: Carros, Motos"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Input
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="Descrição da categoria"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Preço (R$)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={editFormData.price}
                  onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-slots">Vagas</Label>
                <Input
                  id="edit-slots"
                  type="number"
                  value={editFormData.slots}
                  onChange={(e) => setEditFormData({ ...editFormData, slots: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateCategory} disabled={updateCategory.isPending}>
              {updateCategory.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standalone Checkout Modal */}
      <Dialog open={!!standaloneProduct} onOpenChange={(open) => !open && setStandaloneProduct(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Finalizar Compra</DialogTitle>
            <DialogDescription>
              Produto avulso: {standaloneProduct?.name}
            </DialogDescription>
          </DialogHeader>

          {standaloneProduct && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <span className="font-semibold">{standaloneProduct.name}</span>
                  <span className="ml-2 text-muted-foreground text-sm">R$ {standaloneProduct.price.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Qtd:</Label>
                  <Select
                    value={standaloneQuantity.toString()}
                    onValueChange={(val) => {
                      const newQtd = parseInt(val, 10);
                      setStandaloneQuantity(newQtd);

                      // Update sizes array length based on quantity
                      const needsSize = !!standaloneProduct.availableSizes || standaloneProduct.name.toLowerCase().includes('camis');
                      if (needsSize) {
                        setStandaloneSizes(prev => {
                          const newSizes = [...prev];
                          if (newQtd > prev.length) {
                            while (newSizes.length < newQtd) newSizes.push("");
                          } else {
                            newSizes.length = newQtd;
                          }
                          return newSizes;
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: Math.min(standaloneProduct.stock, 50) }).map((_, i) => (
                        <SelectItem key={i} value={`${i + 1}`}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Render size selectors if needed */}
              {standaloneSizes.length > 0 && Array.from({ length: standaloneQuantity }).map((_, idx) => {
                const dbSizes = standaloneProduct.availableSizes ? standaloneProduct.availableSizes.split(',').map((s: string) => s.trim()) : [];
                const defaultSizes = ['PP', 'P', 'M', 'G', 'GG', 'G1', 'G2', 'G3', 'G4', 'INF2', 'INF4', 'INF6', 'INF8'];
                const displaySizes = dbSizes.length > 0 ? dbSizes : defaultSizes;

                return (
                  <div key={`size-${idx}`} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={`size-${idx}`} className="text-right text-xs">
                      Tamanho {idx + 1}
                    </Label>
                    <Select
                      value={standaloneSizes[idx]}
                      onValueChange={(val) => {
                        const newSizes = [...standaloneSizes];
                        newSizes[idx] = val;
                        setStandaloneSizes(newSizes);
                      }}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Selecione o tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {displaySizes.map((size: string) => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              <div className="grid grid-cols-4 items-center gap-4 mt-2">
                <Label htmlFor="buyerName" className="text-right text-sm">Seu Nome</Label>
                <Input id="buyerName" className="col-span-3" value={standaloneBuyerName} onChange={e => setStandaloneBuyerName(e.target.value)} />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="buyerCpf" className="text-right text-sm">CPF *</Label>
                <Input id="buyerCpf" className="col-span-3" value={standaloneBuyerCpf} onChange={e => setStandaloneBuyerCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="buyerEmail" className="text-right text-sm">E-mail</Label>
                <Input id="buyerEmail" type="email" className="col-span-3" value={standaloneBuyerEmail} onChange={e => setStandaloneBuyerEmail(e.target.value)} />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="buyerPhone" className="text-right text-sm">WhatsApp</Label>
                <Input id="buyerPhone" placeholder="(00) 00000-0000" className="col-span-3" value={standaloneBuyerPhone} onChange={e => setStandaloneBuyerPhone(e.target.value)} />
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-primary">R$ {(standaloneProduct.price * standaloneQuantity).toFixed(2)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneProduct(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!standaloneBuyerName || !standaloneBuyerEmail || !standaloneBuyerCpf) {
                  toast.error("Preencha nome, e-mail e CPF");
                  return;
                }
                const cpfDigits = standaloneBuyerCpf.replace(/\D/g, '');
                if (cpfDigits.length !== 11) {
                  toast.error("Preencha um CPF válido com 11 dígitos");
                  return;
                }
                if (standaloneSizes.length > 0 && standaloneSizes.some(s => !s)) {
                  toast.error("Por favor, selecione todos os tamanhos.");
                  return;
                }
                createStandaloneOrder.mutate({
                  buyerName: standaloneBuyerName,
                  buyerEmail: standaloneBuyerEmail,
                  buyerPhone: standaloneBuyerPhone,
                  buyerCpf: cpfDigits,
                  productId: standaloneProduct.id,
                  eventId: eventId,
                  quantity: standaloneQuantity,
                  sizes: standaloneSizes.length > 0 ? standaloneSizes : undefined
                });
              }}
              disabled={createStandaloneOrder.isPending}
            >
              {createStandaloneOrder.isPending ? "Processando..." : "Confirmar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Pagamento */}
      {
        (pendingRegistrationId || pendingOrderId) && (
          <PaymentModal
            open={paymentModalOpen}
            onOpenChange={setPaymentModalOpen}
            registrationId={pendingRegistrationId || undefined}
            orderId={pendingOrderId || undefined}
            amount={pendingPaymentAmount}
            eventName={event?.name || ""}
            categoryName={pendingCategoryName}
          />
        )
      }
    </div >
  );
}
