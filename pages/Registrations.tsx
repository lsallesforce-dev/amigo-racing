import { useState, useMemo, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Users, DollarSign, Calendar, CheckCircle, Clock, History, ArrowLeft, Trash2, Pencil, Shirt } from "lucide-react";

import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Navbar from "@/components/Navbar";
import { normalizeShirtSize, sortShirtSizes } from "@/shared/shirtSizes";


const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
  if (!baseTime) return "08:00";
  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
  const newHours = Math.floor(totalSeconds / 3600) % 24;
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

export default function Registrations() {
  const [, setLocation] = useLocation();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<number | null>(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [registrationToDelete, setRegistrationToDelete] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("");

  // Efeito para carregar eventId da URL se presente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventIdParam = params.get('eventId');
    if (eventIdParam) {
      setSelectedEventId(Number(eventIdParam));
    }
  }, []);

  // Buscar eventos do organizador
  const { data: events = [] } = trpc.events.myEvents.useQuery();

  // Buscar inscritos do evento selecionado
  const { data: registrations = [], isLoading: loadingRegistrations } = trpc.registrations.listByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Buscar configurações de largada para numeração e horários
  const { data: startConfigs = [] } = trpc.startOrder.getByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  const utils = trpc.useUtils();

  const markReceivedOfflineMutation = trpc.registrations.markReceivedOffline.useMutation({
    onSuccess: () => {
      toast.success("Inscrição confirmada e lançamento manual criado no financeiro!");
      utils.registrations.listByEvent.invalidate({ eventId: selectedEventId! });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao marcar como recebido por fora");
    },
  });

  const markConfirmedCourtesyMutation = trpc.registrations.markConfirmedCourtesy.useMutation({
    onSuccess: () => {
      toast.success("Inscrição confirmada como cortesia (sem lançamento financeiro)!");
      utils.registrations.listByEvent.invalidate({ eventId: selectedEventId! });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao confirmar cortesia");
    },
  });

  // Mutation para confirmar pagamento
  // const confirmPayment = trpc.payments.confirm.useMutation({
  //   onSuccess: async () => {
  //     toast.success("Pagamento confirmado com sucesso!");
  //     await utils.registrations.listByEvent.invalidate();
  //     await utils.registrations.getStatistics.invalidate();
  //   },
  //   onError: (error: any) => {
  //     toast.error(error.message || "Erro ao confirmar pagamento");
  //   },
  // });

  // Mutation para atualizar número e horário de largada
  const updateStartInfo = trpc.registrations.updateStartInfo.useMutation({
    onSuccess: async () => {
      await utils.registrations.listByEvent.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar informações de largada");
    },
  });

  // Mutation para exportar a planilha de camisetas
  const exportShirtsMutation = trpc.registrations.exportShirts.useMutation();

  // Estoque de camisetas (disponibilidade + gestão)
  // Carrega sempre que há evento (não só com o diálogo de estoque aberto): o select
  // de camisa do "Editar inscrição" também tira as opções daqui.
  const { data: shirtStock = [] } = trpc.shirtStock.getByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );
  // Semeia o formulário editável quando a disponibilidade carrega.
  useEffect(() => {
    if (stockDialogOpen && shirtStock.length > 0) {
      setStockEdits(Object.fromEntries(shirtStock.map((s: any) => [s.size, s.quantity])));
    }
  }, [stockDialogOpen, shirtStock]);

  const usedBySize = new Map((shirtStock as any[]).map(s => [s.size, s.used]));
  const stockRows = sortShirtSizes(
    Object.keys(stockEdits).map(size => {
      const quantity = stockEdits[size];
      const used = usedBySize.get(size) || 0;
      return { size, quantity, used, available: quantity - used };
    }),
    (r) => r.size
  );

  const setStockMutation = trpc.shirtStock.setStock.useMutation({
    onSuccess: () => {
      toast.success("Estoque de camisetas atualizado!");
      setStockDialogOpen(false);
      utils.shirtStock.getByEvent.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao salvar estoque");
    },
  });

  const handleAddStockSize = () => {
    const size = normalizeShirtSize(newSize);
    if (!size) {
      toast.error("Informe um tamanho válido");
      return;
    }
    if (stockEdits[size] !== undefined) {
      toast.error(`Tamanho ${size} já está na lista`);
      return;
    }
    setStockEdits({ ...stockEdits, [size]: Math.max(0, parseInt(newQty) || 0) });
    setNewSize("");
    setNewQty("");
  };

  const handleSaveStock = () => {
    if (!selectedEventId) return;
    const items = Object.entries(stockEdits).map(([size, quantity]) => ({ size, quantity }));
    setStockMutation.mutate({ eventId: selectedEventId, items });
  };

  // Mutation para edição completa da inscrição
  const updateFullMutation = trpc.registrations.updateFull.useMutation({
    onSuccess: async () => {
      toast.success("Inscrição atualizada com sucesso!");
      setEditDialogOpen(false);
      setEditForm(null);
      await utils.registrations.listByEvent.invalidate();
      await utils.registrations.getStatistics.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar inscrição");
    },
  });

  // Mutation para excluir inscrição
  const deleteRegistration = trpc.registrations.delete.useMutation({
    onSuccess: async () => {
      toast.success("Inscrição excluída com sucesso!");
      setDeleteConfirmDialogOpen(false);
      setRegistrationToDelete(null);
      await utils.registrations.listByEvent.invalidate();
      await utils.registrations.getStatistics.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir inscrição");
    },
  });

  // Buscar estatísticas do evento selecionado
  const { data: statistics } = trpc.registrations.getStatistics.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Buscar categorias do evento para exibir nomes
  const { data: categories = [] } = trpc.categories.listByEvent.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Buscar histórico da inscrição selecionada
  const { data: history = [] } = trpc.registrations.getHistory.useQuery(
    { registrationId: selectedRegistrationId! },
    { enabled: !!selectedRegistrationId && historyDialogOpen }
  );

  const getCategoryName = (categoryId: number) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "N/A";
  };

  // Agrupa os inscritos por categoria, na mesma ordem definida no drag-and-drop
  // dos cards de categoria do evento (categories já vem ordenado por sortOrder).
  const groupedRegistrations = useMemo(() => {
    const subcats = categories.filter(c => !!c.parentId);
    const groups: { categoryId: number; categoryName: string; regs: typeof registrations }[] = [];

    subcats.forEach(cat => {
      const regs = registrations.filter(r => r.categoryId === cat.id);
      if (regs.length > 0) {
        const parent = categories.find(c => c.id === cat.parentId);
        const categoryName = parent ? `${parent.name} - ${cat.name}` : cat.name;
        groups.push({ categoryId: cat.id, categoryName, regs });
      }
    });

    // Inscrições cuja categoria não foi encontrada (ex: categoria excluída depois)
    const knownIds = new Set(subcats.map(c => c.id));
    const orphanRegs = registrations.filter(r => !knownIds.has(r.categoryId));
    if (orphanRegs.length > 0) {
      groups.push({ categoryId: -1, categoryName: "Outras", regs: orphanRegs });
    }

    return groups;
  }, [categories, registrations]);

  // Mapeamento de registrationId -> { number, time } baseado na configuração de largada
  const startOrderMap = useMemo(() => {
    const map = new Map<number, { number: number; time: string }>();
    if (!startConfigs || !registrations || !categories) return map;

    // Subcategorias (que são as que possuem pilotos)
    const subcats = categories.filter(cat => !!cat.parentId);

    // Ordenar subcategorias pela posição na configuração
    const sortedSubcats = [...subcats].sort((a, b) => {
      const configA = startConfigs.find(c => c.categoryId === a.id);
      const configB = startConfigs.find(c => c.categoryId === b.id);
      return (configA?.orderPosition || 0) - (configB?.orderPosition || 0);
    });

    sortedSubcats.forEach(category => {
      const config = startConfigs.find(c => c.categoryId === category.id);
      if (!config) return;

      const categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');

      // Ordem customizada se houver
      if (config.registrationOrder) {
        try {
          const order = typeof config.registrationOrder === 'string'
            ? JSON.parse(config.registrationOrder)
            : config.registrationOrder;
          if (Array.isArray(order) && order.length > 0) {
            const orderMap = new Map(order.map((id, idx) => [id, idx]));
            categoryRegs.sort((a, b) => ((orderMap.get(a.id) ?? 999) as number) - ((orderMap.get(b.id) ?? 999) as number));
          }
        } catch (e) { }
      }

      categoryRegs.forEach((reg, index) => {
        map.set(reg.id, {
          number: config.numberStart + index,
          time: calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds)
        });
      });
    });
    return map;
  }, [startConfigs, registrations, categories]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-600">Confirmado</Badge>;
      case "pending":
        return <Badge variant="outline">Pendente</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };





  // Tamanhos do select de camisa do "Editar inscrição".
  // Vinham de uma lista fixa minúscula ("pp","p","m"...), mas desde o controle de
  // estoque por tamanho (fc1e84e) o formulário público grava o token canônico
  // MAIÚSCULO do estoque ("M", "G1", "INF6"). O valor não batia com nenhuma option
  // e o Select abria em branco — a camiseta escolhida "sumia".
  // Agora a fonte é o estoque do evento (mesma do formulário público), e o tamanho
  // já gravado entra na lista mesmo que não exista mais no estoque.
  const DEFAULT_SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "G1", "G2", "G3/G4", "INFANTIL"];
  const shirtSizeOptions = useMemo(() => {
    const base = shirtStock.length > 0 ? shirtStock.map((s: any) => s.size) : DEFAULT_SHIRT_SIZES;
    const atuais = [editForm?.pilotShirtSize, editForm?.navigatorShirtSize]
      .map(normalizeShirtSize)
      .filter(Boolean);
    return sortShirtSizes([...new Set([...base, ...atuais])], (s) => s);
  }, [shirtStock, editForm?.pilotShirtSize, editForm?.navigatorShirtSize]);

  const openEditDialog = (registration: any) => {
    setEditForm({
      registrationId: registration.id,
      categoryId: registration.categoryId,
      status: registration.status,
      pilotName: registration.pilotName || "",
      pilotEmail: registration.pilotEmail || "",
      pilotCpf: registration.pilotCpf || "",
      pilotCity: registration.pilotCity || "",
      pilotState: registration.pilotState || "",
      pilotAge: registration.pilotAge ?? "",
      pilotShirtSize: normalizeShirtSize(registration.pilotShirtSize),
      phone: registration.phone || "",
      navigatorName: registration.navigatorName || "",
      navigatorEmail: registration.navigatorEmail || "",
      navigatorCpf: registration.navigatorCpf || "",
      navigatorCity: registration.navigatorCity || "",
      navigatorState: registration.navigatorState || "",
      navigatorShirtSize: normalizeShirtSize(registration.navigatorShirtSize),
      team: registration.team || "",
      vehicleBrand: registration.vehicleBrand || "",
      vehicleModel: registration.vehicleModel || "",
      vehicleYear: registration.vehicleYear ?? "",
      vehicleColor: registration.vehicleColor || "",
      vehiclePlate: registration.vehiclePlate || "",
      notes: registration.notes || "",
      startNumber: registration.startNumber ?? "",
      startTime: registration.startTime || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    updateFullMutation.mutate({
      ...editForm,
      pilotAge: editForm.pilotAge === "" ? null : Number(editForm.pilotAge),
      vehicleYear: editForm.vehicleYear === "" ? null : Number(editForm.vehicleYear),
      startNumber: editForm.startNumber === "" ? null : Number(editForm.startNumber),
    });
  };

  const downloadBase64Xlsx = (payload: any, defaultFilename: string) => {
    try {
      const binaryString = atob(payload.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", payload.filename || defaultFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast.error("Erro ao processar arquivo para download");
    }
  };

  const handleExportShirts = async () => {
    if (!selectedEventId) {
      toast.error("Selecione um evento para exportar");
      return;
    }
    try {
      toast.info("Gerando planilha de camisetas...");
      const result = await exportShirtsMutation.mutateAsync({ eventId: selectedEventId });
      downloadBase64Xlsx(result, "camisetas.xlsx");
      toast.success("Planilha de camisetas gerada!");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao gerar planilha de camisetas");
    }
  };

  // Gera um PDF paisagem no padrão "Lista de Participantes": header com logo,
  // agrupado por categoria (banner laranja, ordem do drag-and-drop de largada)
  // e com paginação inteligente. Colunas/campos são parametrizados por quem chama.
  const buildCategoryListPdf = async (opts: {
    subtitle: string;
    filenamePrefix: string;
    toastLabel: string;
    columns: { head: string; cellWidth: number; halign?: 'left' | 'center' | 'right' }[];
    rowMapper: (reg: any) => (string | number)[];
  }) => {
    if (!selectedEventId || !events || registrations.length === 0) {
      toast.error("Selecione um evento com inscrições para exportar");
      return;
    }
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;

    try {
      toast.info(`Gerando PDF: ${opts.toastLabel}...`);

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

      // Logo do evento (via backend, já em base64 — evita CORS do R2).
      let eventLogoDataUrl: string | null = null;
      try {
        const r = await utils.events.getLogoDataUrl.fetch({ eventId: selectedEventId });
        eventLogoDataUrl = r?.dataUrl || null;
      } catch (e) {
        console.warn("Não foi possível carregar o logo do evento", e);
      }

      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header com logo AutoZap (direita) + logo do evento (esquerda) + título
      if (amigoLogoBase64) doc.addImage(amigoLogoBase64, 'PNG', pageWidth - 44, 10, 30, 0);
      // Logo do evento: redimensiona sozinho pra caber numa caixa 45x28
      // preservando a proporção (qualquer formato de logo).
      if (eventLogoDataUrl) {
        try {
          const props = doc.getImageProperties(eventLogoDataUrl);
          const maxW = 45, maxH = 28;
          const ratio = Math.min(maxW / props.width, maxH / props.height);
          const w = props.width * ratio;
          const h = props.height * ratio;
          doc.addImage(eventLogoDataUrl, (props as any).fileType || 'PNG', 14, 12 + (maxH - h) / 2, w, h);
        } catch (e) {
          console.warn("Falha ao desenhar o logo do evento", e);
        }
      }
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(event.name, pageWidth / 2, 28, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(opts.subtitle, pageWidth / 2, 36, { align: "center" });
      doc.setDrawColor(229, 231, 235);
      doc.line(14, 50, pageWidth - 14, 50);

      // Agrupar e ordenar itens por categoria (ordem da config de largada)
      const sortedItems: any[] = [];
      const subcategories = categories.filter(cat => !!cat.parentId);
      const sortedSubcats = [...subcategories].sort((a, b) => {
        const configA = startConfigs.find(c => c.categoryId === a.id);
        const configB = startConfigs.find(c => c.categoryId === b.id);
        return (configA?.orderPosition || 0) - (configB?.orderPosition || 0);
      });

      sortedSubcats.forEach(category => {
        const config = startConfigs.find(c => c.categoryId === category.id);
        let categoryRegs = registrations.filter(r => r.categoryId === category.id && r.status !== 'cancelled');
        if (config?.registrationOrder) {
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
            number: config ? config.numberStart + index : index + 1,
            startTime: config ? calculateStartTime(config.startTime || "08:00", index, config.intervalSeconds) : '-'
          });
        });
      });

      const categoriesMap = new Map<string, any[]>();
      sortedItems.forEach(item => {
        if (!categoriesMap.has(item.categoryName)) categoriesMap.set(item.categoryName, []);
        categoriesMap.get(item.categoryName)!.push(item);
      });

      // Banner (barra) do nome da categoria, repetido nas continuações.
      const drawCategoryBanner = (label: string, baselineY: number) => {
        doc.setFillColor(249, 115, 22, 0.1);
        doc.rect(14, baselineY - 5, pageWidth - 28, 8, 'F');
        doc.setTextColor(234, 88, 12);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(label, 17, baselineY);
      };
      const contBannerBaseline = 18;

      const head = [opts.columns.map(c => c.head)];
      const columnStyles: any = {};
      opts.columns.forEach((c, i) => {
        columnStyles[i] = { cellWidth: c.cellWidth, ...(c.halign ? { halign: c.halign } : {}) };
      });

      let currentY = 60;
      categoriesMap.forEach((items, categoryName) => {
        const tableBody = items.map(opts.rowMapper);

        // Paginação inteligente: se não couber banner + cabeçalho + 2 linhas
        // antes do fim da página, começa a categoria já na próxima.
        const minBlock = 8 + 10 + 14 * Math.min(2, items.length);
        if (currentY + minBlock > pageHeight - 14) {
          doc.addPage();
          currentY = 20;
        }

        const tableStartY = currentY;
        let firstTablePage = true;

        autoTable(doc, {
          startY: tableStartY + 5,
          head,
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 11, fontStyle: 'bold', halign: 'center' },
          columnStyles,
          styles: { fontSize: 10, cellPadding: 3, valign: 'middle' },
          // Sem isso o autoTable parte a linha no meio da quebra de página: o
          // "#" de um inscrito ficava no fim de uma página e o número dele
          // sozinho no topo da seguinte.
          rowPageBreak: 'avoid',
          showHead: 'everyPage',
          margin: { left: 14, right: 14, top: contBannerBaseline + 6 },
          didDrawPage: () => {
            if (firstTablePage) {
              drawCategoryBanner(categoryName, tableStartY);
              firstTablePage = false;
            } else {
              drawCategoryBanner(`${categoryName} (continuação)`, contBannerBaseline);
            }
          },
        });

        currentY = (doc as any).lastAutoTable.finalY + 12;
      });

      doc.save(`${opts.filenamePrefix}_${event.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
      toast.success(`PDF gerado: ${opts.toastLabel}!`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error(`Erro ao gerar PDF: ${opts.toastLabel}`);
    }
  };

  const handleExportEventList = () => {
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

    return buildCategoryListPdf({
      subtitle: "Lista de Participantes - Oficial",
      filenamePrefix: "lista_evento",
      toastLabel: "Lista do Evento",
      columns: [
        // Nº precisa caber "#21" numa linha só (12mm - 6mm de padding não cabia
        // e o número descia pra segunda linha da célula). Os 4mm saem de Piloto
        // e Navegador pra soma continuar em 269mm (A4 paisagem - margens).
        { head: 'Nº', cellWidth: 16, halign: 'center' },
        { head: 'Piloto', cellWidth: 42 },
        { head: 'CPF Piloto', cellWidth: 31 },
        { head: 'Cam', cellWidth: 15, halign: 'center' },
        { head: 'Navegador', cellWidth: 42 },
        { head: 'CPF Nav.', cellWidth: 31 },
        { head: 'Cam', cellWidth: 15, halign: 'center' },
        { head: 'Equipe', cellWidth: 30 },
        { head: 'Status', cellWidth: 26, halign: 'center' },
        { head: 'Extras', cellWidth: 21 },
      ],
      rowMapper: (reg) => [
        `#${reg.number}`,
        reg.pilotName,
        reg.pilotCpf || '-',
        reg.pilotShirtSize || '-',
        reg.navigatorName || '-',
        reg.navigatorCpf || '-',
        reg.navigatorShirtSize || '-',
        reg.team || '-',
        reg.status === 'paid' ? 'Confirmado' : 'Pendente',
        formatExtras(reg.purchasedProducts),
      ],
    });
  };

  const handleExportInscritos = () => {
    return buildCategoryListPdf({
      subtitle: "Listagem Inscritos",
      filenamePrefix: "listagem_inscritos",
      toastLabel: "Listagem Inscritos",
      columns: [
        { head: 'Nº', cellWidth: 16, halign: 'center' },
        { head: 'Piloto', cellWidth: 65 },
        { head: 'Navegador', cellWidth: 62 },
        { head: 'Carro', cellWidth: 60 },
        { head: 'Cidade', cellWidth: 66 },
      ],
      rowMapper: (reg) => [
        `#${reg.number}`,
        reg.pilotName,
        reg.navigatorName || '-',
        (reg.vehicleBrand || reg.vehicleModel) ? `${reg.vehicleBrand || ''} ${reg.vehicleModel || ''}`.trim() : '-',
        reg.pilotCity ? `${reg.pilotCity}${reg.pilotState ? '/' + reg.pilotState : ''}` : '-',
      ],
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-8 space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/organizer")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Painel
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Users className="h-7 w-7 md:h-8 md:w-8 text-primary" />
              Inscritos
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">Gerencie as inscrições dos seus eventos</p>
          </div>
          {selectedEventId && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleExportEventList} variant="outline" className="h-10">
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Exportar Lista do Evento</span>
                <span className="sm:hidden">Exportar PDF</span>
              </Button>
              <Button onClick={handleExportInscritos} variant="outline" className="h-10">
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Listagem Inscritos</span>
                <span className="sm:hidden">Inscritos</span>
              </Button>
              <Button
                onClick={handleExportShirts}
                variant="outline"
                className="h-10"
                disabled={exportShirtsMutation.isPending}
              >
                <Shirt className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">
                  {exportShirtsMutation.isPending ? "Gerando..." : "Exportar Camisetas"}
                </span>
                <span className="sm:hidden">Camisetas</span>
              </Button>
              <Button onClick={() => setStockDialogOpen(true)} variant="outline" className="h-10">
                <Shirt className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Estoque de Camisetas</span>
                <span className="sm:hidden">Estoque</span>
              </Button>
            </div>
          )}
        </div>

        {/* Tela de Seleção de Evento */}
        {!selectedEventId ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Selecione um Evento</CardTitle>
                <CardDescription>Escolha o evento para visualizar e gerenciar os inscritos</CardDescription>
              </CardHeader>
            </Card>

            {events.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Você ainda não criou nenhum evento da plataforma.</p>
                  <p className="text-sm text-muted-foreground mt-2">Eventos externos (apenas calendário) não aparecem aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event: any) => (
                  <Card
                    key={event.id}
                    className="cursor-pointer hover:border-orange-500 transition-colors overflow-hidden"
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    {/* Imagem de capa do evento */}
                    {event.imageUrl ? (
                      <div className="w-full h-48 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
                        <img
                          src={encodeURI(event.imageUrl)}
                          alt={event.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                        <Calendar className="h-16 w-16 text-white opacity-50" />
                      </div>
                    )}

                    <CardHeader>
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <CardDescription>
                        {new Date(new Date(event.startDate).getTime() + 3 * 60 * 60 * 1000).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric"
                        })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{event.city}, {event.state}</span>
                        </div>
                        {getStatusBadge(event.status)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Botão Voltar */}
            <Button
              variant="ghost"
              onClick={() => setSelectedEventId(null)}
              className="mb-2 h-10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Seleção de Eventos
            </Button>

            {/* Cards de Estatísticas */}
            {selectedEventId && statistics && (
              <>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total de Inscritos</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{statistics.totalRegistrations}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Inscrições Pagas</CardTitle>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{formatCurrency((statistics as any).paidRevenue || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">{(statistics as any).paidRegistrations || 0} confirmadas</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Inscrições a Receber</CardTitle>
                      <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600">{formatCurrency((statistics as any).pendingRevenue || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">{(statistics as any).pendingRegistrationsCount || 0} pendentes</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(statistics.totalRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Pagas + a receber</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Categorias</CardTitle>
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{statistics.byCategory.length}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg md:text-xl">Estatísticas por Categoria</CardTitle>
                    <CardDescription>Detalhamento de inscrições e vagas</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <div className="overflow-x-auto scrollbar-hide">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">Categoria</TableHead>
                            <TableHead className="text-right">Confirmados</TableHead>
                            <TableHead className="text-right">Pendentes</TableHead>
                            <TableHead className="text-right">Disponíveis</TableHead>
                            <TableHead className="text-right">Receita</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.byCategory.map((cat) => (
                            <TableRow key={cat.categoryId}>
                              <TableCell className="font-medium">{cat.categoryName}</TableCell>
                              <TableCell className="text-right">
                                <Badge className="bg-green-600">{cat.confirmedRegistrations}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline">{cat.pendingRegistrations}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {cat.totalSlots ? cat.availableSlots : "∞"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(cat.revenue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Tabela de Inscritos */}
            {selectedEventId && (
              <Card>
                <CardHeader>
                  <CardTitle>Lista de Inscritos</CardTitle>
                  <CardDescription>
                    {registrations.length} inscrição(ões) encontrada(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingRegistrations ? (
                    <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                  ) : registrations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma inscrição encontrada para este evento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-6 px-6 scrollbar-hide">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-1 sm:px-2 w-16">Nº</TableHead>
                            <TableHead className="px-1 sm:px-2">Piloto</TableHead>
                            <TableHead className="px-1 sm:px-2">Navegador</TableHead>
                            <TableHead className="px-1 sm:px-2">Veículo</TableHead>
                            <TableHead className="px-1 sm:px-2">Equipe</TableHead>
                            <TableHead className="text-right px-1 sm:px-2">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedRegistrations.map((group) => (
                            <Fragment key={group.categoryId}>
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={6} className="bg-primary/10 font-bold text-primary py-2 px-2">
                                  {group.categoryName}
                                </TableCell>
                              </TableRow>
                              {group.regs.map((registration) => {
                                const info = startOrderMap.get(registration.id);
                                const number = info?.number ?? (registration as any).startNumber ?? "-";
                                return (
                                  <TableRow key={registration.id}>
                                    <TableCell className="px-1 sm:px-2 text-muted-foreground">{number}</TableCell>
                                    <TableCell className="font-medium px-1 sm:px-2">
                                      <div className="flex items-center gap-2">
                                        {registration.pilotName}
                                        {getStatusBadge(registration.status)}
                                      </div>
                                    </TableCell>
                                    <TableCell className="px-1 sm:px-2">
                                      {(registration as any).navigatorName || "-"}
                                    </TableCell>
                                    <TableCell className="px-1 sm:px-2">
                                      {registration.vehicleBrand && registration.vehicleModel
                                        ? `${registration.vehicleBrand} ${registration.vehicleModel}`
                                        : "-"}
                                    </TableCell>
                                    <TableCell className="px-1 sm:px-2">{registration.team || "-"}</TableCell>
                                    <TableCell className="text-right px-1 sm:px-2">
                                      <div className="flex items-center justify-end gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="gap-2"
                                          onClick={() => openEditDialog(registration)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                          Editar
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                          title="Excluir Inscrição"
                                          onClick={() => {
                                            setRegistrationToDelete(registration);
                                            setDeleteConfirmDialogOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>
        )}

        {/* Dialog de Histórico */}
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de Alterações</DialogTitle>
              <DialogDescription>
                Todas as alterações feitas nesta inscrição
              </DialogDescription>
            </DialogHeader>

            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma alteração registrada
              </p>
            ) : (
              <div className="space-y-4">
                {history.map((entry: any) => (
                  <div key={entry.id} className="border-l-2 border-primary pl-4 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm">{entry.fieldName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.changedAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground">
                        <span className="font-medium">De:</span> {entry.oldValue || "(vazio)"}
                      </p>
                      <p>
                        <span className="font-medium">Para:</span> {entry.newValue || "(vazio)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Alterado por: {entry.changedByName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Confirmação de Exclusão */}
        <Dialog open={deleteConfirmDialogOpen} onOpenChange={setDeleteConfirmDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Excluir Inscrição
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir permanentemente a inscrição de <strong>{registrationToDelete?.pilotName}</strong>?
                <br /><br />
                Esta ação não pode ser desfeita e removerá todos os dados relacionados a esta inscrição.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteRegistration.mutate({ registrationId: registrationToDelete?.id })}
                disabled={deleteRegistration.isPending}
              >
                {deleteRegistration.isPending ? "Excluindo..." : "Excluir Permanentemente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Estoque de Camisetas */}
        <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shirt className="h-5 w-5" />
                Estoque de Camisetas
              </DialogTitle>
              <DialogDescription>
                Defina quantas camisetas foram produzidas por tamanho. As novas inscrições
                só poderão escolher tamanhos com saldo disponível (piloto + navegador + extras
                da loja consomem do mesmo estoque).
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tamanho</TableHead>
                      <TableHead className="text-center w-32">Produzido</TableHead>
                      <TableHead className="text-center">Usado</TableHead>
                      <TableHead className="text-center">Disponível</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          Nenhum tamanho cadastrado ainda. Adicione abaixo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stockRows.map((row) => (
                        <TableRow key={row.size}>
                          <TableCell className="font-medium">{row.size}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              className="w-24 mx-auto text-center"
                              value={stockEdits[row.size] ?? 0}
                              onChange={(e) =>
                                setStockEdits({ ...stockEdits, [row.size]: Math.max(0, parseInt(e.target.value) || 0) })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">{row.used}</TableCell>
                          <TableCell className="text-center">
                            <span className={row.available < 0 ? "text-destructive font-semibold" : row.available === 0 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>
                              {row.available}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-end gap-2 mt-4 pt-4 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Novo tamanho</Label>
                  <Input
                    className="w-32"
                    placeholder="Ex: INF8, G3/G4"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={handleAddStockSize}>Adicionar</Button>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                "Disponível" negativo significa que já foram usadas mais camisetas do que o produzido
                (ex: tamanhos antigos que não estavam no pedido). Ajuste o produzido para regularizar.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStockDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveStock} disabled={setStockMutation.isPending}>
                {setStockMutation.isPending ? "Salvando..." : "Salvar Estoque"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Edição Completa da Inscrição */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Inscrição</DialogTitle>
              <DialogDescription>
                Todos os campos desta inscrição podem ser alterados aqui.
              </DialogDescription>
            </DialogHeader>

            {editForm && (
              <div className="space-y-6 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {editForm.status === 'pending' && (
                    <div className="flex flex-wrap items-center gap-2 p-3 border rounded-md bg-muted/30 w-full">
                      <span className="text-sm text-muted-foreground mr-auto">Inscrição pendente de pagamento:</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markConfirmedCourtesyMutation.isPending}
                        onClick={() => {
                          markConfirmedCourtesyMutation.mutate({ registrationId: editForm.registrationId });
                          setEditForm({ ...editForm, status: 'paid' });
                        }}
                      >
                        Confirmado (cortesia)
                      </Button>
                      <Button
                        size="sm"
                        disabled={markReceivedOfflineMutation.isPending}
                        onClick={() => {
                          markReceivedOfflineMutation.mutate({ registrationId: editForm.registrationId });
                          setEditForm({ ...editForm, status: 'paid' });
                        }}
                      >
                        Recebido por fora
                      </Button>
                    </div>
                  )}
                  {editForm.status === 'cancellation_requested' && registrations.find((r: any) => r.id === editForm.registrationId)?.cancellationReason && (
                    <div className="text-sm p-3 border rounded-md bg-orange-50 border-orange-200 text-orange-800 w-full">
                      <strong>Motivo do cancelamento solicitado:</strong> {registrations.find((r: any) => r.id === editForm.registrationId)?.cancellationReason}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2 ml-auto"
                    onClick={() => {
                      setSelectedRegistrationId(editForm.registrationId);
                      setHistoryDialogOpen(true);
                    }}
                  >
                    <History className="h-4 w-4" />
                    Ver Histórico
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Categoria</Label>
                    <Select
                      value={String(editForm.categoryId)}
                      onValueChange={(v) => setEditForm({ ...editForm, categoryId: Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => !!c.parentId).map((cat) => {
                          const parent = categories.find(p => p.id === cat.parentId);
                          const label = parent ? `${parent.name} - ${cat.name}` : cat.name;
                          return <SelectItem key={cat.id} value={String(cat.id)}>{label}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select
                      value={editForm.status}
                      onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Confirmado</SelectItem>
                        <SelectItem value="cancellation_requested">Cancelamento Solicitado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Piloto</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Nome</Label>
                      <Input value={editForm.pilotName} onChange={(e) => setEditForm({ ...editForm, pilotName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input value={editForm.pilotEmail} onChange={(e) => setEditForm({ ...editForm, pilotEmail: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>CPF</Label>
                      <Input value={editForm.pilotCpf} onChange={(e) => setEditForm({ ...editForm, pilotCpf: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Telefone</Label>
                      <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Idade</Label>
                      <Input type="number" value={editForm.pilotAge} onChange={(e) => setEditForm({ ...editForm, pilotAge: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cidade</Label>
                      <Input value={editForm.pilotCity} onChange={(e) => setEditForm({ ...editForm, pilotCity: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>UF</Label>
                      <Input maxLength={2} value={editForm.pilotState} onChange={(e) => setEditForm({ ...editForm, pilotState: e.target.value.toUpperCase() })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Camisa</Label>
                      <Select value={editForm.pilotShirtSize} onValueChange={(v) => setEditForm({ ...editForm, pilotShirtSize: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {shirtSizeOptions.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Navegador</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Nome</Label>
                      <Input value={editForm.navigatorName} onChange={(e) => setEditForm({ ...editForm, navigatorName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input value={editForm.navigatorEmail} onChange={(e) => setEditForm({ ...editForm, navigatorEmail: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>CPF</Label>
                      <Input value={editForm.navigatorCpf} onChange={(e) => setEditForm({ ...editForm, navigatorCpf: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Camisa</Label>
                      <Select value={editForm.navigatorShirtSize} onValueChange={(v) => setEditForm({ ...editForm, navigatorShirtSize: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {shirtSizeOptions.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Cidade</Label>
                      <Input value={editForm.navigatorCity} onChange={(e) => setEditForm({ ...editForm, navigatorCity: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>UF</Label>
                      <Input maxLength={2} value={editForm.navigatorState} onChange={(e) => setEditForm({ ...editForm, navigatorState: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Veículo / Equipe</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Marca</Label>
                      <Input value={editForm.vehicleBrand} onChange={(e) => setEditForm({ ...editForm, vehicleBrand: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Modelo</Label>
                      <Input value={editForm.vehicleModel} onChange={(e) => setEditForm({ ...editForm, vehicleModel: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Ano</Label>
                      <Input type="number" value={editForm.vehicleYear} onChange={(e) => setEditForm({ ...editForm, vehicleYear: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cor</Label>
                      <Input value={editForm.vehicleColor} onChange={(e) => setEditForm({ ...editForm, vehicleColor: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Placa</Label>
                      <Input value={editForm.vehiclePlate} onChange={(e) => setEditForm({ ...editForm, vehiclePlate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Equipe</Label>
                      <Input value={editForm.team} onChange={(e) => setEditForm({ ...editForm, team: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Largada</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Número</Label>
                      <Input type="number" value={editForm.startNumber} onChange={(e) => setEditForm({ ...editForm, startNumber: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Horário</Label>
                      <Input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={updateFullMutation.isPending}>
                {updateFullMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
