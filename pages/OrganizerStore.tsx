import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { ShoppingBag, Plus, Loader2, ArrowLeft, Image as ImageIcon, Trash2, Pencil, Trophy } from "lucide-react";
import { Link, useParams } from "wouter";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { compressImage } from '@/lib/imageCompression';
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Navbar from "@/components/Navbar";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export default function OrganizerStore() {
    const { user, isAuthenticated, loading, logout } = useAuth();

    const params = useParams() as { id?: string };
    const eventIdParam = params.id;
    const eventId = eventIdParam ? parseInt(eventIdParam, 10) : undefined;

    const [productDialogOpen, setProductDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);

    const [productForm, setProductForm] = useState({
        name: "",
        description: "",
        price: "",
        stock: "0",
        availableSizes: "",
        imageUrl: "",
    });

    const utils = trpc.useUtils();

    const { data: products, isLoading: productsLoading } = trpc.store.getAll.useQuery({ eventId }, {
        enabled: isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin')
    });

    const { data: orders, isLoading: ordersLoading } = trpc.store.getOrganizerOrders.useQuery({ eventId }, {
        enabled: isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin')
    });

    const createProduct = trpc.store.create.useMutation({
        onSuccess: () => {
            toast.success("Produto criado com sucesso!");
            setProductDialogOpen(false);
            resetForm();
            utils.store.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao criar produto");
        }
    });

    const updateProduct = trpc.store.update.useMutation({
        onSuccess: () => {
            toast.success("Produto atualizado com sucesso!");
            setProductDialogOpen(false);
            setEditingProduct(null);
            resetForm();
            utils.store.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao atualizar produto");
        }
    });

    const deleteProduct = trpc.store.delete.useMutation({
        onSuccess: () => {
            toast.success("Produto removido com sucesso!");
            utils.store.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao remover produto");
        }
    });

    const resetForm = () => {
        setProductForm({
            name: "",
            description: "",
            price: "",
            stock: "0",
            availableSizes: "",
            imageUrl: "",
        });
    };

    const handleEditClick = (product: any) => {
        setEditingProduct(product);
        setProductForm({
            name: product.name,
            description: product.description || "",
            price: product.price.toString(),
            stock: product.stock.toString(),
            availableSizes: product.availableSizes || "",
            imageUrl: product.imageUrl || "",
        });
        setProductDialogOpen(true);
    };

    const handleSaveProduct = async () => {
        if (!productForm.name) {
            toast.error("O nome do produto é obrigatório");
            return;
        }

        const priceNum = parseFloat(productForm.price.replace(',', '.'));
        if (isNaN(priceNum) || priceNum < 0) {
            toast.error("Informe um preço válido");
            return;
        }

        const stockNum = parseInt(productForm.stock, 10);
        if (isNaN(stockNum) || stockNum < 0) {
            toast.error("Estoque não pode ser negativo");
            return;
        }

        if (editingProduct) {
            updateProduct.mutate({
                id: editingProduct.id,
                name: productForm.name,
                description: productForm.description,
                price: priceNum,
                stock: stockNum,
                availableSizes: productForm.availableSizes || undefined,
                imageUrl: productForm.imageUrl || undefined,
                eventId: eventId,
            });
        } else {
            createProduct.mutate({
                name: productForm.name,
                description: productForm.description,
                price: priceNum,
                stock: stockNum,
                availableSizes: productForm.availableSizes || undefined,
                imageUrl: productForm.imageUrl || undefined,
                eventId: eventId,
            });
        }
    };

    const handleDeleteProduct = (id: string, name: string) => {
        if (window.confirm(`Tem certeza que deseja apagar o produto "${name}"?`)) {
            deleteProduct.mutate({ id });
        }
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

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Navbar />

            <div className="container py-8">
                <div className="mb-6">
                    <Link href="/organizer">
                        <Button variant="ghost" size="sm" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar ao Painel
                        </Button>
                    </Link>
                </div>

                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-3">
                            <ShoppingBag className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                            Minha Loja
                        </h1>
                        <p className="text-muted-foreground text-sm md:text-base">Gerencie itens da sua operação.</p>
                    </div>
                    <div className="flex shrink-0">
                        <Dialog open={productDialogOpen} onOpenChange={(open) => {
                            setProductDialogOpen(open);
                            if (!open) { setTimeout(() => { resetForm(); setEditingProduct(null); }, 200); }
                        }}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 w-full md:w-auto h-11 md:h-10">
                                    <Plus className="h-4 w-4" />
                                    Adicionar Produto
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
                                    <DialogDescription>
                                        Preencha os detalhes do seu item. O produto será visível para compra logo em seguida.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nome do Produto *</Label>
                                        <Input id="name" value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Camiseta Oficial" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="desc">Descrição</Label>
                                        <Textarea id="desc" value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes, tamanho, material..." rows={3} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="price">Preço (R$) *</Label>
                                            <Input id="price" type="number" step="0.01" min="0" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="stock">Estoque Inicial *</Label>
                                            <Input id="stock" type="number" step="1" min="0" value={productForm.stock} onChange={e => setProductForm(f => ({ ...f, stock: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="sizes">Tamanhos Disponíveis (Opcional)</Label>
                                        <Input id="sizes" value={productForm.availableSizes} onChange={e => setProductForm(f => ({ ...f, availableSizes: e.target.value }))} placeholder="Ex: P, M, G, GG" />
                                        <p className="text-xs text-muted-foreground">Deixe em branco se não aplicável</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="image">Imagem (Opcional)</Label>
                                        <Input
                                            id="image"
                                            type="file"
                                            accept="image/*"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    try {
                                                        const b64 = await compressImage(file);
                                                        setProductForm(f => ({ ...f, imageUrl: b64 }));
                                                    } catch (err) {
                                                        toast.error('Erro ao comprimir imagem');
                                                    }
                                                }
                                            }}
                                        />
                                        {productForm.imageUrl && (
                                            <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                                <ImageIcon className="h-3 w-3" /> Imagem carregada
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button disabled={createProduct.isPending || updateProduct.isPending} onClick={handleSaveProduct}>
                                        {(createProduct.isPending || updateProduct.isPending) ? "Salvando..." : "Salvar Produto"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Product Grid */}
                {productsLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !products || products.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="text-xl font-medium text-muted-foreground mb-1">Nenhum produto cadastrado</h3>
                            <p className="text-sm text-muted-foreground max-w-sm mb-4">Adicione itens como souvenirs, aluguéis de equipamentos e merchandising.</p>
                            <Button variant="outline" onClick={() => setProductDialogOpen(true)}>Adicionar Primeiro Produto</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Tabs defaultValue="products" className="w-full mt-6">
                        <div className="overflow-x-auto pb-1 scrollbar-hide">
                            <TabsList className="mb-4 flex min-w-max">
                                <TabsTrigger value="products" className="px-6">Produtos</TabsTrigger>
                                <TabsTrigger value="orders" className="px-6">Vendas Avulsas</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="products">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {products.map((p) => (
                                    <Card key={p.id} className="overflow-hidden flex flex-col">
                                        <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
                                            {p.imageUrl ? (
                                                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon className="h-12 w-12 text-muted-foreground/20" />
                                            )}
                                            {p.stock === 0 && (
                                                <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded shadow">
                                                    ESGOTADO
                                                </div>
                                            )}
                                        </div>
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="line-clamp-1" title={p.name}>{p.name}</CardTitle>
                                            <CardDescription className="line-clamp-2 min-h-[40px] text-xs">
                                                {p.description || "Nenhuma descrição"}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0 mb-auto">
                                            <div className="flex justify-between items-end mt-2">
                                                <span className="font-bold text-lg text-primary">{formatCurrency(p.price)}</span>
                                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.stock > 0 ? 'bg-secondary text-secondary-foreground' : 'bg-red-100 text-red-800 dark:bg-red-900/30'}`}>
                                                    {p.stock} em estoque
                                                </span>
                                            </div>
                                            {p.availableSizes && (
                                                <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-1.5 rounded-md border text-center">
                                                    Variações: <span className="font-semibold text-foreground/80">{p.availableSizes}</span>
                                                </div>
                                            )}
                                        </CardContent>
                                        <CardFooter className="p-4 pt-0 flex gap-2 border-t mt-4 border-t-muted/40 pt-4">
                                            <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleEditClick(p)}>
                                                <Pencil className="h-3 w-3 mr-1" /> Editar
                                            </Button>
                                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDeleteProduct(p.id, p.name)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="orders">
                            <Card className="mt-2">
                                <CardHeader>
                                    <CardTitle>Histórico de Vendas Avulsas</CardTitle>
                                    <CardDescription>
                                        Acompanhe os pedidos públicos realizados fora das inscrições padrão do evento.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {ordersLoading ? (
                                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                    ) : !orders || orders.length === 0 ? (
                                        <div className="text-center p-8 text-muted-foreground border border-dashed rounded-md">
                                            Nenhum pedido avulso realizado ainda.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Data</TableHead>
                                                        <TableHead>Comprador</TableHead>
                                                        <TableHead>Produto/Variações</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {orders.map((row) => {
                                                        const o = row.order;
                                                        const p = row.product;
                                                        let sizes: string[] = [];
                                                        try {
                                                            sizes = Array.isArray(o.sizes)
                                                                ? o.sizes
                                                                : (typeof o.sizes === 'string' ? JSON.parse(o.sizes) : []);
                                                        } catch (e) {
                                                            console.error("Error parsing sizes:", e);
                                                        }
                                                        const date = format(new Date(o.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR });

                                                        return (
                                                            <TableRow key={o.id}>
                                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{date}</TableCell>
                                                                <TableCell>
                                                                    <p className="font-medium text-sm">{o.buyerName}</p>
                                                                    <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                                                                    {o.buyerPhone && <p className="text-xs text-muted-foreground">{o.buyerPhone}</p>}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <p className="font-semibold text-sm">{o.quantity}x {p.name}</p>
                                                                    {sizes.length > 0 && (
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            Tam: <span className="font-medium">{sizes.filter(Boolean).join(", ")}</span>
                                                                        </p>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={o.status === "PAID" ? "default" : o.status === "SHIPPED" ? "secondary" : "outline"} className="text-xs">
                                                                        {o.status}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-right font-bold text-primary">
                                                                    {formatCurrency(o.totalAmount)}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}

            </div>
        </div>
    );
}
