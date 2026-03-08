import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ArrowLeft, Save, Trash2, Download, Wand2, Edit3, Users, Clock, SkipForward } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { SortableStartList } from "@/components/SortableStartList";
import { trpc } from "@/lib/trpc";

const hideNumberArrows = `
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type=number] {
    -moz-appearance: textfield;
  }
`;

const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
  if (!baseTime) return "08:00";
  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
  const newHours = Math.floor(totalSeconds / 3600) % 24;
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

export default function StartOrderConfig() {
  console.log('[StartOrderConfig] Component rendered');
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0");
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  // Queries
  const { data: event } = trpc.events.get.useQuery({ id: eventId });
  const { data: categories = [] } = trpc.categories.listByEvent.useQuery({ eventId });
  const { data: stats = { byCategory: [] } } = trpc.registrations.getStatistics.useQuery({ eventId });
  const { data: startOrderConfigs = [], isLoading: isLoadingConfigs } = trpc.startOrder.getByEvent.useQuery({ eventId });
  const { data: registrations = [] } = trpc.registrations.listByEvent.useQuery({ eventId });

  // Mutations
  const upsertMutation = trpc.startOrder.upsert.useMutation();
  const upsertBatchMutation = trpc.startOrder.upsertBatch.useMutation();

  // Mutations for Export (triggered manually)
  const exportMutation = trpc.startOrder.exportStartList.useMutation();
  const exportKrakenMutation = trpc.startOrder.exportKraken.useMutation();
  const exportEventListMutation = trpc.startOrder.exportEventList.useMutation();



  // State: configs keyed by categoryId
  const [configs, setConfigs] = useState<Record<number, {
    orderPosition: number;
    numberStart: number;
    numberEnd: number;
    startTime: string;
    intervalSeconds: number;
    timeBetweenCategories?: number;
    registrationOrder?: string | number[] | null;
  }>>({});

  // Refs para controlar inputs de número sem interferência do React
  const numberEndRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const intervalSecondsRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // State para modal de sorting
  const [showSortingModal, setShowSortingModal] = useState(false);
  const [sortedRegistrations, setSortedRegistrations] = useState<any[]>([]);

  const hasInitialized = useRef(false);

  // Initialize configs from database OR create defaults
  useEffect(() => {
    console.log('[StartOrderConfig] useEffect triggered', {
      categoriesLength: categories.length,
      statsLoading: !stats?.byCategory,
      isLoadingConfigs,
      hasInitialized: hasInitialized.current
    });

    // Only initialize if categories and config are loaded
    if (categories.length > 0 && !isLoadingConfigs && !hasInitialized.current) {
      const newConfigs: typeof configs = {};
      let currentNumber = 1;
      let currentTimeMinutes = timeToMinutes("08:00");

      // Filtrar apenas subcategorias (parentId !== null)
      const subcategories = categories.filter(category => !!category.parentId);

      // Ordenar subcategorias pela posição salva ou pelo ID
      const sortedSubcats = [...subcategories].sort((a, b) => {
        const configA = startOrderConfigs.find(c => c.categoryId === a.id);
        const configB = startOrderConfigs.find(c => c.categoryId === b.id);
        const posA = configA?.orderPosition || 999;
        const posB = configB?.orderPosition || 999;
        return posA !== posB ? posA - posB : a.id - b.id;
      });

      sortedSubcats.forEach((category, idx) => {
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
        const registrationCount = Number(catStat?.totalRegistrations || 0);

        // Popular configs para todas as subcategorias
        const existingConfig = startOrderConfigs.find(c => c.categoryId === category.id);

        // Se for a primeira categoria e tiver horário salvo, usar como base
        if (idx === 0 && existingConfig?.startTime) {
          currentTimeMinutes = timeToMinutes(existingConfig.startTime);
        }

        const effectiveNumberStart = existingConfig?.numberStart || currentNumber;
        const effectiveInterval = existingConfig?.intervalSeconds || 60;
        const timeBetween = Number((existingConfig as any)?.timeBetweenCategories || 0);

        const isManualEnd = existingConfig && existingConfig.numberEnd !== (existingConfig.numberStart + registrationCount - 1);
        const numberEnd = isManualEnd ? existingConfig.numberEnd : (effectiveNumberStart + Math.max(registrationCount, 1) - 1);

        newConfigs[category.id] = {
          orderPosition: existingConfig?.orderPosition || (idx + 1),
          numberStart: effectiveNumberStart,
          numberEnd: numberEnd,
          startTime: minutesToTime(currentTimeMinutes),
          intervalSeconds: effectiveInterval,
          timeBetweenCategories: timeBetween,
        };

        const numPilotosForTime = Math.max(numberEnd - effectiveNumberStart + 1, 1);
        const totalDurationSegs = (numPilotosForTime - 1) * effectiveInterval;
        const totalDurationMins = Math.ceil(Math.max(0, totalDurationSegs) / 60);

        currentTimeMinutes += totalDurationMins + timeBetween;
        currentNumber = numberEnd + 1;
      });

      setConfigs(newConfigs);
      hasInitialized.current = true;
    }
  }, [categories, stats, startOrderConfigs]);

  // Função para converter tempo HH:MM para minutos
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Função para converter minutos para HH:MM
  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  // Centralized Cascade Logic
  const recalculateCascade = (currentConfigs: typeof configs, startingFromId?: number) => {
    const updated = { ...currentConfigs };

    // Sort subcategories by orderPosition
    const subcats = categories
      .filter(cat => !!cat.parentId)
      .sort((a, b) => {
        const posA = updated[a.id]?.orderPosition || 999;
        const posB = updated[b.id]?.orderPosition || 999;
        return posA - posB;
      });

    const startIdx = startingFromId
      ? subcats.findIndex(c => c.id === startingFromId)
      : 0;

    if (startIdx === -1) return updated;

    for (let i = startIdx; i < subcats.length; i++) {
      const cat = subcats[i];
      const cfg = updated[cat.id];
      if (!cfg) continue;

      const catStat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
      const regCount = Number(catStat?.totalRegistrations || 0);
      const count = Math.max(regCount, 1);

      if (i > 0) {
        const prevCfg = updated[subcats[i - 1].id];
        cfg.numberStart = prevCfg.numberEnd + 1;

        if (i > startIdx) {
          // AUTOMATION: Subsequent categories always reset to pilot count
          cfg.numberEnd = cfg.numberStart + count - 1;
        }
      }

      // Default/Empty handling:
      // Fill if undefined (initial) OR if it's 0 AND we are not currently editing this specific field.
      if (cfg.numberEnd === undefined || (cfg.numberEnd === 0 && startingFromId !== cat.id)) {
        cfg.numberEnd = cfg.numberStart + count - 1;
      }

      // Timing...
      const numPilotos = Math.max(cfg.numberEnd - cfg.numberStart + 1, 1);
      const durationSegs = (numPilotos - 1) * cfg.intervalSeconds;
      const durationMins = Math.ceil(Math.max(0, durationSegs) / 60);

      const prevStartMins = i > 0 ? timeToMinutes(updated[subcats[i - 1].id].startTime) : 0;
      const prevNumP = i > 0 ? Math.max(updated[subcats[i - 1].id].numberEnd - updated[subcats[i - 1].id].numberStart + 1, 1) : 0;
      const prevDurS = i > 0 ? (prevNumP - 1) * updated[subcats[i - 1].id].intervalSeconds : 0;
      const prevDurM = i > 0 ? Math.ceil(Math.max(0, prevDurS) / 60) : 0;
      const prevGap = i > 0 ? Number(updated[subcats[i - 1].id].timeBetweenCategories || 0) : 0;

      if (i > 0) {
        cfg.startTime = minutesToTime(prevStartMins + prevDurM + prevGap);
      }
    }

    return updated;
  };

  // Função para mover categoria para cima
  const handleMoveUp = (categoryIndex: number) => {
    const subcategoriesWithRegistrations = categories.filter(category => {
      if (!category.parentId) return false;
      const catStat = stats?.byCategory?.find((s: any) => s.categoryId === category.id);
      const registrationCount = Number(catStat?.totalRegistrations || 0);
      return registrationCount > 0;
    });

    if (categoryIndex <= 0) return;

    setConfigs(prev => {
      const updated = { ...prev };
      const currentCat = subcategoriesWithRegistrations[categoryIndex];
      const prevCat = subcategoriesWithRegistrations[categoryIndex - 1];

      // Trocar os números e horários (apenas as posições)
      const currentPos = updated[currentCat.id].orderPosition;
      updated[currentCat.id].orderPosition = updated[prevCat.id].orderPosition;
      updated[prevCat.id].orderPosition = currentPos;

      // Recalcular cascata completa a partir do primeiro
      return recalculateCascade(updated);
    });
  };

  // Função para mover categoria para baixo
  const handleMoveDown = (categoryIndex: number) => {
    const subcategoriesWithRegistrations = categories.filter(category => {
      if (!category.parentId) return false;
      const catStat = stats?.byCategory?.find((s: any) => s.categoryId === category.id);
      const registrationCount = Number(catStat?.totalRegistrations || 0);
      return registrationCount > 0;
    });

    if (categoryIndex >= subcategoriesWithRegistrations.length - 1) return;

    setConfigs(prev => {
      const updated = { ...prev };
      const currentCat = subcategoriesWithRegistrations[categoryIndex];
      const nextCat = subcategoriesWithRegistrations[categoryIndex + 1];

      // Trocar os números e horários (apenas as posições)
      const currentPos = updated[currentCat.id].orderPosition;
      updated[currentCat.id].orderPosition = updated[nextCat.id].orderPosition;
      updated[nextCat.id].orderPosition = currentPos;

      // Recalcular cascata completa a partir do primeiro
      return recalculateCascade(updated);
    });
  };

  const handleSaveAll = async () => {
    try {
      // Filtrar apenas subcategorias
      const subcategoriesToSave = categories.filter(category => {
        return !!category.parentId && !!configs[category.id];
      });

      const configsToSave = subcategoriesToSave.map(category => {
        const config = configs[category.id];
        return {
          categoryId: category.id,
          orderPosition: config.orderPosition,
          numberStart: config.numberStart,
          numberEnd: config.numberEnd,
          startTime: config.startTime,
          intervalSeconds: config.intervalSeconds,
          timeBetweenCategories: config.timeBetweenCategories || 0,
        };
      }).filter(config => config.numberStart !== undefined && config.numberEnd !== undefined);

      await upsertBatchMutation.mutateAsync({ eventId, configs: configsToSave });
      await utils.startOrder.getByEvent.invalidate({ eventId });
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
      console.error(error);
    }
  };

  // Função para buscar botão Kraken (restaurar)
  const handleExportKraken = async () => {
    if (!eventId) {
      toast.error("Evento não encontrado");
      return;
    }

    try {
      toast.info("Gerando arquivo Kraken...");

      // Chamar endpoint do backend
      const result = await exportKrakenMutation.mutateAsync({ eventId });

      if (!result || !result.data) {
        throw new Error("Erro ao gerar arquivo");
      }

      // Converter base64 para blob
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Criar link de download
      const link = document.createElement('a');
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = result?.filename || "export-kraken.xlsx";
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }

      toast.success("Arquivo Kraken exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar Kraken:", error);
      toast.error("Erro ao exportar arquivo Kraken");
    }
  };



  const handleExportEventList = async () => {
    if (!eventId || !event || registrations.length === 0) {
      toast.error("Dados insuficientes para exportar");
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

      generateHeader(event.name, "Lista de Participantes - Oficial");

      // Buscar configs baseadas no estado local 'configs' que o usuario pode ter alterado
      const sortedItems: any[] = [];
      const subcategories = categories.filter(cat => !!cat.parentId);
      const sortedSubcats = [...subcategories].sort((a, b) => (configs[a.id]?.orderPosition || 0) - (configs[b.id]?.orderPosition || 0));

      sortedSubcats.forEach(category => {
        const config = configs[category.id];
        if (!config) return;

        let categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');

        if (config.registrationOrder) {
          try {
            const order = typeof config.registrationOrder === 'string' ? JSON.parse(config.registrationOrder) : config.registrationOrder;
            if (Array.isArray(order) && order.length > 0) {
              const orderMap = new Map(order.map((id, idx) => [id, idx]));
              categoryRegs.sort((a, b) => ((orderMap.get(a.id) ?? 999) as number) - ((orderMap.get(b.id) ?? 999) as number));
            }
          } catch (e) { }
        }

        categoryRegs.forEach((reg, index) => {
          const parent = categories.find(c => c.id === category.parentId);
          sortedItems.push({
            ...reg,
            categoryName: parent ? `${parent.name} - ${category.name}` : category.name,
            number: config.numberStart + index,
            startTime: calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds)
          });
        });
      });

      const categoriesMap = new Map<string, any[]>();
      sortedItems.forEach(item => {
        if (!categoriesMap.has(item.categoryName)) categoriesMap.set(item.categoryName, []);
        categoriesMap.get(item.categoryName)!.push(item);
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

        const formatExtras = (purchasedItems: any) => {
          if (!purchasedItems) return '-';
          try {
            const items = typeof purchasedItems === 'string' ? JSON.parse(purchasedItems) : purchasedItems;
            if (!Array.isArray(items) || items.length === 0) return '-';
            return items.map((p: any) => {
              if (p.sizes && Array.isArray(p.sizes) && p.sizes.length > 0) {
                return `${p.quantity}x ${p.name} (${p.sizes.filter(Boolean).join(', ')})`;
              }
              return `${p.quantity}x ${p.name}`;
            }).join(' | ');
          } catch (e) {
            return '-';
          }
        };

        const tableBody = items.map(reg => [
          `# ${reg.number}`,
          reg.pilotName,
          reg.pilotCpf || '-',
          reg.pilotShirtSize || '-',
          reg.navigatorName || '-',
          reg.navigatorCpf || '-',
          reg.navigatorShirtSize || '-',
          reg.team || '-',
          reg.status === 'paid' ? 'Confirmado' : 'Pendente',
          formatExtras(reg.purchasedProducts)
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Nº', 'Piloto', 'CPF Piloto', 'Camis.', 'Navegador', 'CPF Nav.', 'Camis.', 'Equipe', 'Status', 'Extras']],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', halign: 'center' },
          columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 35 }, 2: { cellWidth: 25 }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 35 }, 5: { cellWidth: 25 }, 6: { cellWidth: 12, halign: 'center' }, 7: { cellWidth: 25 }, 8: { cellWidth: 20, halign: 'center' }, 9: { cellWidth: 35 } },
          styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
          margin: { left: 14, right: 14 }
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

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({ eventId });

      if (!result || !result.data) {
        throw new Error("Erro ao gerar arquivo");
      }

      // Converter base64 para blob
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'lista-largada.xlsx';
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }

      toast.success("Lista de largada exportada!");
    } catch (error) {

      toast.error("Erro ao exportar lista de largada");
    }
  };

  const handleUpdateOrder = () => {
    setConfigs(prev => {
      const updated = { ...prev };

      const subcategories = categories.filter(cat => !!cat.parentId);
      const sortedCategories = [...subcategories]
        .filter(cat => updated[cat.id])
        .sort((a, b) => {
          const posA = updated[a.id]?.orderPosition || 999;
          const posB = updated[b.id]?.orderPosition || 999;
          return posA !== posB ? posA - posB : a.id - b.id;
        });

      if (sortedCategories.length === 0) return prev;

      let currentNumber = updated[sortedCategories[0].id].numberStart;
      let currentTimeMinutes = timeToMinutes(updated[sortedCategories[0].id].startTime);

      sortedCategories.forEach((cat, idx) => {
        const catStat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
        const registrationCount = Number(catStat?.totalRegistrations || 0);
        const config = updated[cat.id];

        // Usar a lógica que respeita o Número Final manual se ele for maior que a contagem
        const nStart = config.numberStart;
        const nEnd = config.numberEnd;
        const numPilotos = Math.max(nEnd - nStart + 1, registrationCount, 1);
        const numberStart = idx === 0 ? config.numberStart : currentNumber;
        const numberEnd = numberStart + numPilotos - 1;
        const startTime = idx === 0 ? config.startTime : minutesToTime(currentTimeMinutes);

        updated[cat.id] = {
          ...config,
          orderPosition: idx + 1,
          numberStart,
          numberEnd,
          startTime,
        };

        // Próximos valores
        currentNumber = numberEnd + 1;
        const totalDurationSegs = Math.max(0, (numPilotos - 1) * config.intervalSeconds);
        const totalDurationMins = Math.ceil(totalDurationSegs / 60);
        currentTimeMinutes += totalDurationMins + (config.timeBetweenCategories || 0);
      });

      return updated;
    });
    toast.success("Ordem e horários recalculados!");
  };

  // Função para calcular cascata de horários
  const calculateCascadeTime = (categoryIndex: number, filteredCategories: any[]): string => {
    if (categoryIndex === 0) {
      return configs[filteredCategories[0].id]?.startTime || '08:00';
    }

    const prevCategory = filteredCategories[categoryIndex - 1];
    const prevConfig = configs[prevCategory.id];

    if (!prevConfig) return '08:00';

    // Validar que os valores são números válidos
    const numberEnd = Number(prevConfig.numberEnd);
    const numberStart = Number(prevConfig.numberStart);
    const intervalSeconds = Number(prevConfig.intervalSeconds);

    // Se algum valor for NaN, retornar horário padrão
    if (isNaN(numberEnd) || isNaN(numberStart) || isNaN(intervalSeconds)) {
      return '08:00';
    }

    // Calcular tempo total da categoria anterior
    const numPilotos = numberEnd - numberStart + 1;
    const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * intervalSeconds);
    const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);

    // Somar ao horário anterior
    const prevTimeMinutes = timeToMinutes(prevConfig.startTime);
    const nextTimeMinutes = prevTimeMinutes + tempoTotalMinutos;

    return minutesToTime(nextTimeMinutes);
  };

  const getSubcategoriesWithRegistrations = (categories: any[], stats: any) => {
    return categories.filter(cat => {
      if (!cat.parentId) return false;
      const stat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
      return Number(stat?.totalRegistrations || 0) > 0;
    });
  };

  if (!event) {
    return <div className="p-4">Carregando...</div>;
  }

  // RENDERIZAR CATEGORIAS MESMO QUE VAZIO
  if (!categories || categories.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate('/organizer')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Configuração de Ordem de Largada</h1>
              <p className="text-muted-foreground">{event?.name}</p>
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Nenhuma categoria disponível para este evento.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getCategoryTitle = (category: any) => {
    if (category.parentId) {
      const parentCategory = categories?.find(c => c.id === category.parentId);
      return `${parentCategory?.name} - ${category.name}`;
    }
    return category.name;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <style>{hideNumberArrows}</style>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/organizer')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Configuração de Ordem de Largada</h1>
              <p className="text-muted-foreground">{event?.name}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <Button onClick={() => navigate(`/organizer/events/${eventId}/manage-start-order`)} className="bg-orange-500 hover:bg-orange-600">
            <Users className="w-4 h-4 mr-2" />
            Gerenciar Pilotos
          </Button>
          <Button onClick={handleExportEventList} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar Lista do Evento
          </Button>

          <Button onClick={() => navigate(`/organizer/events/${eventId}/sorteio`)} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
            <Wand2 className="w-4 h-4 mr-2" />
            Gerenciar Ordem de Largada (Sorteio)
          </Button>
          <Button onClick={handleSaveAll} className="ml-auto">
            <Save className="w-4 h-4 mr-2" />
            Salvar Todas
          </Button>
        </div>

        <div className="space-y-6">
          {categories
            .filter(category => {
              // Mostrar apenas subcategorias (parentId !== null)
              if (!category.parentId) return false;
              // Verificar se tem inscritos (confirmados ou pendentes)
              const catStat = stats?.byCategory?.find((s: any) => s.categoryId === category.id);
              const registrationCount = Number(catStat?.totalRegistrations || 0);
              return registrationCount > 0 || !!configs[category.id];
            })
            .sort((a, b) => {
              const posA = configs[a.id]?.orderPosition || 999;
              const posB = configs[b.id]?.orderPosition || 999;
              return posA - posB;
            })
            .map((category, sortedIndex) => {
              const config = configs[category.id];

              // Se não tiver config, não renderizar
              if (!config) {
                return null;
              }

              // Get registration count
              const catStat = stats?.byCategory?.find((s: any) => s.categoryId === category.id);
              const registrationCount = Number(catStat?.totalRegistrations || 0);

              const capacity = config.numberEnd - config.numberStart + 1;
              const summary = `Esta categoria largará em ${config.orderPosition}º lugar, com números de ${config.numberStart} a ${config.numberEnd}, começando às ${config.startTime}:00, com intervalo de ${config.intervalSeconds}s entre cada largada.`;

              const subcategoriesWithRegistrations = categories.filter(cat => {
                if (!cat.parentId) return false;
                const stat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
                return Number(stat?.totalRegistrations || 0) > 0 || !!configs[cat.id];
              });
              const categoryIndex = subcategoriesWithRegistrations.findIndex(c => c.id === category.id);
              const sortedCategories = categories.filter(cat => {
                if (!cat.parentId) return false;
                const stat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
                return Number(stat?.totalRegistrations || 0) > 0 || !!configs[cat.id];
              }).sort((a, b) => {
                const posA = configs[a.id]?.orderPosition || 999;
                const posB = configs[b.id]?.orderPosition || 999;
                return posA - posB;
              });
              const isFirst = sortedIndex === 0;
              const isLast = sortedIndex === sortedCategories.length - 1;

              return (
                <Card key={category.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div>
                      <CardTitle>{getCategoryTitle(category)}</CardTitle>
                      <CardDescription>
                        {registrationCount} inscritos (confirmados + pendentes) | Números: {config.numberStart} a {config.numberEnd}
                      </CardDescription>
                    </div>

                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{summary}</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Posição de Largada Categoria</Label>
                        <select
                          value={config.orderPosition || 1}
                          onChange={(e) => {
                            const newPosition = parseInt(e.target.value, 10) || 1;
                            setConfigs(prev => {
                              const updated = { ...prev };
                              updated[category.id] = { ...prev[category.id], orderPosition: newPosition };

                              // Recalcular tudo
                              const subcats = categories.filter(cat => !!cat.parentId);
                              const sortedCats = [...subcats]
                                .filter(cat => updated[cat.id])
                                .sort((a, b) => {
                                  const configA = updated[a.id];
                                  const configB = updated[b.id];
                                  const pA = configA?.orderPosition || 999;
                                  const pB = configB?.orderPosition || 999;

                                  if (pA === pB) {
                                    if (a.id === category.id) return -1;
                                    if (b.id === category.id) return 1;
                                  }
                                  return pA !== pB ? pA - pB : a.id - b.id;
                                });

                              if (sortedCats.length === 0) return prev;

                              let currentNumber = updated[sortedCats[0].id].numberStart;
                              let currentTimeMinutes = timeToMinutes(updated[sortedCats[0].id].startTime);

                              sortedCats.forEach((cat, idx) => {
                                const config = updated[cat.id];
                                const catStat = stats?.byCategory?.find((s: any) => s.categoryId === cat.id);
                                const regCount = Number(catStat?.totalRegistrations || 0);

                                const nStart = config.numberStart;
                                const nEnd = config.numberEnd;
                                const numP = Math.max(nEnd - nStart + 1, regCount, 1);

                                const finalStart = idx === 0 ? nStart : currentNumber;
                                const finalEnd = finalStart + numP - 1;
                                const finalTime = idx === 0 ? config.startTime : minutesToTime(currentTimeMinutes);

                                updated[cat.id] = {
                                  ...config,
                                  orderPosition: idx + 1,
                                  numberStart: finalStart,
                                  numberEnd: finalEnd,
                                  startTime: finalTime,
                                };

                                const duration = Math.ceil(Math.max(0, (numP - 1) * config.intervalSeconds) / 60);
                                currentTimeMinutes = timeToMinutes(finalTime) + duration + (config.timeBetweenCategories || 0);
                                currentNumber = finalEnd + 1;
                              });

                              return updated;
                            });
                          }}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                        >
                          {Array.from({ length: categories.filter(cat => cat.parentId && Number(stats?.byCategory?.find((s: any) => s.categoryId === cat.id)?.totalRegistrations || 0) > 0).length }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}º lugar
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Horário de Início</Label>
                        <Input
                          type="time"
                          value={config.startTime}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            setConfigs(prev => {
                              const updated = { ...prev };
                              updated[category.id] = { ...prev[category.id], startTime: newTime };
                              return recalculateCascade(updated, category.id);
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label>Número Inicial</Label>
                        <Input
                          type="number"
                          value={config.numberStart === 0 ? '' : (config.numberStart ?? '')}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            const catStat = stats?.byCategory?.find((s: any) => s.categoryId === category.id);
                            const regCount = Number(catStat?.totalRegistrations || 0);

                            setConfigs(prev => {
                              const updated = { ...prev };
                              updated[category.id] = {
                                ...prev[category.id],
                                numberStart: val,
                                // If start changes, end slides automatically to maintain count
                                numberEnd: val > 0 ? (val + Math.max(regCount, 1) - 1) : 0
                              };
                              return recalculateCascade(updated, category.id);
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label>Número Final</Label>
                        <Input
                          ref={(el) => {
                            if (el) numberEndRefs.current[category.id] = el;
                          }}
                          type="number"
                          value={config.numberEnd === 0 ? '' : (config.numberEnd ?? '')}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            setConfigs(prev => {
                              const updated = { ...prev };
                              updated[category.id] = { ...prev[category.id], numberEnd: val };
                              // No cascade recalculation for the current field to allow free editing,
                              // but DO recalculate for subsequent ones.
                              return recalculateCascade(updated, category.id);
                            });
                          }}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Intervalo entre Largadas (segundos)</Label>
                        <input
                          ref={(el) => {
                            if (el) intervalSecondsRefs.current[category.id] = el;
                          }}
                          type="number"
                          value={config.intervalSeconds === 0 ? '' : (config.intervalSeconds ?? '')}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value) || 0;
                            setConfigs(prev => {
                              const updated = { ...prev };
                              updated[category.id] = { ...prev[category.id], intervalSeconds: val };
                              return recalculateCascade(updated, category.id);
                            });
                          }}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                        />
                      </div>
                      {!isLast && (
                        <div className="col-span-2">
                          <Label>Tempo entre Categorias (minutos)</Label>
                          <input
                            type="number"
                            value={config.timeBetweenCategories === 0 ? '' : (config.timeBetweenCategories ?? '')}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                              setConfigs(prev => {
                                const updated = { ...prev };
                                updated[category.id] = { ...prev[category.id], timeBetweenCategories: val };
                                return recalculateCascade(updated, category.id);
                              });
                            }}
                            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* Modal de Sorting */}
        {showSortingModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <SortableStartList
                categories={categories}
                registrations={registrations}
                registrationCounts={Object.fromEntries(
                  (stats?.byCategory || []).map((s: any) => [
                    s.categoryId,
                    Number(s.totalRegistrations || 0),
                  ])
                )}
                currentConfigs={configs}
                onConfirm={async (newOrder) => {
                  try {
                    const savePromises: Promise<any>[] = [];
                    const uniqueCategories = new Set<number>(newOrder.map(item => item.categoryId as number));

                    uniqueCategories.forEach((categoryId: number) => {
                      const categoryItems = newOrder.filter(item => item.categoryId === categoryId);
                      if (categoryItems.length > 0) {
                        const firstItem = categoryItems[0];
                        const registrationIds = categoryItems.map(item => item.registrationId).filter((id): id is number => id !== undefined);
                        savePromises.push(
                          upsertMutation.mutateAsync({
                            eventId,
                            categoryId,
                            orderPosition: firstItem.orderPosition,
                            numberStart: firstItem.numberStart,
                            numberEnd: firstItem.numberStart + (categoryItems.length - 1),
                            startTime: firstItem.startTime,
                            intervalSeconds: firstItem.intervalSeconds,
                            registrationOrder: registrationIds.length > 0 ? registrationIds : undefined,
                          })
                        );
                      }
                    });

                    await Promise.all(savePromises);

                    setSortedRegistrations(newOrder);
                    setShowSortingModal(false);
                    toast.success("Ordem de largada atualizada e salva!");
                    setTimeout(() => {
                      window.location.reload();
                    }, 500);
                  } catch (error) {
                    console.error("Erro ao salvar ordem de largada:", error);
                    toast.error("Erro ao salvar ordem de largada");
                  }
                }}
                onCancel={() => setShowSortingModal(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
