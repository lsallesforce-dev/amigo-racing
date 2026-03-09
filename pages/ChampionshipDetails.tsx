import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getLoginUrl } from "@/api/server/const";
import { trpc } from "@/lib/trpc";
import { Trophy, Plus, Loader2, ArrowLeft, MapPin, CalendarDays, Flag, Upload, List, CheckCircle2, XCircle, MoreVertical, Trash2, Eraser, Settings, Save, AlertTriangle, GitMerge, Check, X, FileDown, HelpCircle } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { Link, useRoute, useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Navbar from "@/components/Navbar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { calculateCbaPoints } from "@/api/server/utils/cbaRules.js";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";



type ParsedResult = {
    position: number;
    pilotName: string | null;
    navigatorName: string | null;
    isDisqualified: boolean;
    points: number;
    category?: string;
};

export default function ChampionshipDetails() {
    const { user, isAuthenticated, loading } = useAuth();
    const [, params] = useRoute("/organizer/championships/:id");
    const [, setLocation] = useLocation();
    const championshipId = parseInt((params as any)?.id || '0', 10);

    const [form, setForm] = useState({
        eventId: "",
        customName: "",
        stageType: "internal", // internal | external
        stageNumber: "",
    });
    const [dialogOpen, setDialogOpen] = useState(false);

    // CSV Results State
    const [resultsModalOpen, setResultsModalOpen] = useState(false);
    const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
    const [csvFilename, setCsvFilename] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Phase 11: Reverse Gear State
    const [confirmAction, setConfirmAction] = useState<{
        type: 'clear' | 'delete';
        stageId: number;
        stageNumber: number;
    } | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [selectedPosColumn, setSelectedPosColumn] = useState<string>("");
    const [rawCsvData, setRawCsvData] = useState<Record<string, string>[]>([]);
    const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);

    // Phase 14: Category Management
    const [viewResultsModalOpen, setViewResultsModalOpen] = useState(false);
    const [activeViewStageId, setActiveViewStageId] = useState<number | null>(null);
    const [confirmCategoryDelete, setConfirmCategoryDelete] = useState<{
        stageId: number;
        category: string;
        stageNumber: number;
    } | null>(null);
    const [isCategoryDeleteConfirmOpen, setIsCategoryDeleteConfirmOpen] = useState(false);

    // Phase 12: Championship Management State
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    interface EditFormState {
        name: string;
        discardRule: string;
        allowDiscardMissedStages: boolean;
        sponsorBannerUrl: string;
        imageUrl: string;
    }
    const [editForm, setEditForm] = useState<EditFormState>({
        name: "",
        discardRule: "0",
        allowDiscardMissedStages: true,
        sponsorBannerUrl: "",
        imageUrl: ""
    });
    const [isDeleteChampionshipConfirmOpen, setIsDeleteChampionshipConfirmOpen] = useState(false);

    // Phase 15: Competitor Unifier State
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [mergeTarget, setMergeTarget] = useState("");
    const [mergeSources, setMergeSources] = useState<string[]>([]);
    const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);

    const chartRef = useRef<HTMLDivElement>(null);


    const utils = trpc.useUtils();

    const isOrganizerOrAdmin = isAuthenticated && (user?.role === 'organizer' || user?.role === 'admin');

    // Fetch all championships to find the current one (or we could create a getById in tRPC)
    const { data: championships, isLoading: isChampionshipsLoading } = trpc.championships.getAllByOrganizer.useQuery(
        { organizerId: user?.id as number },
        { enabled: isOrganizerOrAdmin && !!user?.id && championshipId > 0 }
    );

    const championship = championships?.find(c => c.id === championshipId);

    // Sync edit form with championship data
    useEffect(() => {
        if (championship) {
            setEditForm({
                name: championship.name,
                discardRule: championship.discardRule.toString(),
                allowDiscardMissedStages: (championship as any).allowDiscardMissedStages ?? true,
                sponsorBannerUrl: (championship as any).sponsorBannerUrl || "",
                imageUrl: (championship as any).imageUrl || ""
            });
        }
    }, [championship]);

    // Fetch stages of this championship
    const { data: stages, isLoading: isStagesLoading } = trpc.championships.getStages.useQuery(
        { championshipId },
        { enabled: isOrganizerOrAdmin && championshipId > 0 }
    );

    // Fetch final standings
    const { data: standingsData, isLoading: isStandingsLoading } = trpc.championships.getStandings.useQuery(
        { championshipId },
        { enabled: isOrganizerOrAdmin && championshipId > 0 }
    );

    // Fetch Pending Stage Requests for Master Organizer
    const { data: pendingRequests, isLoading: isRequestsLoading } = trpc.championships.getPendingStageRequests.useQuery(
        { organizerId: user?.id as number },
        { enabled: isOrganizerOrAdmin && !!user?.id }
    );

    const respondRequestMutation = trpc.championships.respondToStageRequest.useMutation({
        onSuccess: () => {
            toast.success("Solicitação respondida com sucesso!");
            utils.championships.getPendingStageRequests.invalidate();
            utils.championships.getStages.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao responder solicitação");
        }
    });

    const handleRespondRequest = (requestId: string, status: "APPROVED" | "REJECTED") => {
        respondRequestMutation.mutate({ requestId, status });
    };

    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [selectedRole, setSelectedRole] = useState<"pilot" | "navigator">("pilot");
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingBanner, setIsUploadingBanner] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    // Auto-select first category when data loads if none selected
    useEffect(() => {
        if (standingsData?.standings?.length && standingsData.standings.length > 0 && !selectedCategory) {
            setSelectedCategory(standingsData.standings[0].name);
        }
    }, [standingsData, selectedCategory]);

    // Fetch organizer events for the Dropdown
    const { data: myEvents, isLoading: isEventsLoading } = trpc.events.myEvents.useQuery(undefined, {
        enabled: isOrganizerOrAdmin
    });

    const addStageMutation = trpc.championships.addStage.useMutation({
        onSuccess: () => {
            toast.success("Etapa adicionada com sucesso!");
            setDialogOpen(false);
            setForm({ eventId: "", customName: "", stageType: "internal", stageNumber: "" });
            utils.championships.getStages.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao adicionar etapa");
        }
    });

    const clearStageResultsByCategoryMutation = trpc.championships.clearStageResultsByCategory.useMutation({
        onSuccess: () => {
            toast.success("Resultados da categoria excluídos com sucesso!");
            setIsCategoryDeleteConfirmOpen(false);
            setConfirmCategoryDelete(null);
            utils.championships.getStages.invalidate({ championshipId });
            utils.championships.getStandings.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao excluir categoria");
        }
    });

    const handleAddStage = () => {
        const stageNum = parseInt(form.stageNumber, 10);
        if (isNaN(stageNum) || stageNum <= 0) {
            toast.error("Número da etapa inválido");
            return;
        }

        if (form.stageType === 'internal') {
            if (!form.eventId) {
                toast.error("Selecione um evento da plataforma");
                return;
            }
            addStageMutation.mutate({
                championshipId,
                eventId: parseInt(form.eventId, 10),
                stageNumber: stageNum,
            });
        } else {
            if (!form.customName) {
                toast.error("Digite o nome da prova externa");
                return;
            }
            addStageMutation.mutate({
                championshipId,
                customName: form.customName,
                stageNumber: stageNum,
            });
        }
    };

    const clearStageResultsMutation = trpc.championships.clearStageResults.useMutation({
        onSuccess: () => {
            toast.success("Resultados excluídos com sucesso!");
            setIsConfirmOpen(false);
            utils.championships.getStages.invalidate({ championshipId });
            utils.championships.getStandings.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao excluir resultados");
        }
    });

    const deleteStageMutation = trpc.championships.deleteStage.useMutation({
        onSuccess: () => {
            toast.success("Etapa excluída com sucesso!");
            setIsConfirmOpen(false);
            utils.championships.getStages.invalidate({ championshipId });
            utils.championships.getStandings.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao excluir etapa");
        }
    });

    const mergeCompetitorsMutation = trpc.championships.mergeCompetitors.useMutation({
        onSuccess: () => {
            toast.success("Competidores unificados com sucesso!");
            setIsMergeModalOpen(false);
            setIsMergeConfirmOpen(false);
            setMergeTarget("");
            setMergeSources([]);
            utils.championships.getStandings.invalidate({ championshipId });
            utils.championships.getStages.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao unificar competidores");
        }
    });

    // Phase 16: Export PDF Logic
    const uploadMutation = trpc.upload.image.useMutation();

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingBanner(true);
        try {
            const base64 = await compressImage(file);
            const { url } = await uploadMutation.mutateAsync({
                base64,
                fileName: `banner_${file.name}`,
                contentType: file.type
            });
            setEditForm(prev => ({ ...prev, sponsorBannerUrl: url }));
            toast.success("Banner de patrocinadores carregado!");
        } catch (error) {
            console.error("Erro no upload do banner:", error);
            toast.error("Erro ao fazer upload do banner.");
        } finally {
            setIsUploadingBanner(false);
            if (bannerInputRef.current) bannerInputRef.current.value = "";
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingLogo(true);
        try {
            const base64 = await compressImage(file);
            const { url } = await uploadMutation.mutateAsync({
                base64,
                fileName: `logo_${file.name}`,
                contentType: file.type
            });
            setEditForm(prev => ({ ...prev, imageUrl: url }));
            toast.success("Logo do campeonato carregada!");
        } catch (error) {
            console.error("Erro no upload da logo:", error);
            toast.error("Erro ao fazer upload da logo.");
        } finally {
            setIsUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = "";
        }
    };

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
        const champLogoBase64 = championship?.imageUrl ? await urlToBase64(championship.imageUrl) : "";
        const sponsorBannerBase64 = championship?.sponsorBannerUrl ? await urlToBase64(championship.sponsorBannerUrl) : "";



        // Sort stages by number
        const orderedStages = [...standingsData.stages].sort((a, b) => a.stageNumber - b.stageNumber);

        standingsData.standings.forEach((cat, catIdx) => {
            if (catIdx > 0) doc.addPage();

            // --- HEADER ---
            // Left: Championship Logo
            if (champLogoBase64) {
                try {
                    doc.addImage(champLogoBase64, "JPEG", margin, 10, 25, 0, undefined, 'FAST');
                } catch (e) { console.error("Logo error", e); }
            } else {
                // Fallback icon/placeholder if no logo
                doc.setDrawColor(200);
                doc.rect(margin, 10, 25, 25);
                doc.setFontSize(8);
                doc.text("COPA", margin + 12.5, 23, { align: 'center' });
            }

            // Center: Name and Title
            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text(championship?.name || "Campeonato", pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`Classificação Geral Oficial - ${cat.name}`, pageWidth / 2, 27, { align: 'center' });

            doc.setFontSize(8);
            doc.setTextColor(60, 60, 60);
            doc.text("www.amigoracing.com.br", pageWidth / 2, 33, { align: 'center' });

            // Right: Amigo Racing Logo
            try {
                // Using logo-light.png and keeping it proportional
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
                        1: { halign: 'left', cellWidth: 'auto' }, // Competitor Name
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
                        // --- FOOTER ---
                        // Page Number
                        const str = "Página " + doc.internal.pages.length;
                        doc.setFontSize(8);
                        doc.setTextColor(100);
                        doc.text(str, pageWidth - margin - 15, pageHeight - 5);

                        // Discard Legend
                        doc.setFontSize(7);
                        doc.setTextColor(255, 0, 0);
                        doc.text("* Valores em vermelho/itálico representam resultados descartados pelo regulamento.", margin, pageHeight - 5);

                        // Sponsor Banner
                        if (sponsorBannerBase64) {
                            try {
                                // Position exactly at the bottom margin
                                doc.addImage(sponsorBannerBase64, "JPEG", margin, pageHeight - 32, pageWidth - (margin * 2), 0);
                            } catch (e) { }
                        }
                    }
                });

                currentY = (doc as any).lastAutoTable.finalY + 10;

            });
        });


        doc.save(`Classificacao_${championship?.name || "Copa"}.pdf`);
    };

    const handleConfirmAction = () => {
        if (!confirmAction) return;
        if (confirmAction.type === 'clear') {
            clearStageResultsMutation.mutate({ stageId: confirmAction.stageId });
        } else {
            deleteStageMutation.mutate({ stageId: confirmAction.stageId });
        }
    };

    const updateChampionshipMutation = trpc.championships.updateChampionship.useMutation({
        onSuccess: () => {
            toast.success("Campeonato atualizado com sucesso!");
            setEditDialogOpen(false);
            utils.championships.getAllByOrganizer.invalidate();
            utils.championships.getStandings.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao atualizar campeonato");
        }
    });

    const deleteChampionshipMutation = trpc.championships.deleteChampionship.useMutation({
        onSuccess: () => {
            toast.success("Campeonato excluído permanentemente!");
            setLocation("/organizer/championships");
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao excluir campeonato");
        }
    });

    const handleUpdateChampionship = () => {
        if (!editForm.name) {
            toast.error("O nome do campeonato é obrigatório");
            return;
        }
        updateChampionshipMutation.mutate({
            id: championshipId,
            name: editForm.name,
            discardRule: parseInt(editForm.discardRule, 10),
            allowDiscardMissedStages: editForm.allowDiscardMissedStages,
            sponsorBannerUrl: editForm.sponsorBannerUrl,
            imageUrl: editForm.imageUrl
        });
    };

    const saveResultsMutation = trpc.championships.saveStageResults.useMutation({
        onSuccess: (data) => {
            toast.success(`${data.count} resultados salvos com sucesso!`);
            setResultsModalOpen(false);
            setParsedResults([]);
            setCsvFilename("");
            utils.championships.getStages.invalidate({ championshipId });
            utils.championships.getStandings.invalidate({ championshipId });
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao salvar resultados");
        }
    });

    useEffect(() => {
        if (!rawCsvData.length || !selectedPosColumn) {
            setParsedResults([]);
            return;
        }

        const pilotCol = csvHeaders.find(h => h.toLowerCase().includes("piloto") && !h.toLowerCase().includes("cpf") && !h.toLowerCase().includes("cidade") && !h.toLowerCase().includes("estado"));
        const navCol = csvHeaders.find(h => h.toLowerCase().includes("navegador") && !h.toLowerCase().includes("cpf") && !h.toLowerCase().includes("cidade") && !h.toLowerCase().includes("estado"));
        const catCol = csvHeaders.find(h => h.toLowerCase().includes("categoria"));

        const newResults: ParsedResult[] = [];

        rawCsvData.forEach(row => {
            const posStr = row[selectedPosColumn]?.trim() || "";
            const pilot = pilotCol ? row[pilotCol]?.trim() || null : null;
            const navigator = navCol ? row[navCol]?.trim() || null : null;
            const category = catCol ? row[catCol]?.trim() || "Geral" : "Geral";

            // Kraken usa "NC" para desclassificados/não completou
            const isDsq = posStr.toUpperCase() === "NC" || posStr.toUpperCase() === "DSQ";
            const position = isDsq ? 0 : parseInt(posStr, 10);

            if (isDsq || (!isNaN(position) && position > 0)) {
                newResults.push({
                    position,
                    pilotName: pilot && pilot !== "-" ? pilot : null,
                    navigatorName: navigator && navigator !== "-" ? navigator : null,
                    isDisqualified: isDsq,
                    points: calculateCbaPoints(position, isDsq),
                    category
                });
            }
        });

        // Ordena para prévia (DSQ pro final se position for 0, ou position numbers)
        newResults.sort((a, b) => {
            if (a.isDisqualified && !b.isDisqualified) return 1;
            if (!a.isDisqualified && b.isDisqualified) return -1;
            return a.position - b.position;
        });

        setParsedResults(newResults);
    }, [rawCsvData, selectedPosColumn, csvHeaders]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCsvFilename(file.name);
        setRawCsvData([]);
        setCsvHeaders([]);
        setSelectedPosColumn("");

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text !== 'string') return;

            const lines = text.split('\n').filter(l => l.trim().length > 0);
            if (lines.length < 2) {
                toast.error("O arquivo CSV parece estar vazio ou sem cabeçalho.");
                return;
            }

            // Parser flexível pelo cabeçalho
            const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''));

            const data: Record<string, string>[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));

                // Pular linhas totalmente vazias ou muito curtas
                if (cols.length < 2 && cols[0] === "") continue;

                const rowObj: Record<string, string> = {};
                headers.forEach((h, idx) => {
                    rowObj[h] = cols[idx] || "";
                });
                data.push(rowObj);
            }

            setCsvHeaders(headers);
            setRawCsvData(data);

            // Tenta achar a melhor coluna base
            const defaultPosCol = headers.find(h => h.toLowerCase().startsWith("pos etapa")) || headers.find(h => h.toLowerCase().startsWith("pos"));
            if (defaultPosCol) {
                setSelectedPosColumn(defaultPosCol);
            }
        };
        reader.onerror = () => {
            toast.error("Erro ao ler o arquivo CSV");
        };
        reader.readAsText(file, 'utf-8');
    };

    const handleSaveResults = () => {
        if (!selectedStageId) return;
        if (parsedResults.length === 0) {
            toast.error("Nenhum resultado para salvar.");
            return;
        }

        saveResultsMutation.mutate({
            stageId: selectedStageId,
            results: parsedResults.map(r => ({
                pilotName: r.pilotName,
                navigatorName: r.navigatorName,
                position: r.position,
                isDisqualified: r.isDisqualified,
                category: r.category
            }))
        });
    };

    const openResultsModal = (stageId: number) => {
        setSelectedStageId(stageId);
        setCsvHeaders([]);
        setSelectedPosColumn("");
        setRawCsvData([]);
        setParsedResults([]);
        setCsvFilename("");
        setResultsModalOpen(true);
    };

    if (loading || isChampionshipsLoading) {
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

            <div className="container py-8 max-w-5xl">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <Link href="/organizer/championships" className="hover:text-foreground transition-colors">Campeonatos</Link>
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
                                <span className="font-semibold text-foreground">Regra de Descarte:</span> {championship.discardRule > 0 ? `N-${championship.discardRule}` : 'Sem descarte'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Settings className="h-4 w-4" />
                                    Configurações
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Editar Campeonato</DialogTitle>
                                    <DialogDescription>
                                        Altere as configurações básicas desta competição.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="editName">Nome do Campeonato</Label>
                                        <Input
                                            id="editName"
                                            value={editForm.name}
                                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Logo do Campeonato (Topo Esquerdo do PDF)</Label>
                                        <div className="flex items-center gap-4">
                                            {editForm.imageUrl ? (
                                                <div className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted">
                                                    <img
                                                        src={editForm.imageUrl}
                                                        alt="Championship Logo Preview"
                                                        className="w-full h-full object-contain"
                                                    />
                                                    <button
                                                        onClick={() => setEditForm(prev => ({ ...prev, imageUrl: "" }))}
                                                        className="absolute top-0.5 right-0.5 bg-background/80 hover:bg-destructive hover:text-white text-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remover logo"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => logoInputRef.current?.click()}
                                                    className="w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/50 transition-colors"
                                                >
                                                    {isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Upload className="h-4 w-4 text-primary" />}
                                                    <span className="text-[10px] font-medium">Logo</span>
                                                </div>
                                            )}
                                            <div className="flex-1 text-xs text-muted-foreground">
                                                <p className="font-medium text-foreground">Escudo oficial</p>
                                                <p>Aparecerá no cabeçalho dos documentos.</p>
                                            </div>
                                            <input
                                                ref={logoInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleLogoUpload}
                                                disabled={isUploadingLogo}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="editDiscard">Regra de Descarte (N-x)</Label>
                                        <Select
                                            value={editForm.discardRule}
                                            onValueChange={v => setEditForm(prev => ({ ...prev, discardRule: v }))}
                                        >
                                            <SelectTrigger id="editDiscard">
                                                <SelectValue placeholder="Selecione a regra" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">Sem descarte</SelectItem>
                                                <SelectItem value="1">Descartar 1 pior resultado (N-1)</SelectItem>
                                                <SelectItem value="2">Descartar 2 piores resultados (N-2)</SelectItem>
                                                <SelectItem value="3">Descartar 3 piores resultados (N-3)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            * A regra de descarte recalcula automaticamente a pontuação líquida de todos os pilotos.
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between space-x-2 py-3 border rounded-lg px-4 bg-muted/20">
                                        <div className="flex flex-col space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="allowDiscardMissedStages" className="cursor-pointer">Permitir descarte de faltas</Label>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-[250px]">
                                                            <p>Se desativado, o zero de uma falta (DNS) não poderá ser descartado, forçando o descarte a ser aplicado nas etapas em que o competidor participou.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground text-balance">
                                                Se ativo, as faltas contam como piores resultados para descarte.
                                            </p>
                                        </div>
                                        <Switch
                                            id="allowDiscardMissedStages"
                                            checked={editForm.allowDiscardMissedStages}
                                            onCheckedChange={v => setEditForm(prev => ({ ...prev, allowDiscardMissedStages: v }))}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Banner de Patrocinadores (Rodapé do PDF)</Label>
                                        <div className="flex flex-col gap-3">
                                            {editForm.sponsorBannerUrl ? (
                                                <div className="relative group rounded-lg overflow-hidden border bg-muted aspect-[5/1]">
                                                    <img
                                                        src={editForm.sponsorBannerUrl}
                                                        alt="Sponsor Banner Preview"
                                                        className="w-full h-full object-contain"
                                                    />
                                                    <button
                                                        onClick={() => setEditForm(prev => ({ ...prev, sponsorBannerUrl: "" }))}
                                                        className="absolute top-1 right-1 bg-background/80 hover:bg-destructive hover:text-white text-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remover banner"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => bannerInputRef.current?.click()}
                                                    className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                                >
                                                    <div className="bg-primary/10 p-2 rounded-full">
                                                        {isUploadingBanner ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium">Clique para fazer upload</p>
                                                        <p className="text-xs text-muted-foreground mt-1">Recomendado: 1920x200px</p>
                                                    </div>
                                                </div>
                                            )}

                                            <input
                                                ref={bannerInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleBannerUpload}
                                                disabled={isUploadingBanner}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-destructive/20">
                                        <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-2">
                                            <AlertTriangle className="h-4 w-4" /> Zona de Perigo
                                        </h4>
                                        <Button
                                            variant="destructive"
                                            className="w-full gap-2"
                                            onClick={() => setIsDeleteChampionshipConfirmOpen(true)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Excluir Campeonato Inteiro
                                        </Button>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleUpdateChampionship} disabled={updateChampionshipMutation.isPending}>
                                        {updateChampionshipMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                        Salvar Alterações
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {isOrganizerOrAdmin && standingsData && standingsData.standings.length > 0 && (
                            <Button
                                variant="default"
                                size="sm"
                                className="h-9 gap-2 bg-primary hover:bg-primary/90"
                                onClick={() => exportStandingsPDF()}
                            >
                                <Upload className="h-4 w-4 rotate-180" />
                                Exportar PDF
                            </Button>
                        )}

                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 w-full md:w-auto">
                                    <Plus className="h-4 w-4" />
                                    Adicionar Etapa
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Adicionar Etapa ao Campeonato</DialogTitle>
                                    <DialogDescription>
                                        Vincule um evento da plataforma ou crie uma etapa externa para upload de resultados.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <Tabs value={form.stageType} onValueChange={(v) => setForm({ ...form, stageType: v })}>
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="internal">Plataforma</TabsTrigger>
                                            <TabsTrigger value="external">Prova Externa</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="internal" className="space-y-4 pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="eventSelect">Evento da Plataforma *</Label>
                                                <Select value={form.eventId} onValueChange={(v) => setForm({ ...form, eventId: v })}>
                                                    <SelectTrigger id="eventSelect">
                                                        <SelectValue placeholder={isEventsLoading ? "Carregando..." : "Selecione o evento"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {myEvents?.map(event => (
                                                            <SelectItem key={event.id} value={event.id.toString()}>
                                                                {event.name} ({new Date(event.startDate).toLocaleDateString('pt-BR')})
                                                            </SelectItem>
                                                        ))}
                                                        {(!myEvents || myEvents.length === 0) && (
                                                            <SelectItem value="none" disabled>Nenhum evento encontrado</SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="external" className="space-y-4 pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="customName">Nome da Prova Externa *</Label>
                                                <Input
                                                    id="customName"
                                                    value={form.customName}
                                                    onChange={e => setForm({ ...form, customName: e.target.value })}
                                                    placeholder="Ex: Rally de Barretos - Off Road"
                                                />
                                            </div>
                                        </TabsContent>
                                    </Tabs>

                                    <div className="space-y-2">
                                        <Label htmlFor="stageNum">Nº da Etapa *</Label>
                                        <Input
                                            id="stageNum"
                                            type="number"
                                            min="1"
                                            value={form.stageNumber}
                                            onChange={e => setForm({ ...form, stageNumber: e.target.value })}
                                            placeholder="Ex: 1 (para 1ª etapa)"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleAddStage} disabled={addStageMutation.isPending}>
                                        {addStageMutation.isPending ? "Adicionando..." : "Salvar Etapa"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <Tabs defaultValue="standings" className="w-full space-y-6">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-full overflow-x-auto pb-1 scrollbar-hide flex justify-center">
                            <TabsList className="bg-muted/50 p-1 w-full max-w-[600px] flex min-w-max">
                                <TabsTrigger value="standings" className="flex-1">Geral do Campeonato</TabsTrigger>
                                <TabsTrigger value="stages" className="flex-1">Etapas e Resultados</TabsTrigger>
                                <TabsTrigger value="requests" className="flex-1 relative">
                                    Solicitações
                                    {pendingRequests && pendingRequests.length > 0 && (
                                        <span className="ml-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                                            {pendingRequests.filter(r => r.championshipName === championship?.name).length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    <TabsContent value="stages">
                        {/* Stages List */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Flag className="h-5 w-5 text-primary" /> Etapas do Campeonato
                                </CardTitle>
                                <CardDescription>Eventos que compõem este campeonato e geram os resultados pontuados.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isStagesLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : !stages || stages.length === 0 ? (
                                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                                        <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground">Adicione eventos a este campeonato para começar a somar pontos.</p>
                                    </div>
                                ) : (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[100px] text-center">Etapa</TableHead>
                                                    <TableHead>Evento</TableHead>
                                                    <TableHead>Data</TableHead>
                                                    <TableHead className="text-right">Local</TableHead>
                                                    <TableHead className="text-center w-[120px]">Resultados</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stages.sort((a, b) => a.stageNumber - b.stageNumber).map((stage) => (
                                                    <TableRow key={stage.id}>
                                                        <TableCell className="text-center font-bold text-lg bg-muted/30">
                                                            {stage.stageNumber}ª
                                                        </TableCell>
                                                        <TableCell className="font-medium text-primary">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2">
                                                                    {stage.isExternal ? (
                                                                        <>
                                                                            {stage.customName}
                                                                            <Badge variant="secondary" className="text-[10px] uppercase font-bold bg-muted text-muted-foreground border-none">Externa</Badge>
                                                                        </>
                                                                    ) : (
                                                                        stage.event?.name
                                                                    )}
                                                                </div>
                                                                {/* Category Badges from Phase 14 */}
                                                                {(stage as any).categories?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {(stage as any).categories.map((cat: string) => (
                                                                            <Badge key={cat} variant="outline" className="text-[9px] py-0 px-1 border-primary/20 text-primary uppercase font-bold bg-primary/5">
                                                                                {cat}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-sm">
                                                            <div className="flex items-center gap-1.5">
                                                                <CalendarDays className="h-3.5 w-3.5" />
                                                                {!stage.isExternal && stage.event?.startDate ? format(new Date(stage.event.startDate), "dd 'de' MMMM", { locale: ptBR }) : '-'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground text-sm">
                                                            {!stage.isExternal && stage.event?.city ? `${stage.event.city}/${stage.event.state}` : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                                                                    onClick={() => openResultsModal(stage.id)}
                                                                >
                                                                    <Upload className="h-4 w-4" />
                                                                    Lançar
                                                                </Button>
                                                                {(stage as any).categories?.length > 0 && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 gap-1.5"
                                                                        onClick={() => {
                                                                            setActiveViewStageId(stage.id);
                                                                            setViewResultsModalOpen(true);
                                                                        }}
                                                                    >
                                                                        <List className="h-4 w-4" />
                                                                        Gerenciar
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center w-[50px]">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                        <MoreVertical className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem
                                                                        className="text-amber-600 focus:text-amber-600 cursor-pointer"
                                                                        onClick={() => {
                                                                            setConfirmAction({ type: 'clear', stageId: stage.id, stageNumber: stage.stageNumber });
                                                                            setIsConfirmOpen(true);
                                                                        }}
                                                                    >
                                                                        <Eraser className="h-4 w-4 mr-2" />
                                                                        Limpar Resultados
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-destructive focus:text-destructive cursor-pointer"
                                                                        onClick={() => {
                                                                            setConfirmAction({ type: 'delete', stageId: stage.id, stageNumber: stage.stageNumber });
                                                                            setIsConfirmOpen(true);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                                        Excluir Etapa
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="requests">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Trophy className="h-5 w-5 text-primary" /> Solicitações de Etapas (Collab)
                                </CardTitle>
                                <CardDescription>Organizadores locais que pediram para incluir seus eventos neste campeonato.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isRequestsLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : !pendingRequests || pendingRequests.filter(r => r.championshipName === championship?.name).length === 0 ? (
                                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                                        <h3 className="text-lg font-medium text-muted-foreground mb-1">Pista Limpa!</h3>
                                        <p className="text-sm text-muted-foreground">Não há solicitações de vínculo pendentes para este campeonato no momento.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {pendingRequests.filter(r => r.championshipName === championship?.name).map(req => (
                                            <Card key={req.id} className="border border-border/50 bg-card overflow-hidden">
                                                <div className="p-4">
                                                    <div className="flex gap-2 items-start mb-2">
                                                        <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                                        <div>
                                                            <h4 className="font-semibold text-lg leading-tight">{req.eventName}</h4>
                                                            <p className="text-sm text-muted-foreground">{req.eventCity}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                                                        <CalendarDays className="h-4 w-4" />
                                                        {new Date(req.eventDate).toLocaleDateString('pt-BR')}
                                                    </div>
                                                </div>
                                                <div className="bg-muted/30 px-4 py-3 flex gap-2 justify-end border-t border-border/50">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                        onClick={() => handleRespondRequest(req.id, "REJECTED")}
                                                        disabled={respondRequestMutation.isPending}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-1" />
                                                        Recusar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="bg-green-600 hover:bg-green-700 text-white"
                                                        onClick={() => handleRespondRequest(req.id, "APPROVED")}
                                                        disabled={respondRequestMutation.isPending}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4 mr-1" />
                                                        Aprovar
                                                    </Button>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="standings">
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <Trophy className="h-5 w-5 text-primary" /> Classificação Geral
                                        </CardTitle>
                                        <CardDescription>Pódio e resultados acumulados por competidor e categoria.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Categoria" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todas</SelectItem>
                                                {standingsData?.standings?.map(cat => (
                                                    <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <div className="bg-muted p-1 rounded-md flex items-center">
                                            <Button
                                                variant={selectedRole === "pilot" ? "default" : "ghost"}
                                                size="sm"
                                                onClick={() => setSelectedRole("pilot")}
                                                className="h-8 px-4"
                                            >
                                                Pilotos
                                            </Button>
                                            <Button
                                                variant={selectedRole === "navigator" ? "default" : "ghost"}
                                                size="sm"
                                                onClick={() => setSelectedRole("navigator")}
                                                className="h-8 px-4"
                                            >
                                                Navegadores
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-2">

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/5"
                                                onClick={() => setIsMergeModalOpen(true)}
                                            >
                                                <GitMerge className="h-4 w-4" />
                                                Unificar Competidores
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {isStandingsLoading ? (
                                    <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : !standingsData || standingsData.standings.length === 0 ? (
                                    <div className="text-center p-12 border border-dashed rounded-lg bg-muted/20">
                                        <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                                        <h3 className="text-lg font-medium text-muted-foreground mb-1">Nenhum resultado processado</h3>
                                        <p className="text-sm text-muted-foreground">Lance resultados nas etapas para visualizar a tabela geral.</p>
                                    </div>
                                ) : (() => {
                                    const categoryData = standingsData.standings.find(s => s.name === selectedCategory);
                                    if (!categoryData) {
                                        return (
                                            <div className="text-center p-8 text-muted-foreground">Categoria sem dados.</div>
                                        );
                                    }

                                    const competitorsList = selectedRole === "pilot" ? categoryData.pilots : categoryData.navigators;
                                    const orderedStages = standingsData.stages.sort((a, b) => a.stageNumber - b.stageNumber);

                                    return (
                                        <div className="rounded-md border overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-muted/50">
                                                    <TableRow>
                                                        <TableHead className="w-[60px] text-center font-bold">Pos</TableHead>
                                                        <TableHead className="font-bold">Competidor</TableHead>
                                                        {orderedStages.map(st => {
                                                            const eventName = st.event?.name || st.customName || "";
                                                            return (
                                                                <TableHead key={st.id} className="text-center w-[100px] text-[10px] leading-tight px-1">
                                                                    E{st.stageNumber}
                                                                    {eventName && (
                                                                        <div className="text-[9px] font-normal text-muted-foreground truncate max-w-[90px]" title={eventName}>
                                                                            {eventName}
                                                                        </div>
                                                                    )}
                                                                </TableHead>
                                                            );
                                                        })}
                                                        <TableHead className="w-[100px] text-center font-bold text-primary">Pontos</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {competitorsList.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={orderedStages.length + 3} className="text-center p-8 text-muted-foreground">
                                                                Nenhum {selectedRole === "pilot" ? "piloto" : "navegador"} pontuando nesta categoria.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        competitorsList.map((comp, idx) => (
                                                            <TableRow key={comp.name} className={idx < 3 ? "bg-primary/5" : ""}>
                                                                <TableCell className="text-center font-bold text-lg">
                                                                    {idx === 0 && <span className="text-yellow-500 mr-1">🥇</span>}
                                                                    {idx === 1 && <span className="text-gray-400 mr-1">🥈</span>}
                                                                    {idx === 2 && <span className="text-amber-600 mr-1">🥉</span>}
                                                                    {idx + 1}º
                                                                </TableCell>
                                                                <TableCell className="font-medium whitespace-nowrap">{comp.name}</TableCell>
                                                                {orderedStages.map(st => {
                                                                    const res = comp.stageResults.find(sr => sr.stageId === st.id);
                                                                    return (
                                                                        <TableCell key={st.id} className="text-center p-2">
                                                                            {!res ? (
                                                                                <span className="text-muted-foreground/30">-</span>
                                                                            ) : res.isDisqualified ? (
                                                                                <span className="text-[10px] items-center text-destructive font-bold bg-destructive/10 px-1.5 py-0.5 rounded uppercase">NC/DSQ</span>
                                                                            ) : res.isDiscarded ? (
                                                                                <span className="text-sm line-through text-red-500/70 relative group cursor-help">
                                                                                    {res.points}
                                                                                    <span className="text-[10px] absolute -top-2 -right-3 text-red-500">d</span>
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-sm font-medium">{res.points}</span>
                                                                            )}
                                                                        </TableCell>
                                                                    );
                                                                })}
                                                                <TableCell className="text-center font-bold text-lg text-primary bg-primary/10">
                                                                    {comp.netPoints}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        {/* Performance Flow Chart */}
                        {standingsData && standingsData.standings.length > 0 && selectedCategory !== 'all' && (
                            <Card className="mt-6 border-primary/10">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <ArrowLeft className="h-4 w-4 rotate-180 text-primary" />
                                        Evolução de Performance
                                    </CardTitle>
                                    <CardDescription>Visualização da constância de pontos ao longo das etapas.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px] w-full pt-4">
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
                    </TabsContent>
                </Tabs>
            </div>

            {/* CSV Results Upload Modal */}
            <Dialog open={resultsModalOpen} onOpenChange={setResultsModalOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <List className="h-5 w-5 text-primary" />
                            Lançar Resultados da Etapa
                        </DialogTitle>
                        <DialogDescription>
                            Faça o upload da planilha (CSV) gerada pelo sistema de cronometragem. As colunas devem seguir a ordem: Posição, Piloto, Navegador, Status.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-4">
                        <div className="flex items-center gap-4 mb-6">
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto border-dashed border-2 bg-muted/10 h-16 flex items-center justify-center gap-3 hover:bg-muted/30"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="h-5 w-5 text-muted-foreground" />
                                <div className="text-left">
                                    <div className="font-semibold text-sm">Selecionar Arquivo CSV</div>
                                    <div className="text-xs text-muted-foreground font-normal">{csvFilename || 'Nenhum arquivo selecionado'}</div>
                                </div>
                            </Button>
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                            />
                            {csvHeaders.length > 0 && (
                                <div className="ml-4 flex-1">
                                    <Label className="text-xs text-muted-foreground mb-1 block">Ler Posições da Coluna:</Label>
                                    <Select value={selectedPosColumn} onValueChange={setSelectedPosColumn}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Selecione a coluna" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {csvHeaders.map(h => (
                                                <SelectItem key={h} value={h}>{h}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {parsedResults.length > 0 ? (
                            <div className="rounded-md border text-sm">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0">
                                        <TableRow>
                                            <TableHead className="w-[80px] text-center text-xs">Pos</TableHead>
                                            <TableHead className="text-xs">Piloto</TableHead>
                                            <TableHead className="text-xs">Navegador</TableHead>
                                            <TableHead className="w-[120px] text-center text-xs">Status</TableHead>
                                            <TableHead className="w-[100px] text-center font-bold text-primary text-xs">Pontos CBA</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {parsedResults.map((r, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-center font-medium">{r.position}º</TableCell>
                                                <TableCell>{r.pilotName || '-'}</TableCell>
                                                <TableCell>{r.navigatorName || '-'}</TableCell>
                                                <TableCell className="text-center">
                                                    {r.isDisqualified ? (
                                                        <span className="bg-destructive/10 text-destructive text-[10px] uppercase font-bold px-2 py-0.5 rounded">DSQ/NC</span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">OK</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="bg-primary/10 text-primary font-bold px-2 py-1 rounded inline-block">
                                                        +{r.points}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/20">
                                <List className="h-10 w-10 text-muted-foreground/30 mb-4" />
                                <p className="text-muted-foreground mb-1">Nenhum dado para exibir.</p>
                                <p className="text-xs text-muted-foreground/70">Faça o upload de um CSV para visualizar os pontos calculados da CBA.</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="mt-4 pt-4 border-t">
                        <Button variant="outline" onClick={() => setResultsModalOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={handleSaveResults}
                            disabled={parsedResults.length === 0 || saveResultsMutation.isPending}
                            className="gap-2"
                        >
                            {saveResultsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {saveResultsMutation.isPending ? "Salvando..." : "Salvar Resultados da Etapa"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Phase 11: Confirmation Dialog */}
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmAction?.type === 'clear' ? 'Limpar Resultados' : 'Excluir Etapa'} da {confirmAction?.stageNumber}ª Etapa
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-destructive font-medium">
                            Tem certeza? Esta ação apagará os pontos de todos os pilotos desta etapa e recalculará o campeonato.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsConfirmOpen(false)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className={confirmAction?.type === 'clear' ? "bg-amber-600 hover:bg-amber-700" : "bg-destructive hover:bg-destructive/90"}
                            onClick={handleConfirmAction}
                            disabled={clearStageResultsMutation.isPending || deleteStageMutation.isPending}
                        >
                            {clearStageResultsMutation.isPending || deleteStageMutation.isPending ? "Processando..." : "Confirmar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Phase 12: Championship Severe Deletion Dialog */}
            <AlertDialog open={isDeleteChampionshipConfirmOpen} onOpenChange={setIsDeleteChampionshipConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Campeonato Permanentemente?</AlertDialogTitle>
                        <AlertDialogDescription className="text-destructive font-bold text-lg">
                            Tem certeza absoluta? Isso apagará o campeonato inteiro, todas as etapas e classificações vinculadas. Esta ação é irreversível.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsDeleteChampionshipConfirmOpen(false)}>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => deleteChampionshipMutation.mutate({ id: championshipId })}
                            disabled={deleteChampionshipMutation.isPending}
                        >
                            {deleteChampionshipMutation.isPending ? "Excluindo..." : "Sim, Excluir Tudo"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Phase 14: Category Results Manager Dialog */}
            <CategoryResultsManager
                stageId={activeViewStageId}
                open={viewResultsModalOpen}
                onOpenChange={setViewResultsModalOpen}
                stageNumber={stages?.find(s => s.id === activeViewStageId)?.stageNumber || 0}
                onClearCategory={(cat) => {
                    setConfirmCategoryDelete({
                        stageId: activeViewStageId!,
                        category: cat,
                        stageNumber: stages?.find(s => s.id === activeViewStageId)?.stageNumber || 0
                    });
                    setIsCategoryDeleteConfirmOpen(true);
                }}
            />

            {/* Category Deletion Confirmation */}
            <AlertDialog open={isCategoryDeleteConfirmOpen} onOpenChange={setIsCategoryDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apagar Resultados da Categoria: {confirmCategoryDelete?.category}</AlertDialogTitle>
                        <AlertDialogDescription className="text-destructive font-medium">
                            Isso removerá apenas os resultados da categoria <strong>{confirmCategoryDelete?.category}</strong> na {confirmCategoryDelete?.stageNumber}ª Etapa. Os resultados de outras categorias serão preservados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsCategoryDeleteConfirmOpen(false)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive"
                            onClick={() => {
                                if (confirmCategoryDelete) {
                                    clearStageResultsByCategoryMutation.mutate({
                                        stageId: confirmCategoryDelete.stageId,
                                        category: confirmCategoryDelete.category
                                    });
                                }
                            }}
                            disabled={clearStageResultsByCategoryMutation.isPending}
                        >
                            {clearStageResultsByCategoryMutation.isPending ? "Excluindo..." : "Confirmar Exclusão"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Phase 15: Merge Competitors Modal */}
            <Dialog open={isMergeModalOpen} onOpenChange={setIsMergeModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GitMerge className="h-5 w-5 text-primary" />
                            Unificar Competidores
                        </DialogTitle>
                        <DialogDescription>
                            Mescle diferentes variações de nomes do mesmo competidor para consolidar os pontos na classificação.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6">
                        {(() => {
                            const allUniqueNames = Array.from(new Set(
                                standingsData?.standings?.flatMap(cat => [
                                    ...cat.pilots.map(p => p.name),
                                    ...cat.navigators.map(n => n.name)
                                ]) || []
                            )).sort();

                            return (
                                <>
                                    <div className="space-y-3">
                                        <Label className="text-base font-bold text-primary">1. Nome Principal (Definitivo)</Label>
                                        <p className="text-xs text-muted-foreground">Este é o nome que ficará gravado em todos os resultados deste campeonato.</p>
                                        <Select value={mergeTarget} onValueChange={setMergeTarget}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Escolha o nome oficial..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allUniqueNames.map(name => (
                                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-base font-bold text-primary">2. Nomes para Unificar</Label>
                                        <p className="text-xs text-muted-foreground">Estes nomes deixarão de existir e seus pontos serão transferidos ao Nome Principal.</p>
                                        <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto bg-muted/5">
                                            {allUniqueNames
                                                .filter(name => name !== mergeTarget)
                                                .map(name => (
                                                    <div
                                                        key={name}
                                                        className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors ${mergeSources.includes(name) ? 'bg-primary/5' : ''}`}
                                                        onClick={() => {
                                                            setMergeSources(prev =>
                                                                prev.includes(name)
                                                                    ? prev.filter(s => s !== name)
                                                                    : [...prev, name]
                                                            );
                                                        }}
                                                    >
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${mergeSources.includes(name) ? 'bg-primary border-primary text-white' : 'bg-transparent border-muted-foreground/30'}`}>
                                                            {mergeSources.includes(name) && <Check className="h-3.5 w-3.5" />}
                                                        </div>
                                                        <span className="text-sm font-medium">{name}</span>
                                                    </div>
                                                ))}
                                            {allUniqueNames.length <= 1 && (
                                                <div className="p-8 text-center text-muted-foreground italic text-sm">
                                                    Não há outros nomes disponíveis para unificar.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    <DialogFooter className="mt-4 pt-4 border-t gap-2">
                        <Button variant="outline" onClick={() => setIsMergeModalOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={() => setIsMergeConfirmOpen(true)}
                            disabled={!mergeTarget || mergeSources.length === 0}
                            className="gap-2"
                        >
                            <GitMerge className="h-4 w-4" />
                            Unificar Agora
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Merge Confirmation AlertDialog */}
            <AlertDialog open={isMergeConfirmOpen} onOpenChange={setIsMergeConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Unificação de Competidores?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                            <p className="font-medium text-foreground">
                                Você está fundindo:
                            </p>
                            <div className="bg-muted/50 p-3 rounded border text-sm flex flex-col gap-1">
                                {mergeSources.map(s => (
                                    <span key={s} className="text-destructive font-bold flex items-center gap-2">
                                        <XCircle className="h-3.5 w-3.5" />
                                        {s}
                                    </span>
                                ))}
                            </div>
                            <p className="text-center font-bold">⬇</p>
                            <div className="bg-primary/10 p-3 rounded border border-primary/20 text-sm">
                                <span className="text-primary font-bold flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {mergeTarget}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground pt-2">
                                <strong>Atenção:</strong> Todos os resultados das etapas e categorias vinculados aos nomes unificados serão atualizados para o Nome Principal. Esta ação reorganizará a Classificação Geral.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsMergeConfirmOpen(false)}>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-primary hover:bg-primary/90"
                            onClick={() => {
                                mergeCompetitorsMutation.mutate({
                                    championshipId,
                                    targetName: mergeTarget,
                                    sourceNames: mergeSources
                                });
                            }}
                            disabled={mergeCompetitorsMutation.isPending}
                        >
                            {mergeCompetitorsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Confirmar Unificação
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}


// Phase 14: Results manager component
function CategoryResultsManager({ stageId, open, onOpenChange, stageNumber, onClearCategory }: {
    stageId: number | null,
    open: boolean,
    onOpenChange: (open: boolean) => void,
    stageNumber: number,
    onClearCategory: (category: string) => void
}) {
    const { data: results, isLoading } = trpc.championships.getStageResults.useQuery(
        { stageId: stageId || 0 },
        { enabled: !!stageId && open }
    );

    const categories = Array.from(new Set(results?.map(r => r.category || "Geral") || []));
    const [activeTab, setActiveTab] = useState<string>("");

    useEffect(() => {
        if (categories.length > 0 && !activeTab) {
            setActiveTab(categories[0]);
        }
    }, [categories, activeTab]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        Gerenciar Resultados - {stageNumber}ª Etapa
                    </DialogTitle>
                    <DialogDescription>
                        Visualize os pilotos importados nesta etapa por categoria e limpe se necessário.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden mt-4">
                    {isLoading ? (
                        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : categories.length === 0 ? (
                        <div className="text-center p-12 text-muted-foreground border border-dashed rounded-lg">Nenhum resultado cadastrado nesta etapa.</div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                            <div className="overflow-x-auto pb-2">
                                <TabsList>
                                    {categories.map(cat => (
                                        <TabsTrigger key={cat} value={cat} className="capitalize">
                                            {cat}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>

                            {categories.map(cat => {
                                const catResults = results?.filter(r => (r.category || "Geral") === cat).sort((a, b) => a.position - b.position) || [];
                                return (
                                    <TabsContent key={cat} value={cat} className="flex-1 overflow-y-auto mt-2 border rounded-md">
                                        <div className="p-4 bg-muted/30 sticky top-0 z-10 border-b flex justify-between items-center">
                                            <h4 className="font-bold text-sm uppercase flex items-center gap-2">
                                                Resultados: {cat}
                                                <Badge variant="outline" className="ml-2">{catResults.length} pilotos</Badge>
                                            </h4>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-7 text-[10px] gap-1 px-2"
                                                onClick={() => onClearCategory(cat)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                                Limpar Categoria
                                            </Button>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12 text-center">Pos</TableHead>
                                                    <TableHead>Piloto</TableHead>
                                                    <TableHead>Navegador</TableHead>
                                                    <TableHead className="text-center">Pts</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {catResults.map(r => (
                                                    <TableRow key={r.id}>
                                                        <TableCell className="text-center font-bold">{r.isDisqualified ? 'DSQ' : `${r.position}º`}</TableCell>
                                                        <TableCell className="text-sm">{r.pilotName || '-'}</TableCell>
                                                        <TableCell className="text-sm">{r.navigatorName || '-'}</TableCell>
                                                        <TableCell className="text-center font-mono text-xs">{r.points}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TabsContent>
                                );
                            })}
                        </Tabs>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
