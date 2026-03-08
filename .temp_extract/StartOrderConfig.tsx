import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Download, Wand2, Edit3 } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { SortableStartList } from "@/components/SortableStartList";
import { trpc } from "@/lib/trpc";

export default function StartOrderConfig() {
  console.log('[StartOrderConfig] Component rendered');
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0");
  console.log('[StartOrderConfig] eventId:', eventId);
  const [, navigate] = useLocation();

  // Queries
  const { data: event } = trpc.events.getById.useQuery({ id: eventId });
  const { data: categories = [] } = trpc.categories.listByEvent.useQuery({ eventId });
  const { data: stats = { byCategory: [] } } = trpc.registrations.getStatistics.useQuery({ eventId });
  const { data: startOrderConfigs = [] } = trpc.startOrder.getByEvent.useQuery({ eventId });
  const { data: registrations = [] } = trpc.registrations.listByEvent.useQuery({ eventId });

  // Mutations
  const upsertMutation = trpc.startOrder.upsert.useMutation();
  const upsertBatchMutation = trpc.startOrder.upsertBatch.useMutation();
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
  }>>({});
  
  // Refs para controlar inputs de número sem interferência do React
  const numberEndRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const intervalSecondsRefs = useRef<Record<number, HTMLInputElement | null>>({});
  
  // State para modal de sorting
  const [showSortingModal, setShowSortingModal] = useState(false);
  const [sortedRegistrations, setSortedRegistrations] = useState<any[]>([]);

  // Initialize configs from database OR create defaults
  useEffect(() => {
    console.log('[StartOrderConfig] useEffect triggered', { categoriesLength: categories.length, statsLength: stats.byCategory?.length });
    if (categories.length > 0) {
      console.log('[StartOrderConfig] Categories:', categories);
      console.log('[StartOrderConfig] Stats:', stats);
      const newConfigs: typeof configs = {};
      let orderPosition = 1;

      // Filtrar apenas subcategorias com inscritos
      const subcategoriesWithRegistrations = categories.filter(category => {
        // Mostrar apenas subcategorias (parentId !== null)
        if (!category.parentId) return false;
        
        // Verificar se tem inscritos
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
        const registrationCount = catStat?.confirmedRegistrations || 0;
        return registrationCount > 0;
      });

      subcategoriesWithRegistrations.forEach((category) => {
        // Try to find existing config
        const existingConfig = startOrderConfigs.find(c => c.categoryId === category.id);
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
        const registrationCount = catStat?.confirmedRegistrations || 0;
        
        // Se tem config salvo, usar os números salvos; senão, calcular baseado em inscritos
        const useExistingNumbers = !!existingConfig;

        if (useExistingNumbers) {
          // Use database config exatamente como está salvo - NÃO recalcular!
          newConfigs[category.id] = {
            orderPosition: existingConfig.orderPosition,
            numberStart: existingConfig.numberStart,
            numberEnd: existingConfig.numberEnd,
            startTime: existingConfig.startTime,
            intervalSeconds: existingConfig.intervalSeconds,
            timeBetweenCategories: (existingConfig as any).timeBetweenCategories || 0,
          };
          orderPosition = Math.max(orderPosition, existingConfig.orderPosition + 1);
        } else {
          // Create default config using actual registration count
          newConfigs[category.id] = {
            orderPosition: orderPosition++,
            numberStart: 1,
            numberEnd: Math.max(registrationCount, 1),
            startTime: "08:00",
            intervalSeconds: 60,
            timeBetweenCategories: 0,
          };
        }
      });

      setConfigs(newConfigs);
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

  // Função para mover categoria para cima
  const handleMoveUp = (categoryIndex: number) => {
    const subcategoriesWithRegistrations = categories.filter(category => {
      if (!category.parentId) return false;
      const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
      const registrationCount = catStat?.confirmedRegistrations || 0;
      return registrationCount > 0;
    });

    if (categoryIndex <= 0) return;

    setConfigs(prev => {
      const updated = { ...prev };
      const currentCat = subcategoriesWithRegistrations[categoryIndex];
      const prevCat = subcategoriesWithRegistrations[categoryIndex - 1];

      // Trocar os números e horários
      const tempConfig = updated[currentCat.id];
      updated[currentCat.id] = { ...updated[prevCat.id] };
      updated[prevCat.id] = { ...tempConfig };

      // Recalcular cascata a partir da primeira categoria
      let currentNumber = updated[subcategoriesWithRegistrations[0].id]?.numberStart || 1;
      let currentTimeMinutes = timeToMinutes(updated[subcategoriesWithRegistrations[0].id]?.startTime || '08:00');

      for (let i = 0; i < subcategoriesWithRegistrations.length; i++) {
        const cat = subcategoriesWithRegistrations[i];
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
        const registrationCount = catStat?.confirmedRegistrations || 1;
        const intervalSeconds = updated[cat.id]?.intervalSeconds || 60;

        const numberStart = currentNumber;
        const numberEnd = currentNumber + registrationCount - 1;

        let startTime = minutesToTime(currentTimeMinutes);
        if (i > 0) {
          const prevCat = subcategoriesWithRegistrations[i - 1];
          const prevConfig = updated[prevCat.id];
          const prevNumberEnd = prevConfig?.numberEnd || 1;
          const prevNumberStart = prevConfig?.numberStart || 1;
          const prevIntervalSeconds = prevConfig?.intervalSeconds || 60;
          const numPilotos = prevNumberEnd - prevNumberStart + 1;
          const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * prevIntervalSeconds);
          const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);
          const timeBetweenCategories = (prevConfig?.timeBetweenCategories || 0);
          const registrationCountMinutes = (prevConfig?.numberEnd - prevConfig?.numberStart + 1) || 1;
          currentTimeMinutes += registrationCountMinutes + timeBetweenCategories;
          startTime = minutesToTime(currentTimeMinutes);
        }

        updated[cat.id] = {
          ...updated[cat.id],
          numberStart,
          numberEnd,
          startTime,
        };

        currentNumber = numberEnd + 1;
      }

      return updated;
    });
  };

  // Função para mover categoria para baixo
  const handleMoveDown = (categoryIndex: number) => {
    const subcategoriesWithRegistrations = categories.filter(category => {
      if (!category.parentId) return false;
      const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
      const registrationCount = catStat?.confirmedRegistrations || 0;
      return registrationCount > 0;
    });

    if (categoryIndex >= subcategoriesWithRegistrations.length - 1) return;

    setConfigs(prev => {
      const updated = { ...prev };
      const currentCat = subcategoriesWithRegistrations[categoryIndex];
      const nextCat = subcategoriesWithRegistrations[categoryIndex + 1];

      // Trocar os números e horários
      const tempConfig = updated[currentCat.id];
      updated[currentCat.id] = { ...updated[nextCat.id] };
      updated[nextCat.id] = { ...tempConfig };

      // Recalcular cascata a partir da primeira categoria
      let currentNumber = updated[subcategoriesWithRegistrations[0].id]?.numberStart || 1;
      let currentTimeMinutes = timeToMinutes(updated[subcategoriesWithRegistrations[0].id]?.startTime || '08:00');

      for (let i = 0; i < subcategoriesWithRegistrations.length; i++) {
        const cat = subcategoriesWithRegistrations[i];
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
        const registrationCount = catStat?.confirmedRegistrations || 1;
        const intervalSeconds = updated[cat.id]?.intervalSeconds || 60;

        const numberStart = currentNumber;
        const numberEnd = currentNumber + registrationCount - 1;

        let startTime = minutesToTime(currentTimeMinutes);
        if (i > 0) {
          const prevCat = subcategoriesWithRegistrations[i - 1];
          const prevConfig = updated[prevCat.id];
          const prevNumberEnd = prevConfig?.numberEnd || 1;
          const prevNumberStart = prevConfig?.numberStart || 1;
          const prevIntervalSeconds = prevConfig?.intervalSeconds || 60;
          const numPilotos = prevNumberEnd - prevNumberStart + 1;
          const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * prevIntervalSeconds);
          const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);
          const timeBetweenCategories = (prevConfig?.timeBetweenCategories || 0);
          const registrationCountMinutes = (prevConfig?.numberEnd - prevConfig?.numberStart + 1) || 1;
          currentTimeMinutes += registrationCountMinutes + timeBetweenCategories;
          startTime = minutesToTime(currentTimeMinutes);
        }

        updated[cat.id] = {
          ...updated[cat.id],
          numberStart,
          numberEnd,
          startTime,
        };

        currentNumber = numberEnd + 1;
      }

      return updated;
    });
  };

  // Recalcular cascata de horarios quando Numero Final ou Intervalo mudam
  const updateCascadeForCategory = (changedCategoryIndex: number) => {
    const subcategoriesWithRegistrations = categories.filter(category => {
      if (!category.parentId) return false;
      const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
      const registrationCount = catStat?.confirmedRegistrations || 0;
      return registrationCount > 0;
    });

    if (subcategoriesWithRegistrations.length === 0) return;

    setConfigs(prev => {
      const updated = { ...prev };
      
      // Recalcular apenas as categorias abaixo da alterada
      for (let i = changedCategoryIndex + 1; i < subcategoriesWithRegistrations.length; i++) {
        const category = subcategoriesWithRegistrations[i];
        const prevCategory = subcategoriesWithRegistrations[i - 1];
        const prevConfig = updated[prevCategory.id];

        if (!prevConfig) continue;

        const numberEnd = Number(prevConfig.numberEnd);
        const numberStart = Number(prevConfig.numberStart);
        const intervalSeconds = Number(prevConfig.intervalSeconds);

        if (isNaN(numberEnd) || isNaN(numberStart) || isNaN(intervalSeconds)) continue;

        const numPilotos = numberEnd - numberStart + 1;
        const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * intervalSeconds);
        const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);

        const prevTimeMinutes = timeToMinutes(prevConfig.startTime);
        const nextTimeMinutes = prevTimeMinutes + tempoTotalMinutos + 1;
        const newStartTime = minutesToTime(nextTimeMinutes);

        // Calcular numberStart e numberEnd da próxima categoria
        const nextNumberStart = numberEnd + 1;
        // Buscar número de inscritos da categoria atual
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
        const registrationCount = catStat?.confirmedRegistrations || 1; // Mínimo 1 para evitar NaN
        const nextNumberEnd = nextNumberStart + (registrationCount - 1);

        if (updated[category.id]) {
          updated[category.id].startTime = newStartTime;
          updated[category.id].numberStart = nextNumberStart;
          updated[category.id].numberEnd = nextNumberEnd;
        }
      }

      return updated;
    });
  }

  const handleSaveAll = async () => {
    try {
      // Filtrar apenas subcategorias com inscritos
      const subcategoriesWithRegistrations = categories.filter(category => {
        if (!category.parentId) return false;
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
        const registrationCount = catStat?.confirmedRegistrations || 0;
        return registrationCount > 0;
      });

      const configsToSave = subcategoriesWithRegistrations.map(category => {
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
      
      if (!result.data) {
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
      link.download = result.filename;
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
    if (!eventId) {
      toast.error("Evento não encontrado");
      return;
    }
    
    try {
      toast.info("Gerando Lista do Evento...");
      
      // Chamar endpoint do backend
      const result = await exportEventListMutation.mutateAsync({ eventId });
      
      if (!result.data) {
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
      link.download = result.filename || 'lista-evento.xlsx';
      try {
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      } finally {
        window.URL.revokeObjectURL(url);
      }
      
      toast.success("Lista do Evento exportada com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar Lista do Evento:", error);
      toast.error("Erro ao exportar Lista do Evento");
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({ eventId });
      
      if (!result.data) {
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

  const handleAutoFill = () => {
    setConfigs(prev => {
      const updated = { ...prev };
      let currentNumber = 1;

      categories.forEach(category => {
        if (updated[category.id]) {
          const count = updated[category.id].numberEnd - updated[category.id].numberStart + 1;
          updated[category.id].numberStart = currentNumber;
          updated[category.id].numberEnd = currentNumber + count - 1;
          currentNumber = updated[category.id].numberEnd + 1;
        }
      });

      return updated;
    });
    toast.success("Numeração preenchida automaticamente!");
  };

  const handleUpdateCounts = () => {
    // Stats já estão sincronizados automaticamente via useEffect
    toast.success("Contagem de inscritos atualizada!");
  };

  const handleUpdateOrder = () => {
    setConfigs(prev => {
      const updated = { ...prev };
      const subcategoriesWithRegistrations = categories.filter(cat => {
        if (!cat.parentId) return false;
        const stat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
        return (stat?.confirmedRegistrations || 0) > 0;
      });
      const sortedCategories = [...subcategoriesWithRegistrations].sort((a, b) => {
        const posA = updated[a.id]?.orderPosition || 999;
        const posB = updated[b.id]?.orderPosition || 999;
        return posA - posB;
      });
      let currentNumber = 1;
      let currentTimeMinutes = timeToMinutes(updated[sortedCategories[0]?.id]?.startTime || '08:00');
      sortedCategories.forEach((cat, idx) => {
        const catStat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
        const registrationCount = catStat?.confirmedRegistrations || 1;
        const intervalSeconds = updated[cat.id]?.intervalSeconds || 60;
        let numberStart = updated[cat.id]?.numberStart || currentNumber;
        let numberEnd = updated[cat.id]?.numberEnd || (numberStart + registrationCount - 1);
        let startTime = minutesToTime(currentTimeMinutes);
        if (idx > 0) {
          const prevCat = sortedCategories[idx - 1];
          const prevConfig = updated[prevCat.id];
          const prevNumberEnd = prevConfig?.numberEnd || 1;
          const prevNumberStart = prevConfig?.numberStart || 1;
          const prevIntervalSeconds = prevConfig?.intervalSeconds || 60;
          // Se o usuário não digitou um Número Inicial customizado, calcular baseado no anterior
          if (!updated[cat.id]?.numberStart) {
            numberStart = prevNumberEnd + 1;
            numberEnd = numberStart + registrationCount - 1;
          }
          currentNumber = numberStart;
          const numPilotos = prevNumberEnd - prevNumberStart + 1;
          const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * prevIntervalSeconds);
          const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);
          const timeBetweenCategories = (prevConfig?.timeBetweenCategories || 0);
          const registrationCountMinutes = (prevConfig?.numberEnd - prevConfig?.numberStart + 1) || 1;
          currentTimeMinutes += registrationCountMinutes + timeBetweenCategories;
          startTime = minutesToTime(currentTimeMinutes);
        }
        updated[cat.id] = {
          ...updated[cat.id],
          orderPosition: idx + 1,
          numberStart: numberStart,
          numberEnd: numberEnd,
          startTime,
        };
        currentNumber = numberEnd + 1;
      });
      return updated;
    });
    toast.success("Ordem de largada atualizada!");
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
    const nextTimeMinutes = prevTimeMinutes + tempoTotalMinutos + 1; // +1 minuto de margem

    return minutesToTime(nextTimeMinutes);
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
          <Button onClick={handleExportEventList} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar Lista do Evento
          </Button>
          <Button onClick={handleUpdateCounts} variant="outline">
            <Wand2 className="w-4 h-4 mr-2" />
            Atualizar Contagem
          </Button>
          <Button onClick={handleAutoFill} variant="outline">
            <Wand2 className="w-4 h-4 mr-2" />
            Auto-preencher Numeração
          </Button>
          <Button onClick={handleUpdateOrder} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Wand2 className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={() => navigate(`/organizer/events/${eventId}/sorteio`)} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
            <Wand2 className="w-4 h-4 mr-2" />
            Gerenciar Ordem de Largada
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
              // Verificar se tem inscritos
              const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
              const registrationCount = catStat?.confirmedRegistrations || 0;
              return registrationCount > 0;
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
            const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
            const registrationCount = catStat?.confirmedRegistrations || 0;

            const capacity = config.numberEnd - config.numberStart + 1;
            const summary = `Esta categoria largará em ${config.orderPosition}º lugar, com números de ${config.numberStart} a ${config.numberEnd}, começando às ${config.startTime}:00, com intervalo de ${config.intervalSeconds}s entre cada largada.`;

            const subcategoriesWithRegistrations = categories.filter(cat => {
              if (!cat.parentId) return false;
              const stat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
              return (stat?.confirmedRegistrations || 0) > 0;
            });
            const categoryIndex = subcategoriesWithRegistrations.findIndex(c => c.id === category.id);
            const sortedCategories = categories.filter(cat => {
              if (!cat.parentId) return false;
              const stat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
              return (stat?.confirmedRegistrations || 0) > 0;
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
                      {registrationCount} inscritos | Números: {config.numberStart} a {config.numberEnd}
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
                          setConfigs(prev => ({
                            ...prev,
                            [category.id]: { ...prev[category.id], orderPosition: newPosition }
                          }));
                        }}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                      >
                        {Array.from({ length: categories.filter(cat => cat.parentId && (stats.byCategory?.find((s: any) => s.categoryId === cat.id)?.confirmedRegistrations || 0) > 0).length }, (_, i) => (
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

                            // Recalcular cascata para categorias posteriores
                            const filteredCategories = categories.filter(cat => {
                              if (!cat.parentId) return false;
                              const stat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
                              return (stat?.confirmedRegistrations || 0) > 0;
                            });

                            const currentIndex = filteredCategories.findIndex(c => c.id === category.id);
                            for (let i = currentIndex + 1; i < filteredCategories.length; i++) {
                              const nextCat = filteredCategories[i];
                              const cascadeTime = calculateCascadeTime(i, filteredCategories);
                              if (updated[nextCat.id]) {
                                updated[nextCat.id].startTime = cascadeTime;
                              }
                            }

                            return updated;
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Número Inicial</Label>
                      <Input
                        type="number"
                        value={config.numberStart}
                        onChange={(e) =>
                          setConfigs(prev => ({
                            ...prev,
                            [category.id]: { ...prev[category.id], numberStart: parseInt(e.target.value, 10) || 0 }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Número Final</Label>
                      <input
                        ref={(el) => {
                          if (el) numberEndRefs.current[category.id] = el;
                        }}
                        type="number"
                        value={config.numberEnd || ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                          setConfigs(prev => ({
                            ...prev,
                            [category.id]: { ...prev[category.id], numberEnd: val }
                          }));
                        }}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Intervalo entre Largadas (segundos)</Label>
                      <input
                        ref={(el) => {
                          if (el) intervalSecondsRefs.current[category.id] = el;
                        }}
                        type="number"
                        value={config.intervalSeconds || ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value) || 0;
                          setConfigs(prev => {
                            const updated = {
                              ...prev,
                              [category.id]: { ...prev[category.id], intervalSeconds: val }
                            };
                            
                            // Disparar cascata sincronamente com o novo estado
                            const subs = categories.filter(cat => {
                              if (!cat.parentId) return false;
                              const stat = stats.byCategory?.find((s: any) => s.categoryId === cat.id);
                              return (stat?.confirmedRegistrations || 0) > 0;
                            });
                            const idx = subs.findIndex(cat => cat.id === category.id);
                            
                            if (idx !== -1) {
                              // Recalcular apenas as categorias abaixo da alterada
                              for (let i = idx + 1; i < subs.length; i++) {
                                const nextCat = subs[i];
                                const prevCat = subs[i - 1];
                                const prevConfig = updated[prevCat.id];

                                if (!prevConfig) continue;

                                const numberEnd = Number(prevConfig.numberEnd);
                                const numberStart = Number(prevConfig.numberStart);
                                const intervalSeconds = Number(prevConfig.intervalSeconds);
                                const timeBetweenCategories = Number(prevConfig.timeBetweenCategories) || 0;

                                if (isNaN(numberEnd) || isNaN(numberStart) || isNaN(intervalSeconds)) continue;

                                const numPilotos = numberEnd - numberStart + 1;
                                const tempoTotalSegundos = Math.max(0, (numPilotos - 1) * intervalSeconds);
                                const tempoTotalMinutos = Math.ceil(tempoTotalSegundos / 60);

                                const prevTimeMinutes = timeToMinutes(prevConfig.startTime);
                                const timeBetweenCategoriesMinutes = Math.ceil(timeBetweenCategories / 60);
                                const nextTimeMinutes = prevTimeMinutes + tempoTotalMinutos + timeBetweenCategoriesMinutes;
                                const newStartTime = minutesToTime(nextTimeMinutes);

                                const nextNumberStart = numberEnd + 1;
                                const catStat = stats.byCategory?.find((s: any) => s.categoryId === nextCat.id);
                                const registrationCount = catStat?.confirmedRegistrations || 1;
                                const nextNumberEnd = nextNumberStart + (registrationCount - 1);

                                if (updated[nextCat.id]) {
                                  updated[nextCat.id].startTime = newStartTime;
                                  updated[nextCat.id].numberStart = nextNumberStart;
                                  updated[nextCat.id].numberEnd = nextNumberEnd;
                                }
                              }
                            }
                            
                            return updated;
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
                          value={config.timeBetweenCategories || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setConfigs(prev => ({
                              ...prev,
                              [category.id]: { ...prev[category.id], timeBetweenCategories: val }
                            }));
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
                  (stats.byCategory || []).map((s: any) => [
                    s.categoryId,
                    s.confirmedRegistrations || 0,
                  ])
                )}
                currentConfigs={configs}
                onConfirm={async (newOrder) => {
                  try {
                    const savePromises: Promise<any>[] = [];
                    const uniqueCategories = new Set(newOrder.map(item => item.categoryId));
                    
                    uniqueCategories.forEach((categoryId) => {
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
