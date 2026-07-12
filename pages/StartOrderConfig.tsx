import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ArrowLeft, Save, Download, Wand2, Users, RotateCcw } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { calculateStartTime, computeCascade, type CascadeEntry } from "@/lib/start-order";

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

type CategoryConfig = {
  orderPosition: number;
  numberStart: number;
  numberEnd: number;
  startTime: string;
  intervalSeconds: number;
  timeBetweenCategories: number;
  numberStartManual: boolean;
  numberEndManual: boolean;
  startTimeManual: boolean;
  /** Ordem sorteada (JSON de IDs de inscrição) — somente leitura aqui; quem grava é o /sorteio */
  registrationOrder: string | null;
};

export default function StartOrderConfig() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0");
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  // Queries
  const eventQuery = trpc.events.get.useQuery({ id: eventId });
  const categoriesQuery = trpc.categories.listByEvent.useQuery({ eventId });
  const statsQuery = trpc.registrations.getStatistics.useQuery({ eventId });
  const configsQuery = trpc.startOrder.getByEvent.useQuery({ eventId });
  const registrationsQuery = trpc.registrations.listByEvent.useQuery({ eventId });

  const event = eventQuery.data;
  const categories = categoriesQuery.data ?? [];
  const stats = statsQuery.data ?? { byCategory: [] };
  const startOrderConfigs = configsQuery.data ?? [];
  const registrations = registrationsQuery.data ?? [];

  const upsertBatchMutation = trpc.startOrder.upsertBatch.useMutation();

  const [configs, setConfigs] = useState<Record<number, CategoryConfig>>({});
  const hasInitialized = useRef(false);

  const regCountOf = (categoryId: number): number => {
    const stat = stats?.byCategory?.find((s: any) => s.categoryId === categoryId);
    return Number(stat?.totalRegistrations || 0);
  };

  const subcategoriesOf = (cfgs: Record<number, CategoryConfig>) =>
    categories
      .filter(cat => !!cat.parentId && !!cfgs[cat.id])
      .sort((a, b) => (cfgs[a.id].orderPosition - cfgs[b.id].orderPosition) || (a.id - b.id));

  /** Roda a cascata compartilhada sobre o estado e devolve o estado atualizado. */
  const applyCascade = (cfgs: Record<number, CategoryConfig>): Record<number, CategoryConfig> => {
    const entries: CascadeEntry[] = subcategoriesOf(cfgs).map(cat => ({
      categoryId: cat.id,
      registrationCount: regCountOf(cat.id),
      orderPosition: cfgs[cat.id].orderPosition,
      numberStart: cfgs[cat.id].numberStart,
      numberEnd: cfgs[cat.id].numberEnd,
      startTime: cfgs[cat.id].startTime,
      intervalSeconds: cfgs[cat.id].intervalSeconds,
      timeBetweenCategories: cfgs[cat.id].timeBetweenCategories,
      numberStartManual: cfgs[cat.id].numberStartManual,
      numberEndManual: cfgs[cat.id].numberEndManual,
      startTimeManual: cfgs[cat.id].startTimeManual,
    }));

    const next = { ...cfgs };
    computeCascade(entries).forEach(e => {
      next[e.categoryId] = {
        ...next[e.categoryId],
        orderPosition: e.orderPosition,
        numberStart: e.numberStart,
        numberEnd: e.numberEnd,
        startTime: e.startTime,
      };
    });
    return next;
  };

  // Inicializa o estado quando TODAS as queries usadas no cálculo carregarem.
  // Inicializar sem stats zerava as contagens e corrompia números/horários (bug antigo).
  useEffect(() => {
    if (hasInitialized.current) return;
    if (categoriesQuery.isPending || statsQuery.isPending || configsQuery.isPending) return;
    if (categories.length === 0) return;

    const subcats = categories.filter(cat => !!cat.parentId);
    const seeded: Record<number, CategoryConfig> = {};
    subcats.forEach((cat, idx) => {
      const saved = startOrderConfigs.find(c => c.categoryId === cat.id) as any;
      seeded[cat.id] = {
        orderPosition: saved?.orderPosition ?? 900 + idx,
        numberStart: saved?.numberStart ?? 1,
        numberEnd: saved?.numberEnd ?? 0,
        startTime: (saved?.startTime || "08:00").slice(0, 5),
        intervalSeconds: saved?.intervalSeconds ?? 60,
        timeBetweenCategories: Number(saved?.timeBetweenCategories ?? 0),
        numberStartManual: !!saved?.numberStartManual,
        numberEndManual: !!saved?.numberEndManual,
        startTimeManual: !!saved?.startTimeManual,
        registrationOrder: (saved?.registrationOrder as string) ?? null,
      };
    });

    setConfigs(applyCascade(seeded));
    hasInitialized.current = true;
  }, [categoriesQuery.isPending, statsQuery.isPending, configsQuery.isPending, categories, stats, startOrderConfigs]);

  /** Atualiza campos de uma categoria sem recalcular (a cascata roda no onBlur). */
  const setField = (categoryId: number, patch: Partial<CategoryConfig>) => {
    setConfigs(prev => ({ ...prev, [categoryId]: { ...prev[categoryId], ...patch } }));
  };

  const recalcOnBlur = () => setConfigs(prev => applyCascade(prev));

  /** Move a categoria para a posição escolhida e renumera 1..n. */
  const handlePositionChange = (categoryId: number, newPosition: number) => {
    setConfigs(prev => {
      const ordered = subcategoriesOf(prev);
      const fromIdx = ordered.findIndex(cat => cat.id === categoryId);
      if (fromIdx === -1) return prev;

      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(Math.min(Math.max(newPosition - 1, 0), ordered.length), 0, moved);

      const next = { ...prev };
      ordered.forEach((cat, i) => {
        next[cat.id] = { ...next[cat.id], orderPosition: i + 1 };
      });
      return applyCascade(next);
    });
  };

  /** Limpa todas as flags manuais e recalcula tudo a partir da 1ª categoria. */
  const handleResetAuto = () => {
    setConfigs(prev => {
      const next: Record<number, CategoryConfig> = {};
      Object.entries(prev).forEach(([key, cfg]) => {
        next[Number(key)] = { ...cfg, numberStartManual: false, numberEndManual: false, startTimeManual: false };
      });
      return applyCascade(next);
    });
    toast.success("Números e horários recalculados automaticamente.");
  };

  const handleSaveAll = async () => {
    try {
      const configsToSave = subcategoriesOf(configs).map(category => {
        const config = configs[category.id];
        return {
          categoryId: category.id,
          orderPosition: config.orderPosition,
          numberStart: config.numberStart,
          numberEnd: config.numberEnd,
          startTime: config.startTime,
          intervalSeconds: config.intervalSeconds,
          timeBetweenCategories: config.timeBetweenCategories || 0,
          numberStartManual: config.numberStartManual,
          numberEndManual: config.numberEndManual,
          startTimeManual: config.startTimeManual,
          // registrationOrder NÃO é enviado: o backend preserva a ordem sorteada salva
        };
      });

      await upsertBatchMutation.mutateAsync({ eventId, configs: configsToSave });
      await utils.startOrder.getByEvent.invalidate({ eventId });
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
      console.error(error);
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

      // Ordena pela posição das categorias e, dentro delas, pela ordem sorteada salva no banco
      const sortedItems: any[] = [];
      subcategoriesOf(configs).forEach(category => {
        const config = configs[category.id];

        let categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');

        if (config.registrationOrder) {
          try {
            const order = JSON.parse(config.registrationOrder);
            if (Array.isArray(order) && order.length > 0) {
              const orderMap = new Map(order.map((regId: number, idx: number) => [regId, idx]));
              categoryRegs = [...categoryRegs].sort(
                (a, b) => ((orderMap.get(a.id) ?? 999) as number) - ((orderMap.get(b.id) ?? 999) as number)
              );
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

  if (!event) {
    return <div className="p-4">Carregando...</div>;
  }

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

  const orderedCategories = subcategoriesOf(configs);
  const isSaving = upsertBatchMutation.isPending;

  const ManualTag = () => <span className="ml-1 text-xs text-orange-500">(manual)</span>;

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
          <Button onClick={handleResetAuto} variant="outline" disabled={isSaving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Recalcular Automático
          </Button>
          <Button onClick={handleSaveAll} className="ml-auto" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Salvando..." : "Salvar Todas"}
          </Button>
        </div>

        <div className="space-y-6">
          {orderedCategories.map((category, sortedIndex) => {
            const config = configs[category.id];
            if (!config) return null;

            const registrationCount = regCountOf(category.id);
            const isLast = sortedIndex === orderedCategories.length - 1;
            const summary = `Esta categoria largará em ${config.orderPosition}º lugar, com números de ${config.numberStart} a ${config.numberEnd}, começando às ${config.startTime}:00, com intervalo de ${config.intervalSeconds}s entre cada largada.`;
            const overCapacity = registrationCount > (config.numberEnd - config.numberStart + 1);

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
                  {overCapacity && (
                    <p className="text-sm font-medium text-red-500">
                      Atenção: há {registrationCount} inscritos para {config.numberEnd - config.numberStart + 1} números reservados.
                      Aumente o Número Final ou use "Recalcular Automático".
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Posição de Largada Categoria</Label>
                      <select
                        value={config.orderPosition || 1}
                        onChange={(e) => handlePositionChange(category.id, parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                      >
                        {orderedCategories.map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}º lugar
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>
                        Horário de Início
                        {config.startTimeManual && sortedIndex > 0 && <ManualTag />}
                      </Label>
                      <Input
                        type="time"
                        value={config.startTime}
                        onChange={(e) => setField(category.id, { startTime: e.target.value, startTimeManual: sortedIndex > 0 })}
                        onBlur={recalcOnBlur}
                      />
                    </div>
                    <div>
                      <Label>
                        Número Inicial
                        {config.numberStartManual && sortedIndex > 0 && <ManualTag />}
                      </Label>
                      <Input
                        type="number"
                        value={config.numberStart === 0 ? '' : (config.numberStart ?? '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                          setField(category.id, { numberStart: val, numberStartManual: sortedIndex > 0 });
                        }}
                        onBlur={recalcOnBlur}
                      />
                    </div>
                    <div>
                      <Label>
                        Número Final
                        {config.numberEndManual && <ManualTag />}
                      </Label>
                      <Input
                        type="number"
                        value={config.numberEnd === 0 ? '' : (config.numberEnd ?? '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                          // Campo vazio volta pro automático; valor digitado vira manual
                          setField(category.id, { numberEnd: val, numberEndManual: val !== 0 });
                        }}
                        onBlur={recalcOnBlur}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Intervalo entre Largadas (segundos)</Label>
                      <input
                        type="number"
                        value={config.intervalSeconds === 0 ? '' : (config.intervalSeconds ?? '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                          setField(category.id, { intervalSeconds: val });
                        }}
                        onBlur={recalcOnBlur}
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
                            setField(category.id, { timeBetweenCategories: val });
                          }}
                          onBlur={recalcOnBlur}
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
      </div>
    </div>
  );
}
