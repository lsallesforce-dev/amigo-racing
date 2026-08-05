// Aba "Etapas e resultados": as etapas do campeonato agrupadas por EVENTO, e o
// que dá para fazer com cada uma (ver por categoria, limpar, excluir).
//
// Mudanças de comportamento vieram na extração:
//
//  1. `stages.sort(...)` era chamado direto no array que vem do React Query —
//     `sort` ordena IN PLACE, então a página estava MUTANDO o cache. Agora é
//     `[...stages].sort()`, memoizado.
//  2. O botão "Lançar" por etapa sumiu: a importação passou a ser por PLANILHA
//     (um arquivo traz várias provas de várias categorias), então o ponto de
//     entrada é um só, no topo da lista, e quem decide o evento do arquivo
//     inteiro é o ImportWizard (um evento por arquivo, não etapa por etapa).
//  3. A lista deixou de ser plana: cada arquivo importado é um evento com suas
//     próprias provas (P1, P2...), então agrupar por evento é o que reflete o
//     dado de verdade — uma lista plana foi o que colapsou a tabela de
//     classificação em produção (duas "etapa 1" de eventos diferentes,
//     indistinguíveis na tela).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  Eraser,
  FileSpreadsheet,
  Flag,
  List,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

export interface StagesTabProps {
  championshipId: number;
  stages: any[] | undefined;
  isLoading: boolean;
  isOwner: boolean;
  isStageOwner: (stage: any) => boolean;
  /** Abre o ImportWizard (que é do campeonato inteiro, não de uma etapa). */
  onImportar: () => void;
}

type AcaoDestrutiva = { tipo: "clear" | "delete"; stageId: number; stageNumber: number };

