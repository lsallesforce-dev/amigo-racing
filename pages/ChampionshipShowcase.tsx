import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Trophy, Loader2, ArrowLeft, Flag, FileDown, FileSpreadsheet, Settings, TrendingUp } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import StandingsTable from "@/components/championship/StandingsTable";
import { gerarPdfClassificacao } from "@/lib/championshipPdf";
import { PerformanceChart } from "@/components/PerformanceChart";
import MetaSEO from "@/components/MetaSEO";
import type { CategoriaClassificacao, CompetidorClassificado } from "@/shared/classificacaoCampeonato";

// Decodifica o base64 devolvido pela exportação num Blob baixável.
// Não é o mesmo problema do urlToBase64 que existia aqui antes (aquele ia de
// imagem -> base64 pro PDF); aqui é o caminho inverso, base64 -> arquivo.
function base64ParaBlob(base64: string, mimeType: string): Blob {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
}

/**
 * Etapas com nome já resolvido (StandingsTable e o PDF esperam essa forma pronta,
 * não o dado cru com `event`/`customName` separados). A ordem de prioridade
 * espelha `nomeDaEtapa()` do backend (api/_server/backend_routers/championship.ts):
 * nome customizado da prova externa primeiro, depois o nome do evento cadastrado.
 */
function montarEtapasComNome(stages: { id: number; stageNumber: number; customName?: string | null; event?: { name: string | null } | null }[]) {
    return [...stages]
        .sort((a, b) => a.stageNumber - b.stageNumber)
        .map(st => ({
            id: st.id,
            stageNumber: st.stageNumber,
            nome: st.customName || st.event?.name || `Etapa ${st.stageNumber}`,
        }));
}

