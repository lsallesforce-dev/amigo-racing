// Painel do campeonato — CASCA.
//
// Este arquivo tinha 1846 linhas: 24 useState, 4 useRef, zero useMemo, três abas
// inteiras, cinco modais e um sub-componente escondido no fim do arquivo. Cada
// digitada num input de configuração re-renderizava a tabela de classificação
// inteira, com 15 colunas de etapa.
//
// Agora ele só faz o que uma página deve fazer: resolver o usuário, buscar os
// dados, escolher a aba e distribuir. Cada bloco virou um componente em
// components/championship/, e o PDF virou lib/championshipPdf.ts (que a vitrine
// pública também usa, em vez da cópia que existia lá).

import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { gerarPdfClassificacao } from "@/lib/championshipPdf";
import { Trophy, Loader2, FileDown, FileSpreadsheet, Settings } from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import StandingsTab from "@/components/championship/StandingsTab";
import StagesTab from "@/components/championship/StagesTab";
import RequestsTab from "@/components/championship/RequestsTab";
import ImportWizard from "@/components/championship/ImportWizard";
import ChampionshipSettingsDialog from "@/components/championship/ChampionshipSettingsDialog";
import type { CategoriaClassificacao } from "@/shared/classificacaoCampeonato";

export default function ChampionshipDetails() {
    const { user, isAuthenticated, loading } = useAuth();
    const [, params] = useRoute("/organizer/championships/:id");
    const [, setLocation] = useLocation();
    const championshipId = parseInt((params as any)?.id || "0", 10);

    const [configAberto, setConfigAberto] = useState(false);
    const [wizardAberto, setWizardAberto] = useState(false);
    const [gerandoPdf, setGerandoPdf] = useState(false);

    const isOrganizerOrAdmin = isAuthenticated && (user?.role === "organizer" || user?.role === "admin");

    const { data: championships, isLoading: carregandoCampeonatos } = trpc.championships.getAllByOrganizer.useQuery(
        { organizerId: user?.id as number },
        { enabled: isOrganizerOrAdmin && !!user?.id && championshipId > 0 },
    );

    const championship = championships?.find(c => c.id === championshipId);
    const isOwner = championship?.organizerId === user?.id;
    // Organizador local só mexe na etapa que é evento DELE, mesmo sem ser dono da copa.
    const isStageOwner = (stage: any) => stage.event?.organizerId === user?.id;

    const { data: stages, isLoading: carregandoEtapas } = trpc.championships.getStages.useQuery(
        { championshipId },
        { enabled: isOrganizerOrAdmin && championshipId > 0 },
    );

    const { data: standingsData, isLoading: carregandoClassificacao } = trpc.championships.getStandings.useQuery(
        { championshipId },
        { enabled: isOrganizerOrAdmin && championshipId > 0 },
    );

    const { data: solicitacoes, isLoading: carregandoSolicitacoes } = trpc.championships.getPendingStageRequests.useQuery(
        { organizerId: user?.id as number },
        { enabled: isOrganizerOrAdmin && !!user?.id },
    );

    // O filtro por campeonato aparecia três vezes no JSX antigo (contador da aba,
    // estado vazio e lista) — recalculado a cada render, três vezes.
    const pedidos = useMemo(
        () => (solicitacoes || []).filter(r => r.championshipName === championship?.name),
        [solicitacoes, championship?.name],
    );

    const exportWorkbookMutation = trpc.championships.exportWorkbook.useMutation();

    const temClassificacao = !!standingsData && standingsData.standings.length > 0;

    const exportarPdf = async () => {
        if (!standingsData || !championship) return;
        setGerandoPdf(true);
        try {
            await gerarPdfClassificacao({
                championship: {
                    name: championship.name,
                    year: championship.year,
                    discardRule: championship.discardRule,
                    imageUrl: (championship as any).imageUrl,
                    sponsorBannerUrl: (championship as any).sponsorBannerUrl,
                },
                // O tipo inferido do tRPC (via superjson) chega com os campos
                // opcionais; o dado em si é `CategoriaClassificacao[]` — o
                // cálculo é do shared/. Cast só nesta fronteira.
                categorias: standingsData.standings as unknown as CategoriaClassificacao[],
                // `provaNumber`/`eventoNome` alimentam o agrupamento por evento no
                // cabeçalho do PDF — mesma correção da tabela em tela.
                etapas: standingsData.stages.map((st: any) => ({
                    id: st.id,
                    stageNumber: st.stageNumber,
                    nome: `P${st.provaNumber ?? st.stageNumber}`,
                    provaNumber: st.provaNumber ?? st.stageNumber,
                    eventoNome: st.eventoNome ?? st.event?.name ?? st.customName ?? null,
                })),
            });
        } catch (erro: any) {
            console.error("Erro ao gerar o PDF da classificação:", erro);
            toast.error("Não consegui gerar o PDF da classificação.");
        } finally {
            setGerandoPdf(false);
        }
    };

    const baixarPlanilha = async () => {
        try {
            const resultado = await exportWorkbookMutation.mutateAsync({ championshipId });
            // base64 -> bytes -> Blob. Mesmo caminho dos outros exports do projeto.
            const binario = atob(resultado.data);
            const bytes = new Uint8Array(binario.length);
            for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
            const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", resultado.filename || `campeonato-${championshipId}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (erro: any) {
            toast.error(erro?.message || "Erro ao gerar a planilha do campeonato.");
        }
    };

    if (loading || carregandoCampeonatos) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isOrganizerOrAdmin || !championship) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-lg text-muted-foreground mb-4">Campeonato não encontrado ou acesso restrito.</p>
                        <Link href="/organizer/championships">
                            <Button>Voltar aos Campeonatos</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            <div className="container py-8 max-w-6xl">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <Link href="/organizer/championships" className="hover:text-foreground transition-colors">
                                Campeonatos
                            </Link>
                            <span>/</span>
                            <span className="text-foreground font-medium">{championship.name}</span>
                        </div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Trophy className="h-8 w-8 text-primary" />
                            {championship.name}
                        </h1>
                        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                                Ano: {championship.year}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">Descarte:</span>{" "}
                                {championship.discardRule > 0 ? `N-${championship.discardRule}` : "Sem descarte"}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {isOwner && (
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigAberto(true)}>
                                <Settings className="h-4 w-4" />
                                Configurações
                            </Button>
                        )}
                        {temClassificacao && (
                            <>
                                <Button variant="outline" size="sm" className="gap-2" onClick={exportarPdf} disabled={gerandoPdf}>
                                    {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                    Exportar PDF
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={baixarPlanilha}
                                    disabled={exportWorkbookMutation.isPending}
                                >
                                    {exportWorkbookMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <FileSpreadsheet className="h-4 w-4" />
                                    )}
                                    Baixar planilha
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <Tabs defaultValue="standings" className="w-full space-y-6">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-full overflow-x-auto pb-1 scrollbar-hide flex justify-center">
                            <TabsList className="bg-muted/50 p-1 w-full max-w-[600px] flex min-w-max">
                                <TabsTrigger value="standings" className="flex-1">
                                    Geral do Campeonato
                                </TabsTrigger>
                                <TabsTrigger value="stages" className="flex-1">
                                    Etapas e Resultados
                                </TabsTrigger>
                                {isOwner && (
                                    <TabsTrigger value="requests" className="flex-1 relative">
                                        Solicitações
                                        {pedidos.length > 0 && (
                                            <span className="ml-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                                                {pedidos.length}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                )}
                            </TabsList>
                        </div>
                    </div>

                    <TabsContent value="standings">
                        <StandingsTab
                            championshipId={championshipId}
                            standingsData={standingsData as any}
                            isLoading={carregandoClassificacao}
                            isOwner={!!isOwner}
                        />
                    </TabsContent>

                    <TabsContent value="stages">
                        <StagesTab
                            championshipId={championshipId}
                            stages={stages}
                            isLoading={carregandoEtapas}
                            isOwner={!!isOwner}
                            isStageOwner={isStageOwner}
                            onImportar={() => setWizardAberto(true)}
                        />
                    </TabsContent>

                    {isOwner && (
                        <TabsContent value="requests">
                            <RequestsTab
                                championshipId={championshipId}
                                pedidos={pedidos as any}
                                isLoading={carregandoSolicitacoes}
                            />
                        </TabsContent>
                    )}
                </Tabs>
            </div>

            <ImportWizard championshipId={championshipId} open={wizardAberto} onOpenChange={setWizardAberto} />

            {isOwner && (
                <ChampionshipSettingsDialog
                    championshipId={championshipId}
                    championship={championship}
                    open={configAberto}
                    onOpenChange={setConfigAberto}
                    onExcluido={() => setLocation("/organizer/championships")}
                />
            )}
        </div>
    );
}
