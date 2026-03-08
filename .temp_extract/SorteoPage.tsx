import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Save, Download, GripVertical } from "lucide-react";
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
      className={`flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 ${
        isDragging ? "shadow-lg" : ""
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-slate-900">
            {item.pilotName}
            {item.navigatorName && (
              <span className="text-slate-600"> / {item.navigatorName}</span>
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
            className="font-mono font-bold text-orange-600 cursor-pointer hover:bg-orange-50 px-2 py-1 rounded"
          >
            #{item.number}
          </span>
        )}

        {isEditing && editingId === item.registrationId ? (
          <input
            type="time"
            defaultValue={item.startTime}
            onChange={(e) => onEdit(item.registrationId, "time", e.target.value)}
            className="px-2 py-1 border border-slate-300 rounded font-mono"
          />
        ) : (
          <span className="font-mono text-slate-600">{item.startTime}</span>
        )}
      </div>
    </div>
  );
}

export function SorteoPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [sortedItems, setSortedItems] = useState<SortedItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: event } = trpc.events.getById.useQuery(
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
    const [hours, minutes] = baseTime.split(":").map(Number);
    const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
    const newHours = Math.floor(totalSeconds / 3600) % 24;
    const newMinutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
  };

  const buildSortedList = () => {
    if (!registrations || !categories || !startConfigs) return [];

    const items: SortedItem[] = [];

    categories.forEach(category => {
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
    const uniqueCategories = new Set(sortedItems.map(item => item.categoryId));
    const mutations: Promise<any>[] = [];

    uniqueCategories.forEach((categoryId) => {
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
              timeBetweenCategories: originalConfig?.timeBetweenCategories || 0,
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

  const handleExportHorarioLargada = () => {
    exportHorarioLargadaMutation.mutate(
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
            toast.success("Horário de Largada exportado!");
          } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            toast.error("Erro ao processar arquivo");
          }
        },
        onError: () => {
          toast.error("Erro ao exportar Horário de Largada");
        },
      }
    );
  };

  const handleExportListaEvento = () => {
    exportListaEventoMutation.mutate(
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
            toast.success("Lista do Evento exportada!");
          } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            toast.error("Erro ao processar arquivo");
          }
        },
        onError: () => {
          toast.error("Erro ao exportar Lista do Evento");
        },
      }
    );
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
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
          <p className="text-slate-600">
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
                <h2 className="text-xl font-bold text-slate-900 mb-4">{name}</h2>
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
