import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Trophy, Plus, Loader2, ArrowLeft, CalendarDays } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";

export default function Championships() {
    const { user, isAuthenticated, loading } = useAuth();
    const [, setLocation] = useLocation();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState({
        name: "",
        year: new Date().getFullYear().toString(),
        discardRule: "0",
    });

    const utils = trpc.useUtils();

    // Get current organizer context
    const { data: myContext } = trpc.organizerMembers.myContext.useQuery(undefined, { enabled: isAuthenticated });
    const { data: myPermissions } = trpc.organizerMembers.myPermissions.useQuery(undefined, { enabled: isAuthenticated });

    const isOrganizerOrAdmin = isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin');
    const canManageEvents = myPermissions?.includes('events') || myPermissions?.includes('principal') || false;

    const principalUserId = myContext?.principalUserId || user?.id || 0;

    // We need the organizer ID to fetch championships.
    const { data: championships, isLoading: isChampionshipsLoading } = trpc.championships.getAllByOrganizer.useQuery(
        { organizerId: principalUserId },
        { enabled: isOrganizerOrAdmin && !!principalUserId }
    );

    const createMutation = trpc.championships.create.useMutation({
        onSuccess: () => {
            toast.success("Campeonato criado com sucesso!");
            setDialogOpen(false);
            setForm({ name: "", year: new Date().getFullYear().toString(), discardRule: "0" });
            utils.championships.getAllByOrganizer.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao criar campeonato");
        }
    });

    const handleCreate = () => {
        if (!form.name || !form.year) {
            toast.error("Preencha o nome e o ano do campeonato");
            return;
        }

        const yearNum = parseInt(form.year, 10);
        const discardNum = parseInt(form.discardRule, 10);

        if (isNaN(yearNum) || yearNum < 2000) {
            toast.error("Informe um ano válido");
            return;
        }

        createMutation.mutate({
            name: form.name,
            year: yearNum,
            organizerId: principalUserId,
            discardRule: isNaN(discardNum) ? 0 : discardNum,
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isOrganizerOrAdmin || !canManageEvents) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-lg text-muted-foreground mb-4">Acesso restrito a organizadores com permissão de eventos.</p>
                        {!isAuthenticated ? (
                            <Button asChild>
                                <a href={getLoginUrl()}>Entrar</a>
                            </Button>
                        ) : (
                            <Link href="/organizer">
                                <Button>Voltar</Button>
                            </Link>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            <div className="container py-8">
                <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            <Trophy className="h-8 w-8 text-primary" />
                            Campeonatos
                        </h1>
                        <p className="text-muted-foreground">Gerencie seus campeonatos e a pontuação automática.</p>
                    </div>
                    <div>
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Novo Campeonato
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Novo Campeonato</DialogTitle>
                                    <DialogDescription>Crie um novo campeonato para agregar etapas e somar pontos.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nome do Campeonato *</Label>
                                        <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Copa Paulista Off-Road" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="year">Ano *</Label>
                                            <Input id="year" type="number" min="2000" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="discardRule">Regra de Descarte</Label>
                                            <Input id="discardRule" type="number" min="0" value={form.discardRule} onChange={e => setForm({ ...form, discardRule: e.target.value })} placeholder="Ex: 1" />
                                            <p className="text-[10px] text-muted-foreground leading-tight">Nº de piores resultados descartados (N-x).</p>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                                        {createMutation.isPending ? "Criando..." : "Criar Campeonato"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* List */}
                {isChampionshipsLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !championships || championships.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <Trophy className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="text-xl font-medium text-muted-foreground mb-1">Nenhum campeonato criado</h3>
                            <p className="text-sm text-muted-foreground max-w-sm mb-4">Reúna vários eventos para somar pontos automaticamente de acordo com as regras padrão.</p>
                            <Button variant="outline" onClick={() => setDialogOpen(true)}>Criar meu primeiro campeonato</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {championships.map((champ) => (
                            <Card
                                key={champ.id}
                                className="cursor-pointer hover:border-primary/50 transition-colors flex flex-col"
                                onClick={() => setLocation(`/organizer/championships/${champ.id}`)}
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
                                    <div className="flex items-center text-sm text-muted-foreground mt-2">
                                        <CalendarDays className="h-4 w-4 mr-2" />
                                        Criado em {new Date(champ.createdAt).toLocaleDateString('pt-BR')}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-border/50">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Descarte (N-x):</span>
                                            <span className="font-medium">{champ.discardRule > 0 ? `${champ.discardRule} etapa(s)` : 'Sem descarte'}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
