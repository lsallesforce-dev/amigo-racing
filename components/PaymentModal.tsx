import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { CreditCard, QrCode, Loader2, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface PaymentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    registrationId?: number;
    orderId?: string;
    amount: number;
    eventName: string;
    categoryName: string;
}

export function PaymentModal({
    open,
    onOpenChange,
    registrationId,
    orderId,
    amount,
    eventName,
    categoryName,
}: PaymentModalProps) {
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card'>('pix');
    const [step, setStep] = useState<'select' | 'processing' | 'pix_waiting' | 'success'>('select');

    // Estado do pagamento PIX
    const [pixCode, setPixCode] = useState<string>('');
    const [pixQrCodeUrl, setPixQrCodeUrl] = useState<string>('');
    const [timeLeft, setTimeLeft] = useState(1800);
    const [paymentError, setPaymentError] = useState<string>('');

    // Estado do cartão de crédito
    const [cardData, setCardData] = useState({
        card_number: '',
        card_holder_name: '',
        card_expiration_date: '',
        card_cvv: '',
    });

    const [billingAddress, setBillingAddress] = useState({
        zipCode: '',
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        state: '',
    });

    // Mutation para criar pagamento
    const createPayment = trpc.payments.createPayment.useMutation({
        onSuccess: (data) => {
            console.log('[PaymentModal] Resposta completa:', JSON.stringify(data, null, 2));

            if (paymentMethod === 'pix') {
                const code = data.pixCode || '';
                const qrUrl = data.pixQrCodeUrl || '';
                const failureReason = (data as any).failureReason || null;

                console.log('[PaymentModal] Dados PIX:', { pixCode: code, pixQrCodeUrl: qrUrl, failureReason });

                setPixCode(code);
                if (qrUrl) {
                    setPixQrCodeUrl(`/api/qr-code?url=${encodeURIComponent(qrUrl)}`);
                }

                // Verificar se o pagamento falhou
                if (data.status === 'failed') {
                    // Mostrar razão específica do erro
                    let errorMsg = 'Erro ao processar pagamento PIX';
                    if (failureReason) {
                        // Mapear erros conhecidos da Pagar.me
                        if (failureReason.toLowerCase().includes('recipient') || failureReason.toLowerCase().includes('account')) {
                            errorMsg = 'Conta bancária do organizador não está ativa. Entre em contato com o organizador para validar os dados bancários.';
                        } else if (failureReason.toLowerCase().includes('invalid') || failureReason.toLowerCase().includes('validation')) {
                            errorMsg = 'Dados bancários inválidos. Verifique com o organizador.';
                        } else if (failureReason.toLowerCase().includes('split') || failureReason.toLowerCase().includes('amount')) {
                            errorMsg = 'Erro na divisão de pagamento. Tente novamente.';
                        } else if (failureReason.toLowerCase().includes('pix')) {
                            errorMsg = 'Erro ao gerar PIX. Tente novamente em alguns momentos.';
                        } else {
                            errorMsg = `Erro: ${failureReason}`;
                        }
                    } else {
                        errorMsg = 'QR Code PIX não foi gerado. Verifique se os dados bancários do organizador foram configurados.';
                    }
                    setPaymentError(errorMsg);
                    setStep('pix_waiting');
                    toast.error(errorMsg);
                } else if (!code) {
                    setPaymentError('Erro: Código PIX não foi gerado. Verifique se os dados bancários do organizador foram configurados.');
                    setStep('pix_waiting');
                    toast.error('Código PIX não foi gerado');
                } else {
                    setPaymentError('');
                    setStep('pix_waiting');
                    toast.success('QR Code PIX gerado com sucesso!');
                }
            } else {
                // Lógica de Cartão de Crédito
                if (data.success && (data.status === 'paid' || data.status === 'authorized')) {
                    setStep('success');
                    toast.success('Pagamento autorizado com sucesso!');
                } else {
                    const errMsg = (data as any).message ||
                        (data.status === 'reproved' || data.gatewayResponse?.antifraud_response?.status === 'reproved' ? "Bloqueado pelo Antifraude do Pagar.me" :
                            (data.acquirerMessage === "Transação aprovada com sucesso" ? "Bloqueado por suspeita de fraude" : data.acquirerMessage)) ||
                        data.gatewayResponse?.errors?.[0]?.message ||
                        'Cartão recusado ou dados inválidos';
                    console.error('[PaymentModal] Payment FAILED:', data);
                    setPaymentError(`Pagamento não autorizado: ${errMsg}`);
                    toast.error(`Não autorizado: ${errMsg}`);
                    setStep('select');
                }
            }
        },
        onError: (error) => {
            console.error('[PaymentModal] Erro na mutation:', error);
            setPaymentError(`Erro ao processar pagamento: ${error.message}`);
            toast.error(`Erro ao processar pagamento: ${error.message}`);
            setStep('select');
        },
    });

    // Query para verificar status do pagamento
    const { data: paymentStatus, refetch: refetchStatus } = trpc.payments.getPaymentStatus.useQuery(
        { registrationId: registrationId || 0 }, // Using a pseudo ID if undefined because standalone endpoint doesn't support getPaymentStatus yet. Fallback to Sonner success.
        { enabled: step === 'pix_waiting' && !!registrationId, refetchInterval: 5000 }
    );

    // Countdown timer para PIX
    useEffect(() => {
        if (step === 'pix_waiting' && timeLeft > 0) {
            const timer = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [step, timeLeft]);

    // Verificar se pagamento foi confirmado
    useEffect(() => {
        if (paymentStatus?.paid) {
            setStep('success');
            toast.success('Pagamento confirmado!');
        }
    }, [paymentStatus]);

    // Formatar tempo restante
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Copiar código PIX
    const copyPixCode = () => {
        navigator.clipboard.writeText(pixCode);
        toast.success('Código PIX copiado!');
    };

    // Processar pagamento
    const handlePayment = () => {
        if (paymentMethod === 'credit_card') {
            if (!cardData.card_number || !cardData.card_holder_name || cardData.card_expiration_date.length < 4 || !cardData.card_cvv) {
                toast.error('Preencha todos os dados do cartão corretamente');
                return;
            }
            if (!billingAddress.zipCode || !billingAddress.street || !billingAddress.number || !billingAddress.neighborhood || !billingAddress.city || !billingAddress.state) {
                toast.error('Preencha todos os campos do endereço de cobrança');
                return;
            }
        }

        setStep('processing');
        setPaymentError('');

        const formattedCardData = paymentMethod === 'credit_card' ? {
            number: cardData.card_number.replace(/\D/g, ''),
            holder_name: cardData.card_holder_name,
            exp_month: parseInt(cardData.card_expiration_date.substring(0, 2)),
            exp_year: 2000 + parseInt(cardData.card_expiration_date.substring(2, 4)),
            cvv: cardData.card_cvv,
            installments: 1,
            billingAddress: {
                zipCode: billingAddress.zipCode,
                street: billingAddress.street,
                number: billingAddress.number,
                neighborhood: billingAddress.neighborhood,
                city: billingAddress.city,
                state: billingAddress.state,
            }
        } : undefined;
        createPayment.mutate({
            registrationId,
            orderId,
            paymentMethod,
            cardData: formattedCardData,
        });
    };

    // Formatar número do cartão
    const formatCardNumber = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
        return formatted.substring(0, 19);
    };

    // Formatar data de validade
    const formatExpirationDate = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length >= 2) {
            return cleaned.substring(0, 2) + (cleaned.length > 2 ? cleaned.substring(2, 4) : '');
        }
        return cleaned;
    };

    // Resetar ao fechar
    const handleClose = () => {
        setStep('select');
        setPaymentMethod('pix');
        setPixCode('');
        setTimeLeft(1800);
        setPaymentError('');
        setCardData({
            card_number: '',
            card_holder_name: '',
            card_expiration_date: '',
            card_cvv: '',
        });
        setBillingAddress({
            zipCode: '',
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Pagamento da Inscrição</DialogTitle>
                    <DialogDescription>
                        {eventName} - {categoryName}
                        <br />
                        <span className="text-lg font-semibold text-foreground">
                            R$ {amount.toFixed(2)}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                {/* Etapa: Seleção de método */}
                {step === 'select' && (
                    <div className="space-y-6">
                        <div>
                            <Label className="text-base font-semibold mb-3 block">
                                Escolha o método de pagamento
                            </Label>
                            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'pix' | 'credit_card')}>
                                <Card className={`cursor-pointer transition-colors ${paymentMethod === 'pix' ? 'border-primary' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center space-x-3">
                                            <RadioGroupItem value="pix" id="pix" />
                                            <Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer flex-1">
                                                <QrCode className="h-5 w-5 text-primary" />
                                                <div>
                                                    <div className="font-semibold">PIX</div>
                                                    <div className="text-sm text-muted-foreground">Pagamento instantâneo</div>
                                                </div>
                                            </Label>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className={`cursor-pointer transition-colors ${paymentMethod === 'credit_card' ? 'border-primary' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center space-x-3">
                                            <RadioGroupItem value="credit_card" id="credit_card" />
                                            <Label htmlFor="credit_card" className="flex items-center gap-2 cursor-pointer flex-1">
                                                <CreditCard className="h-5 w-5 text-primary" />
                                                <div>
                                                    <div className="font-semibold">Cartão de Crédito</div>
                                                    <div className="text-sm text-muted-foreground">Aprovação imediata</div>
                                                </div>
                                            </Label>
                                        </div>
                                    </CardContent>
                                </Card>
                            </RadioGroup>
                        </div>

                        {/* Formulário de cartão de crédito */}
                        {paymentMethod === 'credit_card' && (
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="card_number">Número do Cartão</Label>
                                    <Input
                                        id="card_number"
                                        placeholder="0000 0000 0000 0000"
                                        value={cardData.card_number}
                                        onChange={(e) => setCardData({ ...cardData, card_number: formatCardNumber(e.target.value) })}
                                        maxLength={19}
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="card_holder_name">Nome no Cartão</Label>
                                    <Input
                                        id="card_holder_name"
                                        placeholder="NOME COMO NO CARTÃO"
                                        value={cardData.card_holder_name}
                                        onChange={(e) => setCardData({ ...cardData, card_holder_name: e.target.value.toUpperCase() })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="card_expiration_date">Validade</Label>
                                        <Input
                                            id="card_expiration_date"
                                            placeholder="MMAA"
                                            value={cardData.card_expiration_date}
                                            onChange={(e) => setCardData({ ...cardData, card_expiration_date: formatExpirationDate(e.target.value) })}
                                            maxLength={4}
                                        />
                                    </div>

                                    <div>
                                        <Label htmlFor="card_cvv">CVV</Label>
                                        <Input
                                            id="card_cvv"
                                            placeholder="123"
                                            type="password"
                                            value={cardData.card_cvv}
                                            onChange={(e) => setCardData({ ...cardData, card_cvv: e.target.value.replace(/\D/g, '') })}
                                            maxLength={4}
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-muted space-y-3">
                                    <Label className="text-sm font-semibold mb-2 block">Endereço de Cobrança</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="zipCode">CEP</Label>
                                            <Input
                                                id="zipCode"
                                                placeholder="00000-000"
                                                value={billingAddress.zipCode}
                                                onChange={(e) => setBillingAddress({ ...billingAddress, zipCode: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="number">Número</Label>
                                            <Input
                                                id="number"
                                                placeholder="123"
                                                value={billingAddress.number}
                                                onChange={(e) => setBillingAddress({ ...billingAddress, number: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="street">Rua</Label>
                                        <Input
                                            id="street"
                                            placeholder="Rua..."
                                            value={billingAddress.street}
                                            onChange={(e) => setBillingAddress({ ...billingAddress, street: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="neighborhood">Bairro</Label>
                                            <Input
                                                id="neighborhood"
                                                placeholder="Bairro"
                                                value={billingAddress.neighborhood}
                                                onChange={(e) => setBillingAddress({ ...billingAddress, neighborhood: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="city">Cidade/UF</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="city"
                                                    placeholder="Cidade"
                                                    className="flex-1"
                                                    value={billingAddress.city}
                                                    onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                                                />
                                                <Input
                                                    id="state"
                                                    placeholder="UF"
                                                    className="w-16"
                                                    maxLength={2}
                                                    value={billingAddress.state}
                                                    onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value.toUpperCase() })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {paymentError && (
                            <div className="mb-4 space-y-3">
                                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                                    <p className="text-xs text-red-800 dark:text-red-200">{paymentError}</p>
                                </div>
                                {(paymentError.includes('antifraude') || paymentError.includes('suspeita')) && (
                                    <Button
                                        onClick={() => {
                                            setPaymentError('');
                                            createPayment.mutate({
                                                registrationId: registrationId!,
                                                paymentMethod: 'credit_card',
                                                cardData: {
                                                    number: cardData.card_number.replace(/\D/g, ''),
                                                    holder_name: cardData.card_holder_name,
                                                    exp_month: parseInt(cardData.card_expiration_date.substring(0, 2)),
                                                    exp_year: 2000 + parseInt(cardData.card_expiration_date.substring(2, 4)),
                                                    cvv: cardData.card_cvv,
                                                    installments: 1,
                                                    billingAddress: {
                                                        zipCode: billingAddress.zipCode,
                                                        street: billingAddress.street,
                                                        number: billingAddress.number,
                                                        neighborhood: billingAddress.neighborhood,
                                                        city: billingAddress.city,
                                                        state: billingAddress.state,
                                                    },
                                                    bypassAntifraud: true
                                                }
                                            });
                                        }}
                                        disabled={createPayment.isPending}
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                                    >
                                        {createPayment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        Reprocessar sem Antifraude (Sugerido pelo Suporte)
                                    </Button>
                                )}
                            </div>
                        )}

                        <Button
                            onClick={handlePayment}
                            className="w-full"
                            size="lg"
                            disabled={
                                createPayment.isPending || (
                                    paymentMethod === 'credit_card' && (
                                        !cardData.card_number ||
                                        !cardData.card_holder_name ||
                                        cardData.card_expiration_date.length < 4 ||
                                        !cardData.card_cvv
                                    )
                                )
                            }
                        >
                            {createPayment.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {paymentMethod === 'pix' ? 'Gerar QR Code PIX' : 'Pagar com Cartão'}
                        </Button>
                    </div>
                )}

                {/* Etapa: Processando */}
                {step === 'processing' && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-center text-muted-foreground">
                            Processando pagamento...
                        </p>
                    </div>
                )}

                {/* Etapa: Aguardando pagamento PIX */}
                {step === 'pix_waiting' && (
                    <div className="space-y-4">
                        {/* Exibir erro se houver */}
                        {paymentError && (
                            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                                <div className="flex gap-2 items-start">
                                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">{paymentError}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-muted p-4 rounded-lg text-center">
                            <p className="text-sm text-muted-foreground mb-2">Tempo restante</p>
                            <p className="text-2xl font-bold text-primary">{formatTime(timeLeft)}</p>
                        </div>

                        {/* QR Code - Imagem do Pagar.me ou gerado localmente */}
                        {pixCode && (
                            <div className="flex justify-center">
                                <div className="p-4 bg-white rounded-lg border border-gray-200">
                                    {pixQrCodeUrl ? (
                                        <img
                                            src={pixQrCodeUrl}
                                            alt="QR Code PIX"
                                            className="w-64 h-64"
                                            onError={() => console.error('[PaymentModal] Erro ao carregar QR code')}
                                        />
                                    ) : (
                                        <QRCodeSVG
                                            value={pixCode}
                                            size={256}
                                            level="H"
                                            includeMargin={true}
                                            className="w-64 h-64"
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Mensagem se código PIX não estiver disponível */}
                        {!pixCode && (
                            <div className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                <QrCode className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-2" />
                                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold">Gerando QR Code...</p>
                            </div>
                        )}

                        {/* Código PIX em texto - SEMPRE VISÍVEL */}
                        {pixCode ? (
                            <div>
                                <Label className="text-sm text-muted-foreground">Código PIX Copia e Cola</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input value={pixCode} readOnly className="font-mono text-xs break-all" />
                                    <Button variant="outline" size="icon" onClick={copyPixCode}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                                <div className="flex gap-2 items-start">
                                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">Código PIX não foi gerado</p>
                                        <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                            Verifique se os dados bancários do organizador foram configurados. Tente novamente ou use outro método de pagamento.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mensagem de instrução */}
                        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                                📱 Escaneie o QR Code com o app do seu banco ou copie o código PIX para realizar o pagamento.
                                Aguardando confirmação...
                            </p>
                        </div>

                        <Button variant="outline" onClick={handleClose} className="w-full">
                            Cancelar
                        </Button>
                    </div>
                )}

                {/* Etapa: Sucesso */}
                {step === 'success' && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <CheckCircle2 className="h-16 w-16 text-green-500" />
                        <div className="text-center">
                            <h3 className="text-lg font-semibold">Pagamento Confirmado!</h3>
                            <p className="text-muted-foreground mt-2">
                                Sua inscrição foi confirmada com sucesso.
                            </p>
                        </div>
                        <Button onClick={handleClose} className="w-full">
                            Fechar
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
