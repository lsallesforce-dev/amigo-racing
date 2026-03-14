import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { DollarSign, Plus, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2, Clock, Check, Download, ShoppingBag, ArrowLeft, Trophy, Send, Wallet, Banknote, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Navbar from "@/components/Navbar";


export default function OrganizerFinance() {
    const { user, isAuthenticated, loading } = useAuth();
    const utils = trpc.useUtils();

    const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportType, setExportType] = useState<"RESUMO" | "COMPLETO">("RESUMO");
    const [form, setForm] = useState({
        description: "",
        amount: "",
        type: "INCOME" as "INCOME" | "EXPENSE",
        date: format(new Date(), "yyyy-MM-dd"),
        status: "COMPLETED" as "PENDING" | "COMPLETED",
    });

    const { data: summary, isLoading: isLoadingSummary } = trpc.finance.getSummary.useQuery(undefined, {
        enabled: isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin'),
    });

    const { data: transactions, isLoading: isLoadingTransactions } = trpc.finance.getAll.useQuery(undefined, {
        enabled: isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin'),
    });

    const createMutation = trpc.finance.create.useMutation({
        onSuccess: () => {
            toast.success("Lançamento adicionado com sucesso!");
            setIsNewEntryOpen(false);
            setForm({
                ...form,
                description: "",
                amount: "",
            });
            utils.finance.getSummary.invalidate();
            utils.finance.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao adicionar lançamento");
        }
    });

    const completeMutation = trpc.finance.markAsCompleted.useMutation({
        onSuccess: () => {
            toast.success("Baixa realizada com sucesso!");
            utils.finance.getSummary.invalidate();
            utils.finance.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao dar baixa na transação");
        }
    });

    const deleteMutation = trpc.finance.delete.useMutation({
        onSuccess: () => {
            toast.success("Lançamento excluído com sucesso!");
            utils.finance.getSummary.invalidate();
            utils.finance.getAll.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao excluir lançamento");
        }
    });

    const { data: pagarmeBalance, isLoading: isLoadingBalance } = trpc.finance.getPagarmeBalance.useQuery(undefined, {
        enabled: isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin'),
        refetchInterval: 60_000, // refresh every 60s
    });

    const payoutMutation = trpc.finance.requestPayout.useMutation({
        onSuccess: () => {
            toast.success('Transferência solicitada com sucesso! O valor será creditado em até 1 dia útil.');
            setIsPayoutOpen(false);
        },
        onError: (err) => {
            toast.error(err.message || 'Erro ao solicitar transferência');
        },
    });

    const [isPayoutOpen, setIsPayoutOpen] = useState(false);

    const handleCreate = () => {
        if (!form.description || !form.amount || !form.date) {
            toast.error("Preencha todos os campos obrigatórios");
            return;
        }

        const amountNum = parseFloat(form.amount.replace(",", "."));
        if (isNaN(amountNum) || amountNum <= 0) {
            toast.error("Valor inválido");
            return;
        }

        createMutation.mutate({
            description: form.description,
            amount: amountNum,
            type: form.type,
            date: form.date,
            status: form.status,
        });
    };

    const handleExportReport = async () => {
        try {
            toast.info("Gerando PDF do Relatório Financeiro...");

            // Try to load the official logo
            let amigoLogoBase64 = "";
            try {
                const response = await fetch('/logo-light.png');
                const blob = await response.blob();
                amigoLogoBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.warn("Não foi possível carregar a logo oficial", e);
            }

            const doc = new jsPDF({ orientation: 'portrait' });
            const pageWidth = doc.internal.pageSize.getWidth();

            const generateHeader = (title: string, subtitle: string) => {
                if (amigoLogoBase64) {
                    doc.addImage(amigoLogoBase64, 'PNG', pageWidth - 44, 10, 30, 0);
                }

                doc.setTextColor(31, 41, 55);
                doc.setFontSize(18);
                doc.setFont("helvetica", "bold");
                doc.text(title, pageWidth / 2, 28, { align: "center" });

                doc.setFontSize(12);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(107, 114, 128);
                doc.text(subtitle, pageWidth / 2, 36, { align: "center" });

                doc.setDrawColor(229, 231, 235);
                doc.line(14, 50, pageWidth - 14, 50);
            };

            generateHeader("Relatório Financeiro", `Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`);

            let currentY = 60;

            // --- Bloco de Resumo (Desenhado como uma tabela para ficar alinhado) ---
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(31, 41, 55);
            doc.text("Resumo Financeiro", 14, currentY);
            currentY += 5;

            const summaryBody = [
                ["Recebido (Manual)", formatCurrency(summary?.manualIncome || 0)],
                ["Vendas Avulsas (Loja)", formatCurrency(summary?.storeIncome || 0)],
                ["Despesas Pagas", formatCurrency(summary?.expense || 0)],
                ["Saldo Atual (Caixa)", formatCurrency((summary?.manualBalance || 0) + (pagarmeBalance?.availableBalance || 0))],
                ["A Receber (Restante Líquido)", formatCurrency(((summary?.pendingRegistrations || 0) + (summary?.pendingStoreIncome || 0)) * 0.9)],
                ["A Pagar (Agendado)", formatCurrency(summary?.pendingExpense || 0)],
                ["Previsão de Lucro Final", formatCurrency((summary?.manualBalance || 0) + (pagarmeBalance?.totalBalance || 0) + ((summary?.pendingRegistrations || 0) + (summary?.pendingStoreIncome || 0)) * 0.9 - (summary?.pendingExpense || 0))],
            ];

            autoTable(doc, {
                startY: currentY,
                body: summaryBody,
                theme: 'striped',
                styles: { fontSize: 10, cellPadding: 3 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 100 },
                    1: { halign: 'right' }
                },
                margin: { left: 14, right: 14 }
            });

            currentY = (doc as any).lastAutoTable.finalY + 15;

            // --- Tabela Completa (se selecionado "COMPLETO") ---
            if (exportType === "COMPLETO" && transactions && transactions.length > 0) {
                // Check if we need a new page for the table header
                if (currentY > doc.internal.pageSize.getHeight() - 40) {
                    doc.addPage();
                    currentY = 20;
                }

                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(31, 41, 55);
                doc.text("Detalhamento de Transações", 14, currentY);
                currentY += 5;

                const tableBody = transactions.map(tx => {
                    const txDate = new Date(new Date(tx.date).getTime() + new Date(tx.date).getTimezoneOffset() * 60000);
                    return [
                        format(txDate, "dd/MM/yyyy"),
                        tx.description,
                        tx.type === 'INCOME' ? 'Receita' : 'Despesa',
                        tx.status === 'COMPLETED' ? 'Concluído' : 'Pendente',
                        (tx.type === 'INCOME' ? '+' : '-') + ' ' + formatCurrency(tx.amount)
                    ];
                });

                autoTable(doc, {
                    startY: currentY,
                    head: [['Data', 'Descrição', 'Tipo', 'Status', 'Valor']],
                    body: tableBody,
                    theme: 'striped',
                    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 25 },
                        1: { cellWidth: 'auto' },
                        2: { cellWidth: 25, halign: 'center' },
                        3: { cellWidth: 25, halign: 'center' },
                        4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
                    },
                    styles: { fontSize: 9, cellPadding: 3, valign: 'middle' },
                    margin: { left: 14, right: 14 },
                    didParseCell: function (data) {
                        // Colorize values
                        if (data.section === 'body' && data.column.index === 4) {
                            if (data.cell.raw && typeof data.cell.raw === 'string' && data.cell.raw.startsWith('+')) {
                                data.cell.styles.textColor = [22, 163, 74]; // text-green-600
                            } else {
                                data.cell.styles.textColor = [220, 38, 38]; // text-red-600
                            }
                        }
                    }
                });
            }

            doc.save(`relatorio_financeiro_${exportType.toLowerCase()}_${format(new Date(), "yyyyMMdd")}.pdf`);
            toast.success("Relatório gerado com sucesso!");
            setIsExportDialogOpen(false);
        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            toast.error("Erro ao gerar relatório financeiro em PDF");
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
            <div className="container py-8">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <h2 className="text-2xl font-bold mb-4">Acesso Restrito</h2>
                        <p className="text-muted-foreground mb-4">
                            Você não tem permissão para acessar o Painel Financeiro.
                        </p>
                        <Link href="/">
                            <Button>Voltar para o Início</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            <div className="container py-8">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold mb-1">Resumo Financeiro</h1>
                        <p className="text-muted-foreground">Gerencie suas receitas e despesas</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} className="gap-2 h-10">
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Exportar Relatório</span>
                            <span className="sm:hidden">Exportar</span>
                        </Button>

                        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Exportar Relatório</DialogTitle>
                                    <DialogDescription>
                                        Escolha o formato do relatório financeiro que deseja gerar em PDF.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="export-type">Tipo de Relatório</Label>
                                        <Select
                                            value={exportType}
                                            onValueChange={(value: "RESUMO" | "COMPLETO") => setExportType(value)}
                                        >
                                            <SelectTrigger id="export-type">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="RESUMO">Resumido (Apenas Totais)</SelectItem>
                                                <SelectItem value="COMPLETO">Completo (Totais + Transações)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {exportType === "RESUMO"
                                                ? "Gera um PDF contendo apenas a visão geral e totais."
                                                : "Gera um PDF detalhado incluindo a tabela de todas as transações."}
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleExportReport}>Gerar PDF</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isNewEntryOpen} onOpenChange={setIsNewEntryOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white h-10">
                                    <Plus className="h-4 w-4" />
                                    <span className="hidden sm:inline">Novo Lançamento</span>
                                    <span className="sm:hidden">Lançar</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Novo Lançamento</DialogTitle>
                                    <DialogDescription>Adicione uma nova receita ou despesa manual</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="type">Tipo</Label>
                                        <Select
                                            value={`${form.type}_${form.status}`}
                                            onValueChange={(value: string) => {
                                                const [type, status] = value.split('_') as ["INCOME" | "EXPENSE", "PENDING" | "COMPLETED"];
                                                setForm({ ...form, type, status });
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="INCOME_COMPLETED">Receita (Já Recebida)</SelectItem>
                                                <SelectItem value="INCOME_PENDING">Receita (A Receber)</SelectItem>
                                                <SelectItem value="EXPENSE_COMPLETED">Despesa (Já Paga)</SelectItem>
                                                <SelectItem value="EXPENSE_PENDING">Despesa (A Pagar)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Descrição</Label>
                                        <Input
                                            id="description"
                                            value={form.description}
                                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                                            placeholder="Ex: Patrocínio, Pagamento de Fornecedor..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="amount">Valor (R$)</Label>
                                            <Input
                                                id="amount"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={form.amount}
                                                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="date">Data</Label>
                                            <Input
                                                id="date"
                                                type="date"
                                                value={form.date}
                                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsNewEntryOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                                        {createMutation.isPending ? "Salvando..." : "Salvar Lançamento"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* ===== PAGAR.ME BALANCE CARDS ===== */}
                {pagarmeBalance?.hasRecipient && (
                    <div className="mb-8">
                        <h2 className="text-lg font-semibold mb-4 text-foreground/80 flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-[#00a19c]" /> Saldo Pagar.me
                        </h2>
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                            {/* Card 1: Saldo Total */}
                            <Card className="border-[#00a19c]/30 bg-gradient-to-br from-[#00a19c]/5 to-[#00a19c]/10">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium text-[#00695c]">Saldo Pagar.me</CardTitle>
                                    <Wallet className="h-4 w-4 text-[#00a19c]" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-[#00695c]">
                                        {isLoadingBalance ? <Loader2 className="h-5 w-5 animate-spin" /> : formatCurrency(pagarmeBalance?.totalBalance || 0)}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">Total acumulado (90% das inscrições)</p>
                                </CardContent>
                            </Card>

                            {/* Card 2: Disponível para Saque - HIGHLIGHTED */}
                            <Card className="border-green-500 shadow-lg shadow-green-500/20 bg-gradient-to-br from-green-500/10 to-green-600/20 dark:from-green-500/20 dark:to-green-600/10 scale-105 z-10">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-bold text-green-700 dark:text-green-400">Disponível para Saque</CardTitle>
                                    <Banknote className="h-5 w-5 text-green-600 animate-pulse" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-extrabold text-green-700 dark:text-green-400">
                                        {isLoadingBalance ? <Loader2 className="h-6 w-6 animate-spin" /> : formatCurrency(pagarmeBalance?.availableBalance || 0)}
                                    </div>
                                    <p className="text-xs font-medium text-green-600/80 mt-1 italic">Liquidado e pronto para transferência agora</p>
                                </CardContent>
                            </Card>

                            {/* Card 3: Botão Transferir */}
                            <Card className="border-blue-200/50 flex flex-col justify-between">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Transferência</CardTitle>
                                    <Send className="h-4 w-4 text-blue-500" />
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        Transfira o saldo disponível para sua conta bancária cadastrada.
                                    </p>
                                    <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                id="btn-transferir-pagarme"
                                                className="w-full bg-[#00a19c] hover:bg-[#00695c] text-white gap-2"
                                                disabled={(pagarmeBalance?.availableBalance || 0) <= 0}
                                            >
                                                <Send className="h-4 w-4" />
                                                Transferir
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Confirmar Transferência</DialogTitle>
                                                <DialogDescription>
                                                    Será solicitada a transferência de todo o saldo disponível ({formatCurrency(pagarmeBalance?.availableBalance || 0)}) para sua conta bancária cadastrada no Pagar.me.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setIsPayoutOpen(false)}>Cancelar</Button>
                                                <Button
                                                    className="bg-[#00a19c] hover:bg-[#00695c] text-white"
                                                    onClick={() => payoutMutation.mutate({})}
                                                    disabled={payoutMutation.isPending}
                                                >
                                                    {payoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                    Confirmar Transferência
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* Cenário Atual (Realizado) */}
                <h2 className="text-lg font-semibold mb-4 text-foreground/80 flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" /> Cenário Atual (Realizado)
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Recebido
                            </CardTitle>
                            <DollarSign className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {isLoadingSummary ? "..." : formatCurrency(summary?.manualIncome || 0)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Lançamentos manuais pagos
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Loja
                            </CardTitle>
                            <ShoppingBag className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {isLoadingSummary ? "..." : formatCurrency(summary?.storeIncome || 0)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Vendas avulsas pagas
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Despesas Pagas
                            </CardTitle>
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">
                                {isLoadingSummary ? "..." : formatCurrency(summary?.expense || 0)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Lançamentos já descontados
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Caixa
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${((summary?.manualBalance || 0) + (pagarmeBalance?.availableBalance || 0)) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                                {isLoadingSummary ? "..." : formatCurrency((summary?.manualBalance || 0) + (pagarmeBalance?.availableBalance || 0))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Saldo manual + Pagar.me disponível
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Cenário Futuro (Previsão) */}
                <h2 className="text-xl font-semibold mb-4 text-foreground/80">Visão Geral / Previsão</h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-8">
                    <Card className="border-yellow-200 dark:border-yellow-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                A Receber
                            </CardTitle>
                            <Clock className="h-4 w-4 text-yellow-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-yellow-600">
                                {isLoadingSummary ? "..." : formatCurrency((summary?.pendingRegistrations || 0) + (summary?.pendingStoreIncome || 0))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Entradas pendentes (Site + Loja + Manual)
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-red-200 dark:border-red-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                A Pagar
                            </CardTitle>
                            <Clock className="h-4 w-4 text-red-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-500">
                                {isLoadingSummary ? "..." : formatCurrency(summary?.pendingExpense || 0)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Lançamentos agendados/pendentes
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Previsão de Lucro
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${((summary?.manualBalance || 0) + (pagarmeBalance?.totalBalance || 0) + ((summary?.pendingRegistrations || 0) + (summary?.pendingStoreIncome || 0)) * 0.9 - (summary?.pendingExpense || 0)) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                                {isLoadingSummary ? "..." : formatCurrency((summary?.manualBalance || 0) + (pagarmeBalance?.totalBalance || 0) + ((summary?.pendingRegistrations || 0) + (summary?.pendingStoreIncome || 0)) * 0.9 - (summary?.pendingExpense || 0))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Saldo Real + Expectativa Líquida do Site
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Transaction History */}
                <Card>
                    <CardHeader>
                        <CardTitle>Histórico de Transações</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingTransactions ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : !transactions || transactions.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p>Nenhuma transação encontrada</p>
                                <p className="text-sm">Clique em "Novo Lançamento" para adicionar sua primeira movimentação.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Valor</TableHead>
                                            <TableHead className="w-[100px] text-center">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map((tx) => (
                                            <TableRow key={tx.id}>
                                                <TableCell>
                                                    {format(
                                                        new Date(new Date(tx.date).getTime() + new Date(tx.date).getTimezoneOffset() * 60000),
                                                        "dd/MM/yyyy",
                                                        { locale: ptBR }
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-medium">{tx.description}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tx.type === 'INCOME' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                        {tx.type === 'INCOME' ? 'Receita' : 'Despesa'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`text-xs ${tx.status === 'COMPLETED' ? 'text-muted-foreground' : 'text-yellow-600'}`}>
                                                        {tx.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className={`text-right font-bold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {tx.type === 'INCOME' ? '+' : '-'} {formatCurrency(tx.amount)}
                                                </TableCell>
                                                <TableCell className="text-center flex justify-center gap-1">
                                                    {tx.status === 'PENDING' && typeof tx.id === 'string' && !tx.id.startsWith('org-') && !tx.id.startsWith('store-') && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/20"
                                                            onClick={() => completeMutation.mutate({ id: tx.id as string })}
                                                            disabled={completeMutation.isPending}
                                                            title="Dar Baixa"
                                                        >
                                                            <Check className="h-4 w-4 mr-1" />
                                                            Baixa
                                                        </Button>
                                                    )}
                                                    {typeof tx.id === 'string' && !tx.id.startsWith('org-') && !tx.id.startsWith('store-') && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                                                            onClick={() => {
                                                                if (confirm("Deseja realmente excluir este lançamento?")) {
                                                                    deleteMutation.mutate({ id: tx.id as string });
                                                                }
                                                            }}
                                                            disabled={deleteMutation.isPending}
                                                            title="Excluir"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {typeof tx.id === 'string' && (tx.id.startsWith('org-') || tx.id.startsWith('store-')) && (
                                                        <span className="text-xs text-muted-foreground" title="Transações do sistema são gerenciadas automaticamente">-</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
