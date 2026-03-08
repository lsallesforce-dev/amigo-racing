import { useParams, useLocation } from "wouter";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Save, Download, GripVertical, ArrowLeft, Image as ImageIcon, Upload } from "lucide-react";
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

const urlToDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

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
function SortablePilotItem({ item, categoryId, onEdit, isEditing, editingId }: any) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-card rounded-lg border border-border ${isDragging ? "shadow-lg" : ""
        }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-foreground">
            {item.pilotName}
            {item.navigatorName && (
              <span className="text-muted-foreground"> / {item.navigatorName}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {isEditing && editingId === item.registrationId ? (
          <input
            type="number"
            defaultValue={item.number}
            onChange={(e) => onEdit(item.registrationId, "number", parseInt(e.target.value))}
            className="w-16 px-2 py-1 border border-orange-300 rounded font-mono font-bold text-orange-600"
            autoFocus
          />
        ) : (
          <span
            onClick={() => onEdit(item.registrationId, "edit", null)}
            className="font-mono font-bold text-orange-600 cursor-pointer hover:bg-orange-500/10 px-2 py-1 rounded"
          >
            #{item.number}
          </span>
        )}

        {isEditing && editingId === item.registrationId ? (
          <input
            type="time"
            defaultValue={item.startTime}
            onChange={(e) => onEdit(item.registrationId, "time", e.target.value)}
            className="px-2 py-1 border border-input bg-background rounded font-mono"
          />
        ) : (
          <span className="font-mono text-muted-foreground">{item.startTime}</span>
        )}
      </div>
    </div>
  );
}