/** Cartão de pódio (top 3 da categoria/papel selecionado). Puramente visual — quem decide quem entra é o pai. */
function PodiumCard({ posicao, competidor }: { posicao: 1 | 2 | 3; competidor: CompetidorClassificado | undefined }) {
    if (!competidor) return <div />;

    const estilos: Record<1 | 2 | 3, { badge: string; altura: string; medalha: string }> = {
        1: { badge: "bg-yellow-400 text-yellow-900 shadow-yellow-400/30", altura: "pt-6 pb-8", medalha: "1º" },
        2: { badge: "bg-slate-300 text-slate-800 shadow-slate-300/30", altura: "pt-10 pb-6", medalha: "2º" },
        3: { badge: "bg-amber-600 text-white shadow-amber-600/30", altura: "pt-10 pb-6", medalha: "3º" },
    };
    const estilo = estilos[posicao];

    return (
        // A ordem visual 2º-1º-3º já vem da ordem em que o pai chama este componente
        // no grid (não precisa de utilitário `order-*` dinâmico — Tailwind não gera
        // classe a partir de string interpolada, só literais presentes no source).
        <div className={`flex flex-col items-center justify-end rounded-2xl border bg-card/50 backdrop-blur-sm shadow-lg ${estilo.altura} px-3`}>
            {posicao === 1 && <Trophy className="h-8 w-8 text-yellow-400 mb-2" />}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shadow-lg mb-3 ${estilo.badge}`}>
                {estilo.medalha}
            </div>
            <p className="font-bold text-center text-sm sm:text-base leading-tight line-clamp-2">{competidor.name}</p>
            <p className="text-primary font-black text-xl mt-1">{competidor.netPoints}<span className="text-[10px] text-muted-foreground font-medium ml-1">pts</span></p>
        </div>
    );
}

export default function ChampionshipShowcase() {
    const [, params] = useRoute("/championship/:id");
    const idParam = (params as any)?.id;
    const championshipId = idParam && !isNaN(parseInt(idParam, 10)) ? parseInt(idParam, 10) : 0;

    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [selectedRole, setSelectedRole] = useState<"pilot" | "navigator">("pilot");
    const [competidorEmFoco, setCompetidorEmFoco] = useState<string | undefined>(undefined);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    // Fetch public classification
    const { data: standingsData, isLoading: isStandingsLoading, error } = trpc.championships.getPublicClassification.useQuery(
        { championshipId },
        {
            enabled: championshipId > 0,
            retry: false
        }
    );

    // Rota PÚBLICA de propósito: o exportWorkbook do painel carrega e-mail e CPF
    // vindos da inscrição (para o round-trip de importação), e esta página não tem
    // login. Aqui sai só a aba de classificação — o mesmo dado que já está na tela.
    const exportClassificacaoMutation = trpc.championships.exportClassificacaoPublica.useMutation();

    useEffect(() => {
        if (standingsData?.standings?.length && standingsData.standings.length > 0 && !selectedCategory) {
            setSelectedCategory(standingsData.standings[0].name);
        }
    }, [standingsData, selectedCategory]);

    // Troca de categoria/papel invalida o destaque — ele só faz sentido pro competidor
    // que estava visível na tabela no momento do clique.
    useEffect(() => {
        setCompetidorEmFoco(undefined);
    }, [selectedCategory, selectedRole]);

    const handleDownloadPdf = async () => {
        if (!standingsData?.championship) return;
        setIsGeneratingPdf(true);
        try {
            await gerarPdfClassificacao({
                championship: {
                    name: standingsData.championship.name,
                    year: standingsData.championship.year,
                    discardRule: standingsData.championship.discardRule,
                    imageUrl: standingsData.championship.imageUrl,
                    sponsorBannerUrl: standingsData.championship.sponsorBannerUrl,
                },
                // Ver comentário mais abaixo sobre o cast de Serialize<T> do tRPC v11.
                categorias: standingsData.standings as unknown as CategoriaClassificacao[],
                etapas: montarEtapasComNome(standingsData.stages),
            });
        } catch (e) {
            console.error("Erro ao gerar PDF", e);
            toast.error("Não foi possível gerar o PDF. Tente novamente.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleDownloadWorkbook = async () => {
        if (!standingsData?.championship) return;
        try {
            const result = await exportClassificacaoMutation.mutateAsync({ championshipId });
            const blob = base64ParaBlob(result.data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = result.filename || `Classificacao_${standingsData.championship.name}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            console.error("Erro ao gerar planilha", e);
            toast.error("Não foi possível gerar a planilha. Tente novamente.");
        }
    };

    if (isStandingsLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !standingsData || !standingsData.championship) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Trophy className="h-16 w-16 text-muted-foreground/20 mb-4" />
                <h2 className="text-xl font-bold mb-2">Classificação não encontrada</h2>
                <p className="text-muted-foreground text-center max-w-sm mb-6">
                    {error?.message === "Campeonato não encontrado"
                        ? "Este campeonato não existe ou foi removido."
                        : "Não conseguimos carregar os dados deste campeonato. Verifique o link ou tente novamente mais tarde."}
                </p>
                <Link href="/">
                    <Button variant="outline" className="h-12 px-8 rounded-xl">Ir para a Home</Button>
                </Link>
            </div>
        );
    }

    const { championship, stages } = standingsData;
    const etapasComNome = montarEtapasComNome(stages);

    // O tRPC v11 infere a saída de query via `Serialize<T>`, que deixa os campos
    // opcionais nesse formato (mapped type recursivo genérico) — mas o runtime
    // sempre entrega o shape completo de CategoriaClassificacao, porque é
    // exatamente isso que calcularClassificacao() devolve no backend. Cast único
    // aqui evita espalhar `as` pelo resto do arquivo.
    const standings = standingsData.standings as unknown as CategoriaClassificacao[];

    const categoryData = standings.find(s => s.name === selectedCategory);
    const competitorsList: CompetidorClassificado[] = categoryData
        ? (selectedRole === "pilot" ? categoryData.pilots : categoryData.navigators)
        : [];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <MetaSEO
                title={championship.name}
                description={`Classificação Geral do ${championship.name} - Temporada ${championship.year}. Acompanhe os resultados oficiais na Amigo Racing.`}
                ogImage={championship.imageUrl || undefined}
            />
            {/* Public Header */}
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <img src="/logo-light.png" alt="Amigo Racing" className="h-8 w-auto block dark:hidden" />
                            <img src="/logo-dark.png" alt="Amigo Racing" className="h-8 w-auto hidden dark:block" />
                        </Link>
                    </div>
                    <div className="hidden sm:block">
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Vitrine do Campeonato</span>
                    </div>
                    <Link href="/">
                        <Button variant="ghost" size="sm" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="flex-1 container py-8 max-w-6xl">
                {/* Hero Section */}
                <div className="mb-10 flex flex-col md:flex-row items-center md:items-end gap-6 border-b pb-8">
                    {championship.imageUrl ? (
                        <div className="w-32 h-32 rounded-2xl bg-white p-4 shadow-xl border-4 border-primary/10 flex items-center justify-center overflow-hidden">
                            <img src={championship.imageUrl} alt={championship.name} className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-32 h-32 rounded-2xl bg-primary/10 flex items-center justify-center border-4 border-primary/5 shadow-inner">
                            <Trophy className="h-16 w-16 text-primary" />
                        </div>
                    )}

                    <div className="flex-1 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 border border-primary/10">
                            Temporada {championship.year}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground leading-none mb-4">
                            {championship.name}
                        </h1>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-muted-foreground font-medium">
                            <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-primary" />
                                {stages.length} Etapas Confirmadas
                            </div>
                            <div className="flex items-center gap-2">
                                <Settings className="h-4 w-4 text-primary" />
                                Regra de Descarte: {championship.discardRule > 0 ? `N-${championship.discardRule}` : 'Sem descarte'}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <Button
                            onClick={handleDownloadPdf}
                            disabled={isGeneratingPdf}
                            className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105"
                        >
                            {isGeneratingPdf ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileDown className="h-5 w-5 mr-2" />}
                            Baixar PDF Oficial
                        </Button>
                        <Button
                            onClick={handleDownloadWorkbook}
                            disabled={exportClassificacaoMutation.isPending}
                            variant="outline"
                            className="font-bold h-12 px-6 rounded-xl border-primary/20 transition-all hover:scale-105"
                        >
                            {exportClassificacaoMutation.isPending ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 mr-2" />}
                            Baixar Planilha
                        </Button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                    <div className="space-y-1.5 flex-1">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Categoria</Label>
                        {/* Sem opção "Todas" de propósito — na vitrine pública o competidor sempre
                            escolhe uma categoria concreta (diferente do painel admin). */}
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger className="w-full sm:w-[220px] bg-background border-primary/10 h-10 font-semibold focus:ring-primary/20 transition-all">
                                <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                                {standings.map((cat) => (
                                    <SelectItem key={cat.name} value={cat.name} className="font-medium">{cat.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Modalidade</Label>
                        <ToggleGroup
                            type="single"
                            value={selectedRole}
                            onValueChange={(v) => v && setSelectedRole(v as "pilot" | "navigator")}
                            className="bg-background/80 p-1 rounded-xl border border-primary/10 h-10 shadow-sm justify-start"
                        >
                            <ToggleGroupItem value="pilot" className="flex-1 h-8 rounded-lg font-bold text-xs data-[state=on]:bg-primary data-[state=on]:text-white">
                                Pilotos
                            </ToggleGroupItem>
                            <ToggleGroupItem value="navigator" className="flex-1 h-8 rounded-lg font-bold text-xs data-[state=on]:bg-primary data-[state=on]:text-white">
                                Navegadores
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>

                {/* Pódio */}
                {competitorsList.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-8 max-w-2xl mx-auto">
                        <PodiumCard posicao={2} competidor={competitorsList[1]} />
                        <PodiumCard posicao={1} competidor={competitorsList[0]} />
                        <PodiumCard posicao={3} competidor={competitorsList[2]} />
                    </div>
                )}

                {/* Standings Table Card */}
                <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
                        <CardTitle className="text-2xl font-bold flex items-center gap-3">
                            <Trophy className="h-6 w-6 text-primary" /> Classificação Geral
                        </CardTitle>
                        <CardDescription className="font-medium">
                            Acesse o ranking e desempenho detalhado de cada competidor.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <StandingsTable
                            categoria={categoryData}
                            etapas={etapasComNome}
                            papel={selectedRole}
                            variante="vitrine"
                            onSelecionarCompetidor={setCompetidorEmFoco}
                        />
                    </CardContent>
                </Card>

                {/* Performance Flow Chart */}
                {standings.length > 0 && selectedCategory && (
                    <Card className="mt-8 border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
                            <CardTitle className="text-xl font-bold flex items-center gap-3">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                Evolução de Performance - {selectedCategory}
                            </CardTitle>
                            <CardDescription className="font-medium">
                                {competidorEmFoco
                                    ? `Destacando ${competidorEmFoco} — clique novamente na tabela pra voltar à visão geral do Top 8.`
                                    : "Visualização da constância de pontos ao longo das etapas para o Top 8. Clique num competidor na tabela pra destacá-lo aqui."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] w-full pt-8">
                                <PerformanceChart
                                    data={standingsData}
                                    selectedCategory={selectedCategory}
                                    selectedRole={selectedRole}
                                    chartRef={chartRef}
                                    highlightedName={competidorEmFoco}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Legend */}
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 px-2">
                    <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-red-500"></div>
                            Resultado Descartado
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-destructive/10 rounded-sm"></div>
                            Desclassificado (DSQ)
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 border border-dashed border-muted-foreground/50 rounded-sm"></div>
                            Não Largou (DNS)
                        </div>
                    </div>
                </div>
            </main>

            {/* Public Footer with Sponsors */}
            <footer className="mt-12 bg-muted/30 border-t py-12">
                <div className="container">
                    {championship.sponsorBannerUrl && (
                        <div className="mb-12">
                            <h3 className="text-center text-[10px] uppercase font-black tracking-[0.3em] text-muted-foreground mb-6">Patrocinadores Oficiais</h3>
                            <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-primary/5 bg-white">
                                <img src={championship.sponsorBannerUrl} alt="Sponsors" className="w-full h-auto" />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col items-center justify-center gap-6">
                        <img src="/logo-light.png" alt="Amigo Racing" className="h-10 w-auto opacity-50 grayscale hover:grayscale-0 transition-all cursor-pointer" />
                        <p className="text-xs text-muted-foreground font-medium text-center">
                            © {new Date().getFullYear()} Amigo Racing – Cronometragem e Gestão de Eventos Off-Road.
                            <br />
                            Todos os direitos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
