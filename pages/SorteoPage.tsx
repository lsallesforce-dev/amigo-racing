import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Save, Download, GripVertical, ArrowLeft, Image as ImageIcon, Upload } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortedItem {
    registrationId: number;
    pilotName: string;
    navigatorName?: string;
    categoryId: number;
    categoryName: string;
    number: number;
    startTime: string;
}

interface StartConfig {
    id: number;
    eventId: number;
    categoryId: number;
    orderPosition: number;
    numberStart: number;
    numberEnd: number;
    startTime: string;
    intervalSeconds: number;
    timeBetweenCategories?: number;
    registrationOrder?: string | null;
    categoryName: string;
    parentCategoryId?: number | null;
}

// Componente para item arrastável
function SortablePilotItem({ item, categoryId, onEdit, isEditing, editingId, index }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.registrationId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // Lógica da Cascata Visual (Staggered Grid)
    // Pilotos de índices pares à esquerda, ímpares à direita com um offset
    const isEven = index % 2 === 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative flex items-center justify-between p-3 bg-card rounded-lg border border-border transition-all ${isDragging ? "shadow-xl z-50 ring-2 ring-primary" : "shadow-sm"
                } ${!isEven ? "ml-8 md:ml-12 border-l-4 border-l-orange-500" : "mr-8 md:mr-12 border-l-4 border-l-slate-400"}`}
        >
            {/* Indicador de Posição Visual (Grid Style) */}
            <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
                {index + 1}
            </div>

            <div className="flex items-center gap-3 flex-1">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
                >
                    <GripVertical className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <div className="font-semibold text-foreground leading-tight">
                        {item.pilotName}
                        {item.navigatorName && (
                            <span className="text-muted-foreground font-normal block sm:inline sm:ml-1 text-sm">
                                / {item.navigatorName}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
                {isEditing && editingId === item.registrationId ? (
                    <input
                        type="number"
                        defaultValue={item.number}
                        onBlur={(e) => onEdit(item.registrationId, "number", parseInt(e.target.value))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onEdit(item.registrationId, "number", parseInt((e.target as HTMLInputElement).value));
                            }
                        }}
                        className="w-16 px-2 py-1 border border-orange-300 rounded font-mono font-bold text-orange-600 bg-background"
                        autoFocus
                    />
                ) : (
                    <span
                        onClick={() => onEdit(item.registrationId, "edit", null)}
                        className="font-mono font-bold text-orange-600 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/30 px-2 py-1 rounded transition-colors"
                    >
                        #{item.number}
                    </span>
                )}

                {isEditing && editingId === item.registrationId ? (
                    <input
                        type="time"
                        defaultValue={item.startTime}
                        onBlur={(e) => onEdit(item.registrationId, "time", e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onEdit(item.registrationId, "time", (e.target as HTMLInputElement).value);
                            }
                        }}
                        className="px-2 py-1 border border-border rounded font-mono bg-background"
                    />
                ) : (
                    <span
                        onClick={() => onEdit(item.registrationId, "edit", null)}
                        className="font-mono text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    >
                        {item.startTime}
                    </span>
                )}
            </div>
        </div>
    );
}

export function SorteoPage() {
    const { id: eventId } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const { user } = useAuth();
    const [sortedItems, setSortedItems] = useState<SortedItem[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [eventLogo, setEventLogo] = useState<string | null>(null);

    // Carregar logo do localStorage ao montar o componente
    useEffect(() => {
        const savedLogo = localStorage.getItem('evento_logo_temporaria');
        if (savedLogo) {
            setEventLogo(savedLogo);
        }
    }, []);
    const utils = trpc.useUtils();

    const { data: event } = trpc.events.get.useQuery(
        { id: Number(eventId) },
        { enabled: !!eventId }
    );

    const { data: registrations } = trpc.registrations.listByEvent.useQuery(
        { eventId: Number(eventId) },
        { enabled: !!eventId }
    );

    const { data: categories } = trpc.categories.listByEvent.useQuery(
        { eventId: Number(eventId) },
        { enabled: !!eventId }
    );

    const { data: startConfigs } = trpc.startOrder.getByEvent.useQuery(
        { eventId: Number(eventId) },
        { enabled: !!eventId }
    ) as { data: StartConfig[] | undefined };

    const upsertMutation = trpc.startOrder.upsert.useMutation();
    const exportHorarioLargadaMutation = trpc.startOrder.exportStartList.useMutation();
    const exportListaEventoMutation = trpc.startOrder.exportEventList.useMutation();
    const exportKrakenMutation = trpc.startOrder.exportKraken.useMutation();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
        if (!baseTime) return "08:00";
        const [hours, minutes] = baseTime.split(":").map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
        const newHours = Math.floor(totalSeconds / 3600) % 24;
        const newMinutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
    };

    const buildSortedList = () => {
        if (!registrations || !categories || !startConfigs) return [];

        const items: SortedItem[] = [];

        // Ordenar as configurações pela posição de ordem
        const sortedConfigs = [...startConfigs].sort((a, b) => a.orderPosition - b.orderPosition);

        sortedConfigs.forEach(config => {
            const category = categories.find(c => c.id === config.categoryId);
            if (!category) return;

            let categoryRegs = registrations.filter(
                r => r.categoryId === category.id && r.status !== 'cancelled'
            );

            // Se há registrationOrder salvo, usar essa ordem
            if (config.registrationOrder) {
                try {
                    const savedOrder = typeof config.registrationOrder === 'string'
                        ? JSON.parse(config.registrationOrder)
                        : config.registrationOrder;

                    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
                        // Criar um mapa para busca rápida
                        const regMap = new Map(registrations.map(r => [r.id, r]));
                        const orderedRegs = savedOrder
                            .map((regId: number) => regMap.get(regId))
                            .filter((r): r is typeof registrations[0] => r !== undefined && r.status !== 'cancelled');

                        // Adicionar novos inscritos que não estavam na ordem salva
                        const savedOrderSet = new Set(savedOrder);
                        const newRegs = categoryRegs.filter(r => !savedOrderSet.has(r.id));

                        categoryRegs = [...orderedRegs, ...newRegs];
                    }
                } catch (e) {
                    console.warn('Failed to parse registrationOrder:', e);
                }
            }

            categoryRegs.forEach((reg, index) => {
                let displayName = category.name;
                if (category.parentId) {
                    const parentCategory = categories.find(c => c.id === category.parentId);
                    if (parentCategory) {
                        displayName = `${parentCategory.name} - ${category.name}`;
                    }
                }

                items.push({
                    registrationId: reg.id,
                    pilotName: reg.pilotName,
                    navigatorName: reg.navigatorName || undefined,
                    categoryId: category.id,
                    categoryName: displayName,
                    number: config.numberStart + index,
                    startTime: calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds),
                });
            });
        });

        return items;
    };

    // Inicializar lista quando dados chegam
    useEffect(() => {
        if (!isInitialized && registrations && categories && startConfigs) {
            const items = buildSortedList();
            setSortedItems(items);
            setIsInitialized(true);
        }
    }, [registrations, categories, startConfigs, isInitialized]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = sortedItems.findIndex(item => item.registrationId === active.id);
        const newIndex = sortedItems.findIndex(item => item.registrationId === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newItems = arrayMove(sortedItems, oldIndex, newIndex);

            // Manter as categorias originais mas atualizar os números e horários baseados na nova ordem global (ou por categoria)
            // Aqui o sistema original recalcula por categoria, o que faz sentido

            const grouped = new Map<number, SortedItem[]>();
            newItems.forEach(item => {
                if (!grouped.has(item.categoryId)) {
                    grouped.set(item.categoryId, []);
                }
                grouped.get(item.categoryId)!.push(item);
            });

            const recalculated: SortedItem[] = [];
            grouped.forEach((items, categoryId) => {
                const config = startConfigs?.find(c => c.categoryId === categoryId);
                if (config) {
                    items.forEach((item, index) => {
                        recalculated.push({
                            ...item,
                            number: config.numberStart + index,
                            startTime: calculateStartTime(config.startTime, index, config.intervalSeconds),
                        });
                    });
                } else {
                    // Fallback se não achar config (não deveria acontecer)
                    recalculated.push(...items);
                }
            });

            setSortedItems(recalculated);
        }
    };

    const handleEdit = (registrationId: number, field: string, value: any) => {
        if (field === "edit") {
            setEditingId(editingId === registrationId ? null : registrationId);
        } else if (field === "number") {
            setSortedItems(
                sortedItems.map(item =>
                    item.registrationId === registrationId ? { ...item, number: value } : item
                )
            );
            setEditingId(null);
        } else if (field === "time") {
            setSortedItems(
                sortedItems.map(item =>
                    item.registrationId === registrationId ? { ...item, startTime: value } : item
                )
            );
            setEditingId(null);
        }
    };

    const handleSave = async () => {
        setEditingId(null);
        const uniqueCategories = Array.from(new Set(sortedItems.map(item => item.categoryId)));

        try {
            const promises = uniqueCategories.map((categoryId) => {
                const categoryItems = sortedItems.filter(item => item.categoryId === categoryId);
                const registrationIds = categoryItems.map(item => item.registrationId);
                const firstItem = categoryItems[0];
                const originalConfig = startConfigs?.find(c => c.categoryId === categoryId);

                return upsertMutation.mutateAsync({
                    eventId: Number(eventId),
                    categoryId,
                    orderPosition: originalConfig?.orderPosition || 1,
                    numberStart: originalConfig?.numberStart || firstItem.number,
                    numberEnd: originalConfig?.numberEnd || (firstItem.number + (categoryItems.length - 1)),
                    startTime: firstItem.startTime,
                    intervalSeconds: originalConfig?.intervalSeconds || 60,
                    timeBetweenCategories: originalConfig?.timeBetweenCategories || 0,
                    registrationOrder: registrationIds,
                });
            });

            await Promise.all(promises);
            toast.success("Ordem de largada salva com sucesso!");
            utils.startOrder.getByEvent.invalidate({ eventId: Number(eventId) });
        } catch (error) {
            toast.error("Erro ao salvar ordem de largada");
            console.error(error);
        }
    };

    const handleSortear = () => {
        // Agrupar por categoria
        const grouped = new Map<number, SortedItem[]>();
        sortedItems.forEach(item => {
            if (!grouped.has(item.categoryId)) {
                grouped.set(item.categoryId, []);
            }
            grouped.get(item.categoryId)!.push(item);
        });

        const shuffled: SortedItem[] = [];
        grouped.forEach((items, categoryId) => {
            const shuffledItems = [...items].sort(() => Math.random() - 0.5);
            const config = startConfigs?.find(c => c.categoryId === categoryId);

            shuffledItems.forEach((item, index) => {
                if (config) {
                    shuffled.push({
                        ...item,
                        number: config.numberStart + index,
                        startTime: calculateStartTime(config.startTime, index, config.intervalSeconds),
                    });
                } else {
                    shuffled.push(item);
                }
            });
        });

        setSortedItems(shuffled);
        toast.info("Lista sorteada! Não esqueça de salvar.");
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setEventLogo(base64String);
                localStorage.setItem('evento_logo_temporaria', base64String);
                toast.success("Logo do evento carregada!");
            };
            reader.readAsDataURL(file);
        }
    };

    const generateCommonHeader = (doc: jsPDF, title: string, subtitle: string, amigoLogo: string) => {
        const pageWidth = doc.internal.pageSize.getWidth();

        // 1. Lado Esquerdo: Logo do Evento
        if (eventLogo) {
            try {
                doc.addImage(eventLogo, 'PNG', 14, 10, 30, 0, undefined, 'FAST');
            } catch (e) {
                console.warn("Erro ao adicionar logo do evento ao PDF", e);
            }
        } else {
            doc.setDrawColor(200);
            doc.setLineDashPattern([2, 1], 0);
            doc.rect(14, 10, 30, 30);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text("Logo Evento", 29, 25, { align: "center" });
            doc.setLineDashPattern([], 0);
        }

        // 2. Lado Direito: Logo Amigo Racing
        const rightLogoX = pageWidth - 44;
        if (amigoLogo) {
            try {
                doc.addImage(amigoLogo, 'PNG', rightLogoX, 10, 30, 0, undefined, 'FAST');
            } catch (e) {
                console.warn("Erro ao adicionar logo Amigo Racing ao PDF", e);
            }
        }

        // 3. Centro: Nome do Evento e Subtítulo
        doc.setTextColor(31, 41, 55);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        const titleY = 28;
        doc.text(title, pageWidth / 2, titleY, { align: "center", maxWidth: pageWidth - 100 });

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(subtitle, pageWidth / 2, titleY + 8, { align: "center" });

        doc.setDrawColor(229, 231, 235);
        doc.line(14, 50, pageWidth - 14, 50);
    };

    const processBlobDownload = (data: any, defaultFilename: string) => {
        try {
            const binaryString = atob(data.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", data.filename || defaultFilename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            toast.error("Erro ao processar arquivo para download");
        }
    };

    const handleExportHorarioLargada = async () => {
        if (!event || sortedItems.length === 0) {
            toast.error("Dados insuficientes para gerar o PDF");
            return;
        }

        try {
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
                console.warn("Could not load official logo", e);
            }

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            generateCommonHeader(doc, event.name, "Horários de Largada Oficiais", amigoLogoBase64);

            const categoriesMap = new Map<string, SortedItem[]>();
            sortedItems.forEach(item => {
                const list = categoriesMap.get(item.categoryName) || [];
                list.push(item);
                categoriesMap.set(item.categoryName, list);
            });

            let currentY = 60;

            categoriesMap.forEach((items, categoryName) => {
                if (currentY > 240) {
                    doc.addPage();
                    currentY = 20;
                }

                doc.setFillColor(249, 115, 22, 0.1);
                doc.rect(14, currentY - 5, pageWidth - 28, 8, 'F');
                doc.setTextColor(234, 88, 12);
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(categoryName, 17, currentY);
                currentY += 5;

                const tableBody = items.map(item => [
                    `# ${item.number}`,
                    item.navigatorName ? `${item.pilotName} \n/ ${item.navigatorName}` : item.pilotName,
                    item.startTime
                ]);

                autoTable(doc, {
                    startY: currentY,
                    head: [['#', 'Competidor', 'Horário']],
                    body: tableBody,
                    theme: 'striped',
                    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                        1: { cellWidth: 'auto' },
                        2: { cellWidth: 35, halign: 'center', fontStyle: 'bold' }
                    },
                    styles: { fontSize: 10, cellPadding: 4, valign: 'middle' },
                    margin: { left: 14, right: 14 },
                    didDrawPage: (data) => {
                        doc.setFontSize(8);
                        doc.setTextColor(156, 163, 175);
                        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} - Amigo Racing Platform`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
                    }
                });

                currentY = (doc as any).lastAutoTable.finalY + 15;
            });

            doc.save(`horarios_largada_${event.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
            toast.success("PDF gerado com sucesso!");
        } catch (error) {
            toast.error("Erro ao gerar arquivo PDF");
        }
    };

    const handleExportListaEvento = async () => {
        if (!event || sortedItems.length === 0) {
            toast.error("Dados insuficientes para gerar o PDF");
            return;
        }

        try {
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
                console.warn("Could not load official logo", e);
            }

            const doc = new jsPDF({ orientation: 'landscape' });
            const pageWidth = doc.internal.pageSize.getWidth();
            generateCommonHeader(doc, event.name, "Lista de Participantes - Oficial", amigoLogoBase64);

            const categoriesMap = new Map<string, SortedItem[]>();
            sortedItems.forEach(item => {
                const list = categoriesMap.get(item.categoryName) || [];
                list.push(item);
                categoriesMap.set(item.categoryName, list);
            });

            let currentY = 60;

            categoriesMap.forEach((items, categoryName) => {
                if (currentY > 165) {
                    doc.addPage();
                    currentY = 20;
                }

                doc.setFillColor(249, 115, 22, 0.1);
                doc.rect(14, currentY - 5, pageWidth - 28, 8, 'F');
                doc.setTextColor(234, 88, 12);
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(categoryName, 17, currentY);
                currentY += 5;

                const tableBody = items.map(item => {
                    const reg = registrations?.find(r => r.id === item.registrationId);
                    return [
                        `# ${item.number}`,
                        reg?.pilotName || item.pilotName,
                        (reg as any)?.pilotCpf || '-',
                        (reg as any)?.pilotShirtSize || '-',
                        reg?.navigatorName || item.navigatorName || '-',
                        (reg as any)?.navigatorCpf || '-',
                        (reg as any)?.navigatorShirtSize || '-',
                        (reg as any)?.teamName || '-',
                        reg?.status === 'paid' ? 'Confirmado' : reg?.status === 'pending' ? 'Pendente' : reg?.status || '-'
                    ];
                });

                autoTable(doc, {
                    startY: currentY,
                    head: [['Nº', 'Piloto', 'CPF Piloto', 'Camis.', 'Navegador', 'CPF Nav.', 'Camis.', 'Equipe', 'Status']],
                    body: tableBody,
                    theme: 'striped',
                    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { cellWidth: 12, halign: 'center' },
                        1: { cellWidth: 40 },
                        2: { cellWidth: 30 },
                        3: { cellWidth: 15, halign: 'center' },
                        4: { cellWidth: 40 },
                        5: { cellWidth: 30 },
                        6: { cellWidth: 15, halign: 'center' },
                        7: { cellWidth: 'auto' },
                        8: { cellWidth: 25, halign: 'center' }
                    },
                    styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
                    margin: { left: 14, right: 14 },
                    didDrawPage: (data) => {
                        doc.setFontSize(8);
                        doc.setTextColor(156, 163, 175);
                        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} - Amigo Racing Platform`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
                    }
                });

                currentY = (doc as any).lastAutoTable.finalY + 15;
            });

            doc.save(`lista_evento_${event.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
            toast.success("PDF gerado com sucesso!");
        } catch (error) {
            toast.error("Erro ao gerar arquivo PDF");
        }
    };

    const handleExportKraken = async () => {
        try {
            const data = await exportKrakenMutation.mutateAsync({ eventId: Number(eventId) });
            processBlobDownload(data, "kraken.xlsx");
            toast.success("Arquivo Kraken exportado!");
        } catch (error) {
            toast.error("Erro ao exportar Kraken");
        }
    };

    const categoriesInOrder = Array.from(
        new Map(
            sortedItems.map(item => [
                item.categoryId,
                {
                    id: item.categoryId,
                    name: item.categoryName,
                    items: sortedItems.filter(i => i.categoryId === item.categoryId)
                },
            ])
        ).values()
    );

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation(`/organizer/events/${eventId}/start-order`)}
                                className="h-8 w-8"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                                Gestão da Cascata
                            </h1>
                        </div>
                        <p className="text-muted-foreground">
                            {event?.name} • Arraste para reordenar o grid de largada
                        </p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <Button
                            onClick={handleSave}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold"
                            disabled={upsertMutation.isPending}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Salvar Ordem
                        </Button>
                        <Button
                            onClick={handleSortear}
                            variant="outline"
                            className="border-orange-500 text-orange-600 hover:bg-orange-50 font-bold"
                            disabled={upsertMutation.isPending}
                        >
                            🎲 Sortear
                        </Button>
                    </div>
                </div>

                {/* Toolbar de Exportação */}
                <Card className="mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 border-dashed">
                    <div className="flex flex-col md:flex-row gap-6 md:items-center">
                        <div className="flex flex-wrap gap-3 items-center flex-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">Exportar:</span>
                            <Button
                                onClick={handleExportHorarioLargada}
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                disabled={exportHorarioLargadaMutation.isPending}
                            >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Horário de Largada
                            </Button>
                            <Button
                                onClick={handleExportListaEvento}
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                disabled={exportListaEventoMutation.isPending}
                            >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Lista Evento
                            </Button>
                            <Button
                                onClick={handleExportKraken}
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                disabled={exportKrakenMutation.isPending}
                            >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Kraken
                            </Button>
                        </div>

                        {/* Logo do Organizador */}
                        <div className="flex items-center gap-4 border-l border-slate-200 dark:border-slate-800 pl-6 h-10">
                            <div className="relative group">
                                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors cursor-pointer text-sm font-semibold">
                                    <Upload className="w-4 h-4" />
                                    {eventLogo ? "Mudar Logo" : "Logo do Organizador"}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoChange}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                            {eventLogo && (
                                <div className="h-10 w-10 rounded border border-slate-200 dark:border-slate-800 p-0.5 bg-white overflow-hidden flex items-center justify-center shadow-sm">
                                    <img src={eventLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Lista de Pilotos por Categoria com Visual de Cascata */}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <div className="space-y-12 pb-20">
                        {categoriesInOrder.map(({ id, name, items }) => (
                            <div key={id} className="relative">
                                <div className="sticky top-4 z-20 mb-6">
                                    <div className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg font-bold text-sm uppercase tracking-widest">
                                        {name}
                                    </div>
                                </div>

                                <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800 -z-10" />

                                <SortableContext
                                    items={items.map(i => i.registrationId)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-4 px-2">
                                        {items.map((item, idx) => (
                                            <SortablePilotItem
                                                key={item.registrationId}
                                                item={item}
                                                categoryId={id}
                                                onEdit={handleEdit}
                                                isEditing={editingId !== null}
                                                editingId={editingId}
                                                index={idx}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>

                                {items.length === 0 && (
                                    <p className="text-center py-8 text-muted-foreground italic bg-slate-50 rounded-lg border border-dashed">
                                        Nenhum inscrito nesta categoria.
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </DndContext>
            </div>
        </div>
    );
}
