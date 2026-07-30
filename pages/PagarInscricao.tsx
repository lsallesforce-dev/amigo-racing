// Página pública de cobrança: /pagar/:accessHash
//
// O competidor pendente costuma não lembrar a senha, então o link do organizador
// abre direto no pagamento — sem login. O accessHash da inscrição é o segredo que
// autoriza (mesmo token do passaporte público), validado no backend pelo
// assertPodePagarInscricao.
//
// A UI de pagamento é o PaymentModal que já existe (Pix, cartão, polling de
// status). Aqui só montamos a moldura e passamos o token adiante.
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { PaymentModal } from "@/components/PaymentModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle, CalendarDays, MapPin, CreditCard } from "lucide-react";
import { formatarDataDoBanco } from "@/shared/horarioBrasilia";

const moeda = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PagarInscricao() {
    const params = useParams() as { hash?: string };
    const accessHash = params.hash || "";
    const [modalAberto, setModalAberto] = useState(false);

    const { data, isLoading, error, refetch } = trpc.payments.getCobrancaByHash.useQuery(
        { accessHash },
        { enabled: accessHash.length >= 8, retry: false }
    );

    // Depois de fechar o modal, reconsulta: se o Pix caiu, a tela vira "confirmado".
    useEffect(() => {
        if (!modalAberto) refetch();
    }, [modalAberto]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center space-y-3">
                        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
                        <h1 className="text-lg font-bold">Link inválido</h1>
                        <p className="text-sm text-muted-foreground">
                            {error?.message || "Não encontramos esta inscrição. Confira o link com o organizador."}
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const pago = data.status === "paid";
    const cancelado = data.status === "cancelled";

    return (
        <div className="min-h-screen bg-muted/30 p-4 flex items-start sm:items-center justify-center">
            <Card className="max-w-md w-full my-8">
                <CardContent className="pt-6 space-y-5">
                    {/* cabeçalho do evento */}
                    <div className="text-center space-y-2">
                        {data.event?.logoUrl && (
                            <img
                                src={data.event.logoUrl}
                                alt={data.event.name}
                                className="h-16 mx-auto object-contain"
                            />
                        )}
                        <h1 className="text-lg font-bold leading-tight">{data.event?.name}</h1>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            {data.event?.startDate && (
                                <p className="flex items-center justify-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {formatarDataDoBanco(data.event.startDate)}
                                </p>
                            )}
                            {data.event?.location && (
                                <p className="flex items-center justify-center gap-1">
                                    <MapPin className="h-3 w-3" /> {data.event.location}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="border-t pt-4 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Piloto</span>
                            <span className="font-medium text-right">{data.pilotName}</span>
                        </div>
                        {data.navigatorName && (
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Navegador</span>
                                <span className="font-medium text-right">{data.navigatorName}</span>
                            </div>
                        )}
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Categoria</span>
                            <span className="font-medium text-right">{data.categoryName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Inscrição</span>
                            <span>{moeda(data.categoryPrice)}</span>
                        </div>
                        {data.extrasTotal > 0 && (
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">{data.extrasLabel || "Extras"}</span>
                                <span>{moeda(data.extrasTotal)}</span>
                            </div>
                        )}
                        <div className="flex justify-between gap-2 border-t pt-2 mt-2 text-base font-bold">
                            <span>Total</span>
                            <span className="text-primary">{moeda(data.total)}</span>
                        </div>
                    </div>

                    {pago ? (
                        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-4 text-center space-y-1">
                            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                            <p className="font-bold text-green-700 dark:text-green-400">Pagamento confirmado</p>
                            <p className="text-xs text-green-700/80 dark:text-green-400/80">
                                Sua vaga está garantida. Nos vemos na largada!
                            </p>
                        </div>
                    ) : cancelado ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
                            <p className="text-sm font-medium">Esta inscrição foi cancelada.</p>
                            <p className="text-xs text-muted-foreground mt-1">Fale com o organizador para reativar.</p>
                        </div>
                    ) : (
                        <>
                            <Button className="w-full gap-2 h-11" onClick={() => setModalAberto(true)}>
                                <CreditCard className="h-4 w-4" />
                                Pagar {moeda(data.total)}
                            </Button>
                            <p className="text-[11px] text-muted-foreground text-center">
                                Pix cai na hora e a confirmação é automática. Sua vaga só está garantida
                                depois do pagamento.
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>

            <PaymentModal
                open={modalAberto}
                onOpenChange={setModalAberto}
                registrationId={data.registrationId}
                accessHash={accessHash}
                amount={data.total}
                eventName={data.event?.name || ""}
                categoryName={data.categoryName}
                acceptsCreditCard={data.acceptsCreditCard}
            />
        </div>
    );
}
