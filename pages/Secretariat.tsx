import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Loader2, Package, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

export default function Secretariat() {
    const params = useParams<any>();
    const eventId = parseInt(params?.id || "0", 10);
    const [searchTerm, setSearchTerm] = useState("");

    const { data: event, isLoading: eventLoading } = trpc.events.get.useQuery(
        { id: eventId },
        { enabled: eventId > 0 }
    );

    const { data: categories, isLoading: categoriesLoading } = trpc.categories.listByEvent.useQuery(
        { eventId: eventId },
        { enabled: eventId > 0 }
    );

    const { data: registrations, isLoading: regsLoading } = trpc.registrations.getEventRegistrationsForSecretariat.useQuery(
        { eventId: eventId },
        { enabled: eventId > 0 }
    );

    const utils = trpc.useUtils();
    const toggleCheckinMutation = trpc.registrations.toggleCheckinStatus.useMutation({
        onSuccess: () => {
            utils.registrations.getEventRegistrationsForSecretariat.invalidate({ eventId });
        }
    });

    if (eventLoading || regsLoading || categoriesLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!event) {
        return <div className="p-4 text-center">Evento não encontrado.</div>;
    }

    const handleToggle = (registrationId: number, field: "isCheckedIn" | "kitDelivered" | "waiverSigned", currentValue: boolean) => {
        toggleCheckinMutation.mutate({
            registrationId,
            [field]: !currentValue
        });
    };

    const getCategoryName = (categoryId: number) => {
        return categories?.find((c: any) => c.id === categoryId)?.name || 'Desconhecida';
    };

    const filteredRegistrations = (registrations || []).filter((reg: any) => {
        const term = searchTerm.toLowerCase();
        const pilotMatches = reg.pilotName?.toLowerCase().includes(term);
        const navMatches = reg.navigatorName?.toLowerCase().includes(term);
        const catMatches = getCategoryName(reg.categoryId).toLowerCase().includes(term);
        return pilotMatches || navMatches || catMatches;
    });

    return (
        <div className="min-h-screen bg-background pb-20">
            <Navbar />

            {/* Header com Busca */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-4 shadow-sm">
                <div className="container mx-auto max-w-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <Link href={`/organizer`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div className="flex-1">
                            <h1 className="text-xl font-bold leading-none tracking-tight">Secretaria</h1>
                            <p className="text-sm text-muted-foreground truncate">{event.name}</p>
                        </div>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground focus:text-primary transition-colors" />
                        <Input
                            className="pl-10 h-12 text-base rounded-xl bg-card border-none shadow-sm focus-visible:ring-2"
                            placeholder="Buscar por piloto, nav. ou categoria..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="container mx-auto max-w-lg p-4 space-y-4">
                {filteredRegistrations.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                        {searchTerm ? "Nenhuma inscrição encontrada para essa busca." : "Ainda não há inscritos."}
                    </div>
                ) : (
                    filteredRegistrations.map((reg: any) => {
                        const isCompleted = reg.isCheckedIn;
                        const hasPendingPayment = reg.status !== "paid" && reg.status !== "confirmed";

                        return (
                            <Card
                                key={reg.id}
                                className={`overflow-hidden transition-all duration-300 ${isCompleted
                                    ? "border-green-500/50 bg-green-50/10 dark:bg-green-950/20"
                                    : "border-border shadow-sm"
                                    }`}
                            >
                                {/* Cabeçalho do Card */}
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <CardTitle className="text-lg leading-tight mb-1 flex items-center gap-2">
                                                {reg.pilotName}
                                                {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                            </CardTitle>
                                            {reg.navigatorName && (
                                                <p className="text-sm text-muted-foreground">Nav: {reg.navigatorName}</p>
                                            )}
                                        </div>
                                        <Badge variant={isCompleted ? "default" : "secondary"} className={isCompleted ? "bg-green-500" : ""}>
                                            {getCategoryName(reg.categoryId)}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                {/* Meio do Card: O Kit e Pagamento */}
                                <CardContent className="p-4 pt-2">
                                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <Package className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                            <div className="text-sm">
                                                <span className="font-semibold">Kit / Produtos:</span>
                                                {reg.purchasedProducts && Array.isArray(reg.purchasedProducts) && reg.purchasedProducts.length > 0 ? (
                                                    <ul className="mt-1 space-y-1">
                                                        {reg.purchasedProducts.map((p: any, idx: number) => (
                                                            <li key={idx} className="text-muted-foreground flex gap-1">
                                                                <span>{p.quantity}x</span>
                                                                <span>{p.name || `Produto ID ${p.productId}`}</span>
                                                                {p.size && <span className="font-medium text-foreground ml-1">(Tam: {p.size.toUpperCase()})</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <span className="text-muted-foreground ml-1">Nenhum produto extra / Apenas inscrição</span>
                                                )}
                                                {/* Camisas da inscrição base */}
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {reg.pilotShirtSize && `Camisa Piloto: ${reg.pilotShirtSize.toUpperCase()}`}
                                                    {reg.navigatorShirtSize && ` | Camisa Nav: ${reg.navigatorShirtSize.toUpperCase()}`}
                                                </div>
                                            </div>
                                        </div>

                                        {hasPendingPayment && (
                                            <div className="mt-2 text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-200 dark:border-red-900">
                                                ⚠️ ALERTA: Pagamento Pendente ou Não Confirmado
                                            </div>
                                        )}
                                    </div>
                                </CardContent>

                                {/* Rodapé do Card: A Ação (Switches Grandes) */}
                                <CardFooter className="p-4 bg-card border-t grid grid-cols-1 gap-4">

                                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                                        <Label htmlFor={`waiver-${reg.id}`} className="flex flex-col gap-1 cursor-pointer">
                                            <span className="text-base font-semibold">Termo Assinado</span>
                                            <span className="text-xs text-muted-foreground font-normal">Documentação conferida</span>
                                        </Label>
                                        <Switch
                                            id={`waiver-${reg.id}`}
                                            checked={reg.waiverSigned}
                                            onCheckedChange={() => handleToggle(reg.id, "waiverSigned", reg.waiverSigned)}
                                            className="scale-125 data-[state=checked]:bg-primary"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                                        <Label htmlFor={`kit-${reg.id}`} className="flex flex-col gap-1 cursor-pointer">
                                            <span className="text-base font-semibold">Kit Entregue</span>
                                            <span className="text-xs text-muted-foreground font-normal">Adesivos e camisas</span>
                                        </Label>
                                        <Switch
                                            id={`kit-${reg.id}`}
                                            checked={reg.kitDelivered}
                                            onCheckedChange={() => handleToggle(reg.id, "kitDelivered", reg.kitDelivered)}
                                            className="scale-125 data-[state=checked]:bg-primary"
                                        />
                                    </div>

                                    <div className={`flex items-center justify-between p-3 rounded-xl transition-colors border ${reg.isCheckedIn ? 'border-green-500 bg-green-500/10' : 'border-border bg-background'}`}>
                                        <Label htmlFor={`checkin-${reg.id}`} className="flex flex-col gap-1 cursor-pointer">
                                            <span className={`text-lg font-bold ${reg.isCheckedIn ? 'text-green-600 dark:text-green-400' : ''}`}>Check-in Concluído</span>
                                            <span className="text-xs text-muted-foreground font-normal">Piloto liberado para largada</span>
                                        </Label>
                                        <Switch
                                            id={`checkin-${reg.id}`}
                                            checked={reg.isCheckedIn}
                                            onCheckedChange={() => handleToggle(reg.id, "isCheckedIn", reg.isCheckedIn)}
                                            className="scale-150 data-[state=checked]:bg-green-500 translate-x-1"
                                        />
                                    </div>

                                </CardFooter>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
