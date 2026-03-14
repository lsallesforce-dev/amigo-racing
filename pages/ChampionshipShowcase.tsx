import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Trophy, Loader2, ArrowLeft, MapPin, CalendarDays, Flag, FileDown, Settings, GitMerge, Check, XCircle, CheckCircle2 } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PerformanceChart } from "@/components/PerformanceChart";
import MetaSEO from "@/components/MetaSEO";

export default function ChampionshipShowcase() {
    const [, params] = useRoute("/championship/:id");
    const idParam = (params as any)?.id;
    const championshipId = idParam && !isNaN(parseInt(idParam, 10)) ? parseInt(idParam, 10) : 0;

    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [selectedRole, setSelectedRole] = useState<"pilot" | "navigator">("pilot");
    const chartRef = useRef<HTMLDivElement>(null);

    // Fetch public classification
    const { data: standingsData, isLoading: isStandingsLoading, error } = trpc.championships.getPublicClassification.useQuery(
        { championshipId },
        { 
            enabled: championshipId > 0,
            retry: false 
        }
    );

    // Fetch name and other info (we can get this from standingsData if we modify the backend, 
    // but for now let's assume standingsData has the basic championship info or we can use another public query if needed)
    // Actually, calculateChampionshipStandings already returns the stages and championship info? 
    // Let me check what it returns exactly.

    useEffect(() => {
        if (standingsData?.standings?.length && standingsData.standings.length > 0 && !selectedCategory) {
            setSelectedCategory(standingsData.standings[0].name);
        }
    }, [standingsData, selectedCategory]);

    const urlToBase64 = async (url: string): Promise<string> => {
        if (!url) return "";
        if (url.startsWith('data:')) return url;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Error converting image to base64", e);
            return "";
        }
    };

    const exportStandingsPDF = async () => {
        if (!standingsData || !standingsData.standings.length) return;

        const doc = new jsPDF("p", "mm", "a4");
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;

        // Pre-convert images to base64 to avoid CORS issues
        const champLogoBase64 = standingsData.championship?.imageUrl ? await urlToBase64(standingsData.championship.imageUrl) : "";
        const sponsorBannerBase64 = standingsData.championship?.sponsorBannerUrl ? await urlToBase64(standingsData.championship.sponsorBannerUrl) : "";


        // Sort stages by number
        const orderedStages = [...standingsData.stages].sort((a, b) => a.stageNumber - b.stageNumber);

        standingsData.standings.forEach((cat, catIdx) => {
            if (catIdx > 0) doc.addPage();

            // --- HEADER ---
            if (champLogoBase64) {
                try {
                    doc.addImage(champLogoBase64, "JPEG", margin, 10, 25, 0, undefined, 'FAST');
                } catch (e) { console.error("Logo error", e); }
            } else {
                doc.setDrawColor(200);
                doc.rect(margin, 10, 25, 25);
                doc.setFontSize(8);
                doc.text("COPA", margin + 12.5, 23, { align: 'center' });
            }

            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text(standingsData.championship?.name || "Campeonato", pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`Classificação Geral Oficial - ${cat.name}`, pageWidth / 2, 27, { align: 'center' });

            doc.setFontSize(8);
            doc.setTextColor(60, 60, 60);
            doc.text("www.amigoracing.com.br", pageWidth / 2, 33, { align: 'center' });

            try {
                doc.addImage("/logo-light.png", "PNG", pageWidth - margin - 32, 12, 32, 0);
            } catch (e) {
                doc.setFontSize(10);
                doc.text("AMIGO RACING", pageWidth - margin - 32, 20);
            }

            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.5);
            doc.line(margin, 38, pageWidth - margin, 38);

            // --- TABLE ---
            const roles: ("pilot" | "navigator")[] = ["pilot", "navigator"];
            let currentY = 45;

            roles.forEach(role => {
                const list = role === "pilot" ? cat.pilots : cat.navigators;
                if (list.length === 0) return;

                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(role === "pilot" ? "PILOTOS" : "NAVEGADORES", margin, currentY);
                currentY += 5;

                const abbreviate = (name: string) => {
                    if (name.length <= 12) return name;
                    return name.substring(0, 10) + "..";
                };

                const head = [
                    ["Pos", "Nome", ...orderedStages.map(s => `E${s.stageNumber}\n(${abbreviate(s.event?.name || s.customName || "")})`), "Total"]
                ];

                const body = list.map((comp, idx) => [
                    `${idx + 1}º`,
                    comp.name,
                    ...orderedStages.map(st => {
                        const res = comp.stageResults.find(sr => sr.stageId === st.id);
                        if (!res) return "0";
                        if (res.isDisqualified) return "NC";
                        return { content: res.points.toString(), isDiscarded: res.isDiscarded };
                    }),
                    comp.netPoints.toString()
                ]);

                autoTable(doc, {
                    startY: currentY,
                    head: head,
                    body: body,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
                    columnStyles: {
                        1: { halign: 'left', cellWidth: 'auto' },
                    },
                    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 7 },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                    didParseCell: (data) => {
                        if (data.section === 'body' && typeof data.cell.raw === 'object' && (data.cell.raw as any).isDiscarded) {
                            data.cell.styles.textColor = [255, 0, 0];
                            data.cell.styles.fontStyle = 'bolditalic';
                        }
                    },
                    didDrawPage: (data) => {
                        const str = "Página " + doc.internal.pages.length;
                        doc.setFontSize(8);
                        doc.setTextColor(100);
                        doc.text(str, pageWidth - margin - 15, pageHeight - 5);

                        doc.setFontSize(7);
                        doc.setTextColor(255, 0, 0);
                        doc.text("* Valores em vermelho/itálico representam resultados descartados pelo regulamento.", margin, pageHeight - 5);

                        if (sponsorBannerBase64) {
                            try {
                                doc.addImage(sponsorBannerBase64, "JPEG", margin, pageHeight - 32, pageWidth - (margin * 2), 0);
                            } catch (e) { }
                        }
                    }
                });

                currentY = (doc as any).lastAutoTable.finalY + 10;

            });
        });

        doc.save(`Classificacao_${standingsData.championship?.name || "Copa"}.pdf`);
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

    const { championship, standings, stages } = standingsData;

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

                    <Button
                        onClick={exportStandingsPDF}
                        className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105"
                    >
                        <FileDown className="h-5 w-5 mr-2" />
                        Baixar PDF Oficial
                    </Button>
                </div>

                {/* Standings Table Card */}
                <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <CardTitle className="text-2xl font-bold flex items-center gap-3">
                                    <Trophy className="h-6 w-6 text-primary" /> Classificação Geral
                                </CardTitle>
                                <CardDescription className="font-medium">
                                    Acesse o ranking e desempenho detalhado de cada competidor.
                                </CardDescription>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="space-y-1.5 flex-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Categoria</Label>
                                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                        <SelectTrigger className="w-full sm:w-[200px] bg-background border-primary/10 h-10 font-semibold focus:ring-primary/20 transition-all">
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {standings.map(cat => (
                                                <SelectItem key={cat.name} value={cat.name} className="font-medium">{cat.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5 flex-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Modalidade</Label>
                                    <div className="bg-background/80 p-1 rounded-xl border border-primary/10 flex items-center h-10 shadow-sm">
                                        <Button
                                            variant={selectedRole === "pilot" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setSelectedRole("pilot")}
                                            className={`flex-1 h-8 rounded-lg font-bold text-xs transition-all ${selectedRole === "pilot" ? 'shadow-md' : 'text-muted-foreground'}`}
                                        >
                                            Pilotos
                                        </Button>
                                        <Button
                                            variant={selectedRole === "navigator" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setSelectedRole("navigator")}
                                            className={`flex-1 h-8 rounded-lg font-bold text-xs transition-all ${selectedRole === "navigator" ? 'shadow-md' : 'text-muted-foreground'}`}
                                        >
                                            Navegadores
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {(() => {
                            if (!standings || standings.length === 0) {
                                return (
                                    <div className="p-20 text-center bg-muted/5">
                                        <Trophy className="h-16 w-16 text-muted-foreground/10 mx-auto mb-4" />
                                        <h3 className="text-xl font-bold text-muted-foreground mb-1">Resultados em breve</h3>
                                        <p className="text-sm text-muted-foreground">Este campeonato ainda não possui resultados cadastrados.</p>
                                    </div>
                                );
                            }

                            const categoryData = standings.find(s => s.name === selectedCategory);
                            if (!categoryData) {
                                return (
                                    <div className="p-20 text-center">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary/20 mx-auto mb-4" />
                                        <p className="text-muted-foreground font-medium">Selecione uma categoria para visualizar...</p>
                                    </div>
                                );
                            }

                            const competitorsList = selectedRole === "pilot" ? categoryData.pilots : categoryData.navigators;
                            const orderedStages = [...stages].sort((a, b) => a.stageNumber - b.stageNumber);

                            if (competitorsList.length === 0) {
                                return (
                                    <div className="p-20 text-center bg-muted/5">
                                        <Trophy className="h-16 w-16 text-muted-foreground/10 mx-auto mb-4" />
                                        <h3 className="text-xl font-bold text-muted-foreground mb-1">Pódio Vazio</h3>
                                        <p className="text-sm text-muted-foreground">Nenhum {selectedRole === "pilot" ? "piloto" : "navegador"} pontuou nesta categoria ainda.</p>
                                    </div>
                                );
                            }

                            return (
                                <div className="w-full overflow-x-auto pb-4">
                                    <Table className="min-w-[800px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="w-[80px] text-center font-black text-xs uppercase tracking-wider py-5">Pos</TableHead>
                                                <TableHead className="font-black text-xs uppercase tracking-wider">Competidor</TableHead>
                                                {orderedStages.map(st => {
                                                    const eventName = st.event?.name || st.customName || "";
                                                    return (
                                                        <TableHead key={st.id} className="text-center w-[110px] text-[10px] leading-tight px-1 font-bold uppercase tracking-wider">
                                                            E{st.stageNumber}
                                                            {eventName && (
                                                                <div className="text-[9px] font-normal text-muted-foreground truncate max-w-[100px] mt-1" title={eventName}>
                                                                    {eventName}
                                                                </div>
                                                            )}
                                                        </TableHead>
                                                    );
                                                })}
                                                <TableHead className="w-[120px] text-center font-black text-xs uppercase tracking-wider text-primary">Pontos Líquidos</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {competitorsList.map((comp, idx) => (
                                                <TableRow key={comp.name} className={`group transition-colors hover:bg-primary/5 ${idx < 3 ? 'bg-primary/[0.02]' : ''}`}>
                                                    <TableCell className="text-center py-5">
                                                        <div className="flex items-center justify-center">
                                                            {idx === 0 && <div className="bg-yellow-400 text-yellow-900 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-yellow-400/20">1º</div>}
                                                            {idx === 1 && <div className="bg-slate-300 text-slate-800 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-slate-300/20">2º</div>}
                                                            {idx === 2 && <div className="bg-amber-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-amber-600/20">3º</div>}
                                                            {idx > 2 && <span className="font-bold text-muted-foreground">{idx + 1}º</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-bold whitespace-nowrap text-base group-hover:text-primary transition-colors">
                                                        {comp.name}
                                                    </TableCell>
                                                    {orderedStages.map(st => {
                                                        const res = comp.stageResults.find(sr => sr.stageId === st.id);
                                                        return (
                                                            <TableCell key={st.id} className="text-center p-2">
                                                                {!res ? (
                                                                    <span className="text-muted-foreground/20 font-light">-</span>
                                                                ) : res.isDisqualified ? (
                                                                    <Badge variant="destructive" className="text-[9px] uppercase font-black px-1.5 py-0 shadow-sm border-none">NC/DSQ</Badge>
                                                                ) : res.isDiscarded ? (
                                                                    <div className="relative inline-block px-2">
                                                                        <span className="text-sm line-through text-red-500/50 font-medium">
                                                                            {res.points}
                                                                        </span>
                                                                        <span className="text-[8px] absolute -top-1 -right-1.5 text-red-500 font-black">DESC</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-sm font-bold text-foreground bg-muted/30 px-2 py-1 rounded-md min-w-[30px] inline-block">
                                                                        {res.points}
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                        );
                                                    })}
                                                    <TableCell className="text-center py-5">
                                                        <div className="inline-block bg-primary text-white font-black text-lg px-4 py-1.5 rounded-xl shadow-md min-w-[60px]">
                                                            {comp.netPoints}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>

                {/* Performance Flow Chart */}
                {standings.length > 0 && selectedCategory && (
                    <Card className="mt-8 border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
                            <CardTitle className="text-xl font-bold flex items-center gap-3">
                                <ArrowLeft className="h-5 w-5 rotate-180 text-primary" />
                                Evolução de Performance - {selectedCategory}
                            </CardTitle>
                            <CardDescription className="font-medium">
                                Visualização da constância de pontos ao longo das etapas para o Top 8.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] w-full pt-8">
                                <PerformanceChart
                                    data={standingsData}
                                    selectedCategory={selectedCategory}
                                    selectedRole={selectedRole}
                                    chartRef={chartRef}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Legend */}
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-4 text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-red-500"></div>
                            Resultados Descartados
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-destructive/10 rounded-sm"></div>
                            Não Completou / Desclassificado
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