export default function StagesTab({
  championshipId,
  stages,
  isLoading,
  isOwner,
  isStageOwner,
  onImportar,
}: StagesTabProps) {
  const utils = trpc.useUtils();

  const [acao, setAcao] = useState<AcaoDestrutiva | null>(null);
  const [gerenciarStageId, setGerenciarStageId] = useState<number | null>(null);
  const [categoriaParaLimpar, setCategoriaParaLimpar] = useState<{
    stageId: number;
    categoria: string;
    stageNumber: number;
  } | null>(null);

  // ⚠️ spread obrigatório: `stages` é o array do cache do React Query.
  const etapasOrdenadas = useMemo(
    () => [...(stages || [])].sort((a, b) => a.stageNumber - b.stageNumber),
    [stages],
  );

  // Agrupamento por evento: chave estável é o `eventId` (evento da plataforma)
  // ou o `customName` (prova externa, que não tem evento cadastrado). Cada
  // grupo é exibido com o nome do evento em cima e as provas dele embaixo —
  // `provaNumber` é a numeração DENTRO do evento (P1, P2...), diferente de
  // `stageNumber`, que segue sendo a ordem global usada para ordenar.
  const gruposEvento = useMemo(() => {
    const grupos: { chave: string; nome: string; stages: any[] }[] = [];
    for (const stage of etapasOrdenadas) {
      const chave = stage.eventId != null ? `evt:${stage.eventId}` : `ext:${stage.customName}`;
      const nome = stage.isExternal ? stage.customName : stage.event?.name || stage.customName || "Evento";
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.stages.push(stage);
      else grupos.push({ chave, nome, stages: [stage] });
    }
    return grupos;
  }, [etapasOrdenadas]);

  const invalidarTudo = () => {
    utils.championships.getStages.invalidate({ championshipId });
    utils.championships.getStandings.invalidate({ championshipId });
  };

  const limparEtapaMutation = trpc.championships.clearStageResults.useMutation({
    onSuccess: () => {
      toast.success("Resultados excluídos!");
      setAcao(null);
      invalidarTudo();
    },
    onError: erro => toast.error(erro.message || "Erro ao excluir resultados"),
  });

  const excluirEtapaMutation = trpc.championships.deleteStage.useMutation({
    onSuccess: () => {
      toast.success("Etapa excluída!");
      setAcao(null);
      invalidarTudo();
    },
    onError: erro => toast.error(erro.message || "Erro ao excluir etapa"),
  });

  const limparCategoriaMutation = trpc.championships.clearStageResultsByCategory.useMutation({
    onSuccess: () => {
      toast.success("Resultados da categoria excluídos!");
      setCategoriaParaLimpar(null);
      invalidarTudo();
    },
    onError: erro => toast.error(erro.message || "Erro ao excluir categoria"),
  });

  const executarAcao = () => {
    if (!acao) return;
    if (acao.tipo === "clear") limparEtapaMutation.mutate({ stageId: acao.stageId });
    else excluirEtapaMutation.mutate({ stageId: acao.stageId });
  };

  const etapaGerenciada = etapasOrdenadas.find(s => s.id === gerenciarStageId);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Flag className="h-5 w-5 text-primary" /> Etapas do campeonato
              </CardTitle>
              <CardDescription>Eventos que compõem este campeonato e geram os resultados pontuados.</CardDescription>
            </div>
            {isOwner && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <AddStageDialog championshipId={championshipId} />
                <Button onClick={onImportar} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Importar planilha
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : etapasOrdenadas.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
              <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Adicione eventos a este campeonato — ou importe a planilha, que cria as etapas externas sozinha.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px] text-center">Prova</TableHead>
                    <TableHead>Categorias</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Local</TableHead>
                    <TableHead className="text-center w-[130px]">Resultados</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gruposEvento.map(grupo => {
                    const primeira = grupo.stages[0];
                    return (
                      <Fragment key={grupo.chave}>
                        {/* Cabeçalho do evento: um por arquivo importado (ou evento
                            cadastrado). As provas dele (P1, P2...) vêm logo abaixo —
                            é a correção do bug real, onde duas provas de arquivos
                            diferentes apareciam como se fossem a mesma etapa. */}
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={6} className="py-2">
                            <div className="flex items-center gap-2 font-bold text-primary">
                              <Flag className="h-3.5 w-3.5" />
                              {grupo.nome}
                              {primeira?.isExternal && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] uppercase font-bold bg-muted text-muted-foreground border-none"
                                >
                                  Externa
                                </Badge>
                              )}
                              {!primeira?.isExternal && primeira?.event?.startDate && (
                                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  {format(new Date(primeira.event.startDate), "dd 'de' MMMM", { locale: ptBR })}
                                </span>
                              )}
                              {!primeira?.isExternal && primeira?.event?.city && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {primeira.event.city}/{primeira.event.state}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {grupo.stages.map(stage => (
                          <TableRow key={stage.id}>
                            <TableCell className="text-center font-bold text-lg bg-muted/30">
                              P{(stage as any).provaNumber ?? stage.stageNumber}
                            </TableCell>
                            <TableCell className="font-medium">
                              {stage.categories?.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {stage.categories.map((cat: string) => (
                                    <Badge
                                      key={cat}
                                      variant="outline"
                                      className="text-[9px] py-0 px-1 border-primary/20 text-primary uppercase font-bold bg-primary/5"
                                    >
                                      {cat}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem categorias</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              <div className="flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {!stage.isExternal && stage.event?.startDate
                                  ? format(new Date(stage.event.startDate), "dd 'de' MMMM", { locale: ptBR })
                                  : "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              {!stage.isExternal && stage.event?.city ? `${stage.event.city}/${stage.event.state}` : "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {(isOwner || isStageOwner(stage)) && stage.categories?.length > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={() => setGerenciarStageId(stage.id)}
                                >
                                  <List className="h-4 w-4" />
                                  Gerenciar
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem resultados</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center w-[50px]">
                              {(isOwner || isStageOwner(stage)) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="text-amber-600 focus:text-amber-600 cursor-pointer"
                                      onClick={() =>
                                        setAcao({ tipo: "clear", stageId: stage.id, stageNumber: stage.stageNumber })
                                      }
                                    >
                                      <Eraser className="h-4 w-4 mr-2" />
                                      Limpar resultados
                                    </DropdownMenuItem>
                                    {isOwner && (
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive cursor-pointer"
                                        onClick={() =>
                                          setAcao({ tipo: "delete", stageId: stage.id, stageNumber: stage.stageNumber })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir etapa
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CategoryResultsManager
        championshipId={championshipId}
        stageId={gerenciarStageId}
        stageNumber={etapaGerenciada?.stageNumber || 0}
        open={gerenciarStageId !== null}
        onOpenChange={aberto => {
          if (!aberto) setGerenciarStageId(null);
        }}
        onLimparCategoria={categoria =>
          setCategoriaParaLimpar({
            stageId: gerenciarStageId!,
            categoria,
            stageNumber: etapaGerenciada?.stageNumber || 0,
          })
        }
      />

      <AlertDialog open={acao !== null} onOpenChange={aberto => !aberto && setAcao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao?.tipo === "clear" ? "Limpar resultados" : "Excluir etapa"} da {acao?.stageNumber}ª etapa
            </AlertDialogTitle>
            <AlertDialogDescription className="text-destructive font-medium">
              Isso apaga os pontos de todos os competidores desta etapa e recalcula o campeonato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAcao(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={acao?.tipo === "clear" ? "bg-amber-600 hover:bg-amber-700" : "bg-destructive hover:bg-destructive/90"}
              onClick={executarAcao}
              disabled={limparEtapaMutation.isPending || excluirEtapaMutation.isPending}
            >
              {limparEtapaMutation.isPending || excluirEtapaMutation.isPending ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={categoriaParaLimpar !== null}
        onOpenChange={aberto => !aberto && setCategoriaParaLimpar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar resultados da categoria {categoriaParaLimpar?.categoria}</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive font-medium">
              Remove apenas os resultados de <strong>{categoriaParaLimpar?.categoria}</strong> na{" "}
              {categoriaParaLimpar?.stageNumber}ª etapa. As outras categorias ficam intactas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCategoriaParaLimpar(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onClick={() => {
                if (categoriaParaLimpar) {
                  limparCategoriaMutation.mutate({
                    stageId: categoriaParaLimpar.stageId,
                    category: categoriaParaLimpar.categoria,
                  });
                }
              }}
              disabled={limparCategoriaMutation.isPending}
            >
              {limparCategoriaMutation.isPending ? "Excluindo..." : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --------------------------------------------------------- adicionar etapa
//
// Estava no CABEÇALHO da página, longe da lista que ele alimenta. Aqui fica ao
// lado do "Importar planilha", que é a outra forma de criar etapa — as duas
// juntas, no lugar onde o organizador procura.
//
// ⚠️ MUDANÇA DE MODELO: sumiu o campo "Nº da etapa" — era o organizador
// numerando prova na mão, resíduo do modelo plano que estamos matando. Pedido
// real dele, apontando esse campo: "podia ter a opção de importar 1, 2 ou
// todas". Agora ele diz só QUANTAS provas o evento tem ("Quantas provas?",
// padrão 1) e o backend cria P1...PN sozinho — a planilha preenche cada uma
// depois, sem precisar de número escolhido a dedo.

function AddStageDialog({ championshipId }: { championshipId: number }) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState("internal");
  const [eventId, setEventId] = useState("");
  const [customName, setCustomName] = useState("");
  const [provas, setProvas] = useState("1");

  const { data: meusEventos, isLoading: carregandoEventos } = trpc.events.myEvents.useQuery(undefined, {
    enabled: aberto,
  });

  const addStageMutation = trpc.championships.addStage.useMutation({
    onSuccess: (resultado: any) => {
      const criadas = resultado?.provasCriadas?.length ?? 1;
      toast.success(
        resultado?.eventoNome
          ? `${criadas} prova(s) criada(s) em "${resultado.eventoNome}"!`
          : "Etapa adicionada!",
      );
      setAberto(false);
      setEventId("");
      setCustomName("");
      setProvas("1");
      utils.championships.getStages.invalidate({ championshipId });
    },
    onError: erro => toast.error(erro.message || "Erro ao adicionar etapa"),
  });

  const salvar = () => {
    const quantidade = parseInt(provas, 10);
    if (isNaN(quantidade) || quantidade <= 0) {
      toast.error("Número de provas inválido");
      return;
    }
    if (tipo === "internal") {
      if (!eventId) {
        toast.error("Selecione um evento da plataforma");
        return;
      }
      addStageMutation.mutate({ championshipId, eventId: parseInt(eventId, 10), provas: quantidade });
    } else {
      if (!customName.trim()) {
        toast.error("Digite o nome do evento externo");
        return;
      }
      addStageMutation.mutate({ championshipId, customName: customName.trim(), provas: quantidade });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar etapa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar etapa ao campeonato</DialogTitle>
          <DialogDescription>
            Vincule um evento da plataforma ou crie um evento externo para receber resultados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Tabs value={tipo} onValueChange={setTipo}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="internal">Plataforma</TabsTrigger>
              <TabsTrigger value="external">Prova externa</TabsTrigger>
            </TabsList>
            <TabsContent value="internal" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="eventSelect">Evento da plataforma *</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger id="eventSelect">
                    <SelectValue placeholder={carregandoEventos ? "Carregando..." : "Selecione o evento"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(meusEventos || []).map((evento: any) => (
                      <SelectItem key={evento.id} value={String(evento.id)}>
                        {evento.name} ({new Date(evento.startDate).toLocaleDateString("pt-BR")})
                      </SelectItem>
                    ))}
                    {(!meusEventos || meusEventos.length === 0) && (
                      <SelectItem value="none" disabled>
                        Nenhum evento encontrado
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="external" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="customName">Nome do evento externo *</Label>
                <Input
                  id="customName"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Ex.: Rally de Barretos - Off Road"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="provasNum">Quantas provas? *</Label>
            <Input
              id="provasNum"
              type="number"
              min="1"
              value={provas}
              onChange={e => setProvas(e.target.value)}
              placeholder="Ex.: 2"
            />
            <p className="text-xs text-muted-foreground">
              Cria P1…P{Math.max(1, parseInt(provas, 10) || 1)} dentro deste evento — a planilha preenche cada prova
              depois, sem precisar numerar nada aqui.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={addStageMutation.isPending}>
            {addStageMutation.isPending ? "Adicionando..." : "Salvar etapa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------- gerenciador de categorias
//
// Vivia solto no fim da ChampionshipDetails. Ganhou o RENOMEAR: quando a
// planilha nova escreve "CARRO MASTER" e o campeonato tem "Carros Master", o
// organizador conserta aqui em vez de reimportar tudo.

function CategoryResultsManager({
  championshipId,
  stageId,
  stageNumber,
  open,
  onOpenChange,
  onLimparCategoria,
}: {
  championshipId: number;
  stageId: number | null;
  stageNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLimparCategoria: (categoria: string) => void;
}) {
  const utils = trpc.useUtils();
  const { data: resultados, isLoading } = trpc.championships.getStageResults.useQuery(
    { stageId: stageId || 0 },
    { enabled: !!stageId && open },
  );

  const [abaAtiva, setAbaAtiva] = useState<string>("");
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");

  const categorias = useMemo(
    () => Array.from(new Set((resultados || []).map(r => r.category || "Geral"))),
    [resultados],
  );

  useEffect(() => {
    if (categorias.length > 0 && !categorias.includes(abaAtiva)) setAbaAtiva(categorias[0]);
  }, [categorias, abaAtiva]);

  const renomearMutation = trpc.championships.renameCategory.useMutation({
    onSuccess: dados => {
      toast.success(`${dados.atualizados} resultado(s) movido(s) para "${novoNome.trim()}".`);
      setRenomeando(null);
      setNovoNome("");
      utils.championships.getStages.invalidate({ championshipId });
      utils.championships.getStandings.invalidate({ championshipId });
      if (stageId) utils.championships.getStageResults.invalidate({ stageId });
    },
    onError: erro => toast.error(erro.message || "Erro ao renomear categoria"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Resultados da {stageNumber}ª etapa
          </DialogTitle>
          <DialogDescription>
            Confira o que foi importado, categoria por categoria. Renomear vale para o campeonato inteiro.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden mt-4">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categorias.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground border border-dashed rounded-lg">
              Nenhum resultado cadastrado nesta etapa.
            </div>
          ) : (
            <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="h-full flex flex-col">
              <div className="overflow-x-auto pb-2">
                <TabsList>
                  {categorias.map(cat => (
                    <TabsTrigger key={cat} value={cat} className="capitalize">
                      {cat}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {categorias.map(cat => {
                const daCategoria = (resultados || [])
                  .filter(r => (r.category || "Geral") === cat)
                  .slice()
                  .sort((a, b) => a.position - b.position);
                return (
                  <TabsContent key={cat} value={cat} className="flex-1 overflow-y-auto mt-2 border rounded-md">
                    <div className="p-4 bg-muted/30 sticky top-0 z-10 border-b flex flex-wrap justify-between items-center gap-2">
                      {renomeando === cat ? (
                        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                          <Input
                            value={novoNome}
                            onChange={e => setNovoNome(e.target.value)}
                            placeholder="Novo nome da categoria"
                            className="h-8"
                            autoFocus
                          />
                          <Button
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={!novoNome.trim() || novoNome.trim() === cat || renomearMutation.isPending}
                            onClick={() =>
                              renomearMutation.mutate({ championshipId, de: cat, para: novoNome.trim() })
                            }
                          >
                            {renomearMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setRenomeando(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <h4 className="font-bold text-sm uppercase flex items-center gap-2">
                          {cat}
                          <Badge variant="outline" className="ml-1">
                            {daCategoria.length} linha(s)
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Renomear categoria em todo o campeonato"
                            onClick={() => {
                              setRenomeando(cat);
                              setNovoNome(cat);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </h4>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-[10px] gap-1 px-2"
                        onClick={() => onLimparCategoria(cat)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Limpar categoria
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">Pos</TableHead>
                          <TableHead>Piloto</TableHead>
                          <TableHead>Navegador</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {daCategoria.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="text-center font-bold">
                              {/* DSQ e DNS não têm colocação — imprimir "0º" era o
                                  bug antigo da prévia de importação. */}
                              {r.isDisqualified ? "NC" : r.position > 0 ? `${r.position}º` : "DNS"}
                            </TableCell>
                            <TableCell className="text-sm">{r.pilotName || "-"}</TableCell>
                            <TableCell className="text-sm">{r.navigatorName || "-"}</TableCell>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
