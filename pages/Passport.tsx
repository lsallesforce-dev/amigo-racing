import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Trophy,
    MapPin,
    CalendarDays,
    User,
    Car,
    CheckCircle2,
    AlertCircle,
    ShoppingBag,
    ChevronRight,
    ChevronDown,
    History,
    Loader2,
    Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QRCodeSVG } from "qrcode.react";

export default function Passport() {
    const { accessHash } = useParams<{ accessHash: string }>();
    const [historyOpen, setHistoryOpen] = useState(false);

    const { data: passport, isLoading: isPassportLoading, error: passportError } =
        trpc.participants.getPassportByHash.useQuery(
            { accessHash: accessHash || "" },
            { enabled: !!accessHash, retry: false }
        );

    // Use the pilot's CPF to fetch history, assuming it might be needed or provided in reg
    // However, the backend query was designed to take a CPF. Let's look at the reg fields.
    // Wait, I need to check what the backend returns for CPF.
    // I'll check my previous tool output for the backend logic.
    // getPassportByHash returns: event, registration (id, pilotName, navigatorName, categoryName, vehicle, startNumber), products, financial, secretariat.
    // It DOES NOT return the CPF for security reasons in getPassportByHash.
    // Ah, the user said: "(usando o CPF do piloto retornado na primeira query)".
    // I should check if I missed CPF in the returned registration object in my previous implementation.
    // I'll check server/routers.ts again.

    if (isPassportLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground animate-pulse">Carregando seu Passaporte Digital...</p>
            </div>
        );
    }

    if (passportError || !passport) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Passaporte não encontrado</h1>
                <p className="text-muted-foreground mb-6">O link que você acessou parece estar incorreto ou expirou.</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="text-primary font-medium hover:underline"
                >
                    Voltar para o Início
                </button>
            </div>
        );
    }

    const { event, registration, products, financial, secretariat } = passport;
    const productsList = (products as any[]) || [];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
            {/* Top Banner / Event Header */}
            <div className="bg-primary text-primary-foreground pt-12 pb-24 px-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-16 -mb-16 blur-2xl" />

                <div className="max-w-md mx-auto relative z-10">
                    <div className="flex items-center gap-2 mb-4 opacity-90">
                        <Trophy className="h-5 w-5" />
                        <span className="text-xs font-bold tracking-widest uppercase">Passaporte Digital</span>
                    </div>
                    <h1 className="text-3xl font-black leading-tight mb-4">{event.name}</h1>
                    <div className="flex flex-col gap-2 opacity-90 text-sm">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4" />
                            <span>{format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{event.location} • {event.city}/{event.state}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-md mx-auto px-4 -mt-16 relative z-20">
                {/* Main Passport Card */}
                <Card className="shadow-xl border-none overflow-hidden mb-6">
                    <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary-foreground/20" />
                    <CardHeader className="pb-4 text-center">
                        <div className="flex justify-center mb-6">
                            <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-slate-100">
                                <QRCodeSVG
                                    value={accessHash || ""}
                                    size={180}
                                    level="H"
                                    includeMargin={false}
                                    className="rounded-lg"
                                />
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-black mb-1">{registration.pilotName}</CardTitle>
                        {registration.navigatorName && (
                            <p className="text-muted-foreground font-medium flex items-center justify-center gap-2">
                                <span className="text-xs uppercase tracking-tighter opacity-50">Navegador:</span> {registration.navigatorName}
                            </p>
                        )}
                        <div className="mt-4 flex flex-col gap-1 items-center">
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-bold">
                                {registration.categoryName}
                            </Badge>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                <Car className="h-3 w-3" />
                                <span>{registration.vehicle}</span>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-2 border-t border-slate-50">
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50 tracking-wider">Status Financeiro</span>
                                <div className="flex items-center gap-2 mt-auto">
                                    {financial.status === 'confirmed' || financial.status === 'paid' ? (
                                        <Badge className="bg-emerald-500 hover:bg-emerald-500 border-none px-2.5">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Pago
                                        </Badge>
                                    ) : (
                                        <Badge variant="destructive" className="px-2.5">
                                            <AlertCircle className="h-3 w-3 mr-1" /> Pendente
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50 tracking-wider">Check-in / Vistoria</span>
                                <div className="flex items-center gap-2 mt-auto">
                                    {secretariat.isCheckedIn ? (
                                        <Badge className="bg-blue-500 hover:bg-blue-500 border-none px-2.5">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Liberado
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-none px-2.5">
                                            <Clock className="h-3 w-3 mr-1" /> Pendente
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Kits / Products Section */}
                        {productsList.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                                    <ShoppingBag className="h-3.5 w-3.5" /> Seus Kits e Itens
                                </h4>
                                <div className="space-y-2">
                                    {productsList.map((p: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-card">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm leading-tight">{p.name}</span>
                                                <span className="text-xs text-muted-foreground">Tamanho: {p.size || '-'}</span>
                                            </div>
                                            <div className="text-xs font-bold bg-muted px-2 py-1 rounded">
                                                {p.quantity}x
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {secretariat.kitDelivered ? (
                                    <div className="flex items-center gap-2 p-2 px-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Kits já retirados na secretaria.
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 p-2 px-3 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-medium">
                                        <AlertCircle className="h-4 w-4" />
                                        Apresente esta tela na tenda para retirar seus kits.
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4 justify-between">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">ID Inscrição: #{registration.id}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Token: {accessHash?.slice(0, 8)}...</span>
                    </CardFooter>
                </Card>

                {/* History Section - Custom Toggle */}
                <div className="mt-8">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 text-center">Registros de Carreira</h3>
                    <div className="w-full">
                        <button
                            onClick={() => setHistoryOpen(!historyOpen)}
                            className="w-full p-4 bg-card rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors hover:bg-slate-50/50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <History className="h-5 w-5 text-primary" />
                                </div>
                                <div className="text-left">
                                    <span className="font-bold">Meu Histórico de Provas</span>
                                    <p className="text-xs text-muted-foreground font-normal">Veja suas participações anteriores</p>
                                </div>
                            </div>
                            {historyOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground rotate-180 transition-transform" /> : <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform" />}
                        </button>
                        {historyOpen && (
                            <div className="pt-4 px-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                <ParticipantHistory cpf={registration.pilotCpf} />
                            </div>
                        )}
                    </div>
                </div>

                {/* CBA Rules / Disclaimers */}
                <div className="mt-12 text-center text-[10px] text-muted-foreground opacity-60 leading-relaxed max-w-[280px] mx-auto">
                    Este passaporte é de uso pessoal e intransferível.
                    Apresente-o na secretaria do evento para agilizar seu processo de vistoria e check-in.
                    <br />
                    © Amigo Racing • Plataforma Oficial de Cronometragem
                </div>
            </div>
        </div>
    );
}

// History component using the pilot's CPF
function ParticipantHistory({ cpf }: { cpf: string }) {
    const { data: history, isLoading } = trpc.participants.getParticipantHistoryByCpf.useQuery({ cpf });

    if (isLoading) {
        return (
            <div className="py-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!history || history.length === 0) {
        return (
            <div className="py-8 text-center text-muted-foreground text-xs italic">
                Nenhum registro anterior encontrado para este competidor.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {history.map((h) => (
                <div
                    key={h.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
                    onClick={() => window.location.href = `/passport/${h.accessHash}`}
                >
                    <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-sm">{h.eventName}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase">
                            {format(new Date(h.eventDate || ""), "dd/MM/yyyy")} • {h.status === 'paid' ? 'Finalizado' : 'Inscrito'}
                        </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                </div>
            ))}
        </div>
    );
}