export default function StartOrderManager() {
  const { id } = useParams<{ id: string }>();
  const eventId = id;
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

    // Filter subcategories and sort by config orderPosition
    const sortedSubcategories = categories
      .filter(cat => !!cat.parentId)
      .sort((a, b) => {
        const configA = startConfigs.find(c => c.categoryId === a.id);
        const configB = startConfigs.find(c => c.categoryId === b.id);
        return (configA?.orderPosition || 0) - (configB?.orderPosition || 0);
      });

    sortedSubcategories.forEach(category => {
      const config = startConfigs.find(c => c.categoryId === category.id) as StartConfig | undefined;
      if (!config) return;

      let categoryRegs = registrations.filter(
        r => r.categoryId === category.id
      );

      // Se há registrationOrder salvo, usar essa ordem
      if (config.registrationOrder) {
        try {
          const savedOrder = typeof config.registrationOrder === 'string'
            ? JSON.parse(config.registrationOrder)
            : config.registrationOrder;

          if (Array.isArray(savedOrder) && savedOrder.length > 0) {
            categoryRegs = savedOrder
              .map((regId: number) => registrations.find(r => r.id === regId))
              .filter((r): r is typeof registrations[0] => r !== undefined);

            // Add any registrations that are in the category but not in the saved order
            const missingFromOrder = registrations.filter(
              r => r.categoryId === category.id && !savedOrder.includes(r.id)
            );
            categoryRegs = [...categoryRegs, ...missingFromOrder];
          }
        } catch (e) {
          console.warn('Failed to parse registrationOrder:', e);
        }
      }

      categoryRegs.forEach((reg, index) => {
        // Obter nome da categoria pai se existir
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
          navigatorName: (reg as any).navigatorName || undefined,
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

      // Recalcular números e horários por categoria
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
    } else if (field === "time") {
      setSortedItems(
        sortedItems.map(item =>
          item.registrationId === registrationId ? { ...item, startTime: value } : item
        )
      );
    }
  };

  const saveSortedOrder = () => {
    const uniqueCategoriesList = Array.from(new Set(sortedItems.map(item => item.categoryId)));
    const mutations: Promise<any>[] = [];

    uniqueCategoriesList.forEach((categoryId) => {
      const categoryItems = sortedItems.filter(item => item.categoryId === categoryId);
      if (categoryItems.length > 0) {
        const registrationIds = categoryItems.map(item => item.registrationId);
        const firstItem = categoryItems[0];

        const originalConfig = startConfigs?.find(c => c.categoryId === categoryId);
        const mutationPromise = new Promise((resolve, reject) => {
          upsertMutation.mutate(
            {
              eventId: Number(eventId),
              categoryId,
              orderPosition: originalConfig?.orderPosition || 1,
              numberStart: originalConfig?.numberStart || firstItem.number,
              numberEnd: originalConfig?.numberEnd || (firstItem.number + (categoryItems.length - 1)),
              startTime: firstItem.startTime,
              intervalSeconds: originalConfig?.intervalSeconds || 60,
              timeBetweenCategories: (originalConfig as any)?.timeBetweenCategories || 0,
              registrationOrder: registrationIds.length > 0 ? registrationIds : undefined,
            },
            {
              onSuccess: () => resolve(true),
              onError: () => reject(new Error("Erro ao salvar")),
            }
          );
        });
        mutations.push(mutationPromise);
      }
    });

    return mutations;
  };

  const handleSave = () => {
    setEditingId(null);
    const mutations = saveSortedOrder();
    Promise.all(mutations)
      .then(() => {
        toast.success("Ordem salva com sucesso!");
      })
      .catch(() => {
        toast.error("Erro ao salvar ordem");
      });
  };

  const handleSortear = () => {
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
      shuffledItems.forEach((item, index) => {
        const config = startConfigs?.find(c => c.categoryId === categoryId);
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

    const mutations = saveSortedOrder();

    Promise.all(mutations)
      .then(() => {
        toast.success("Ordem de sorteio salva com sucesso!");
      })
      .catch(() => {
        toast.error("Erro ao salvar ordem de sorteio");
      });
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
      // Placeholder se não houver logo
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

    // Linha separadora
    doc.setDrawColor(229, 231, 235);
    doc.line(14, 50, pageWidth - 14, 50);
  };

  const handleExportHorarioLargada = async () => {
    if (!event || sortedItems.length === 0) {
      toast.error("Dados insuficientes para gerar o PDF");
      return;
    }

    try {
      // Carregar a logo oficial dinamicamente
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
        console.warn("Não foi possível carregar a logo oficial para o PDF", e);
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      generateCommonHeader(
        doc,
        event.name,
        "Horários de Largada Oficiais",
        amigoLogoBase64
      );

      // --- Corpo: Tabela ---
      // Agrupar itens por categoria
      const categoriesMap = new Map<string, SortedItem[]>();
      sortedItems.forEach(item => {
        if (!categoriesMap.has(item.categoryName)) {
          categoriesMap.set(item.categoryName, []);
        }
        categoriesMap.get(item.categoryName)!.push(item);
      });

      let currentY = 60;

      categoriesMap.forEach((items, categoryName) => {
        // Verificar se precisa de nova página
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }

        // Título da Categoria
        doc.setFillColor(249, 115, 22, 0.1); // Laranja clarinho de fundo
        doc.rect(14, currentY - 5, pageWidth - 28, 8, 'F');
        doc.setTextColor(234, 88, 12); // Laranja escuro
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
          headStyles: {
            fillColor: [31, 41, 55],
            textColor: [255, 255, 255],
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 35, halign: 'center', fontStyle: 'bold' }
          },
          styles: {
            fontSize: 10,
            cellPadding: 4,
            valign: 'middle'
          },
          margin: { left: 14, right: 14 },
          didDrawPage: (data) => {
            // Rodapé em cada página
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.text(
              `Gerado em ${new Date().toLocaleString('pt-BR')} - Amigo Racing Platform`,
              data.settings.margin.left,
              doc.internal.pageSize.getHeight() - 10
            );
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
      toast.info("Gerando PDF da Lista de Evento...");

      // Carregar a logo oficial dinamicamente
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

      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();

      generateCommonHeader(
        doc,
        event.name,
        "Lista de Participantes - Oficial",
        amigoLogoBase64
      );

      // Agrupar itens por categoria
      const categoriesMap = new Map<string, SortedItem[]>();
      sortedItems.forEach(item => {
        if (!categoriesMap.has(item.categoryName)) {
          categoriesMap.set(item.categoryName, []);
        }
        categoriesMap.get(item.categoryName)!.push(item);
      });

      let currentY = 60;

      categoriesMap.forEach((items, categoryName) => {
        if (currentY > 165) { // Check for landscape limit
          doc.addPage();
          currentY = 20;
        }

        // Título da Categoria
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
          headStyles: {
            fillColor: [31, 41, 55],
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center'
          },
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
          styles: {
            fontSize: 8,
            cellPadding: 3,
            valign: 'middle'
          },
          margin: { left: 14, right: 14 },
          didDrawPage: (data) => {
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.text(
              `Gerado em ${new Date().toLocaleString('pt-BR')} - Amigo Racing Platform`,
              data.settings.margin.left,
              doc.internal.pageSize.getHeight() - 10
            );
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      });

      doc.save(`lista_evento_${event.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
      toast.success("PDF da Lista de Evento gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF da Lista de Evento");
    }
  };

  const handleExportKraken = () => {
    exportKrakenMutation.mutate(
      { eventId: Number(eventId) },
      {
        onSuccess: (data: any) => {
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
            link.setAttribute("download", data.filename);
            try {
              document.body.appendChild(link);
              link.click();
              if (link.parentNode) {
                link.parentNode.removeChild(link);
              }
            } finally {
              window.URL.revokeObjectURL(url);
            }
            toast.success("Arquivo Kraken exportado!");
          } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            toast.error("Erro ao processar arquivo");
          }
        },
        onError: () => {
          toast.error("Erro ao exportar Kraken");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation(`/organizer/events/${eventId}/start-order`)}
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
              Ordem de Largada
            </h1>
            <Button
              variant="outline"
              onClick={() => {
                // Invalidar cache antes de voltar
                utils.startOrder.getByEvent.invalidate({ eventId: Number(eventId) });
                setLocation(`/organizer/events/${eventId}/start-order`);
              }}
            >
              Voltar
            </Button>
          </div>
          <p className="text-muted-foreground ml-14">
            {event?.name} - Arraste para reordenar ou clique no número para editar
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="mb-8 flex gap-2 flex-wrap">
          <Button
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-700"
            disabled={upsertMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar Ordem
          </Button>
          <Button
            onClick={handleSortear}
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={upsertMutation.isPending}
          >
            🎲 Sortear
          </Button>
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="event-logo-upload"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('event-logo-upload')?.click()}
              className={eventLogo ? "border-green-500 text-green-600" : ""}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Logo Evento
            </Button>
          </div>
          <Button
            onClick={handleExportHorarioLargada}
            variant="outline"
            size="sm"
            disabled={exportHorarioLargadaMutation.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            Horário de Largada
          </Button>
          <Button
            onClick={handleExportListaEvento}
            variant="outline"
            size="sm"
            disabled={exportListaEventoMutation.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            Lista Evento
          </Button>
          <Button
            onClick={handleExportKraken}
            variant="outline"
            size="sm"
            disabled={exportKrakenMutation.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar Kraken
          </Button>
        </div>

        {/* Lista de Pilotos por Categoria */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-6">
            {Array.from(
              new Map(
                sortedItems.map(item => [
                  item.categoryId,
                  { name: item.categoryName, items: sortedItems.filter(i => i.categoryId === item.categoryId) },
                ])
              ).values()
            ).map(({ name, items }) => (
              <Card key={name} className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">{name}</h2>
                <SortableContext
                  items={items.map(i => i.registrationId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {items.map((item) => (
                      <SortablePilotItem
                        key={item.registrationId}
                        item={item}
                        categoryId={item.categoryId}
                        onEdit={handleEdit}
                        isEditing={editingId !== null}
                        editingId={editingId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </Card>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}
LineContent:
LineNumber:
MatchPerLine: false
Query:
SearchPath:
waitForPreviousTools: true
