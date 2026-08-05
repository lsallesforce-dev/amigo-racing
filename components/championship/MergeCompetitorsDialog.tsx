// Unificador de competidores — conserta o estrago DEPOIS que ele já entrou.
//
// O competidor do campeonato é uma string digitada por quem monta a planilha:
// "Nilson Soares" na etapa 1 e "Nilson Soares de Lima" na etapa 2 viram duas
// pessoas, cada uma com metade dos pontos. O ImportWizard evita isso na entrada;
// aqui é o remédio para o que já está gravado.
//
// A novidade em relação ao modal antigo são as SUGESTÕES: o backend agrupa os
// nomes parecidos e a tela oferece o grupo pronto, em vez de obrigar o
// organizador a caçar as variações numa lista de 200 nomes. A lista de nomes
// também deixou de ser recalculada a cada render dentro de uma IIFE.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, CheckCircle2, GitMerge, Loader2, Sparkles, XCircle } from "lucide-react";
import { normalizarNome } from "@/shared/nomesCampeonato";

export interface MergeCompetitorsDialogProps {
  championshipId: number;
  /** Todos os nomes distintos do campeonato, já memoizados pela página. */
  nomes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MergeCompetitorsDialog({
  championshipId,
  nomes,
  open,
  onOpenChange,
}: MergeCompetitorsDialogProps) {
  const utils = trpc.useUtils();
  const [destino, setDestino] = useState("");
  const [origens, setOrigens] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const { data: sugestoes, isLoading: carregandoSugestoes } = trpc.championships.sugestoesUnificacao.useQuery(
    { championshipId },
    { enabled: open && championshipId > 0 },
  );

  const mergeMutation = trpc.championships.mergeCompetitors.useMutation({
    onSuccess: () => {
      toast.success("Competidores unificados!");
      setConfirmando(false);
      setDestino("");
      setOrigens([]);
      setBusca("");
      utils.championships.getStandings.invalidate({ championshipId });
      utils.championships.getStages.invalidate({ championshipId });
      utils.championships.sugestoesUnificacao.invalidate({ championshipId });
      onOpenChange(false);
    },
    onError: erro => toast.error(erro.message || "Erro ao unificar competidores"),
  });

  const nomesOrdenados = useMemo(() => [...(nomes || [])].sort((a, b) => a.localeCompare(b, "pt-BR")), [nomes]);

  const candidatos = useMemo(() => {
    const alvo = normalizarNome(busca);
    return nomesOrdenados.filter(n => n !== destino && (!alvo || normalizarNome(n).includes(alvo)));
  }, [nomesOrdenados, destino, busca]);

  const aplicarSugestao = (canonico: string, todos: string[]) => {
    setDestino(canonico);
    setOrigens(todos.filter(n => n !== canonico));
    setBusca("");
  };

  const alternar = (nome: string) => {
    setOrigens(prev => (prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Unificar competidores
            </DialogTitle>
            <DialogDescription>
              Junte variações do mesmo nome para consolidar os pontos na classificação.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6 pr-1">
            {/* --------------------------------------------- sugestões */}
            <div className="space-y-2">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Sugestões automáticas
              </Label>
              {carregandoSugestoes ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !sugestoes || sugestoes.length === 0 ? (
                <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
                  Nenhum grupo de nomes parecidos encontrado — a lista está limpa.
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {sugestoes.map(grupo => (
                    <button
                      key={grupo.canonico}
                      type="button"
                      onClick={() => aplicarSugestao(grupo.canonico, grupo.nomes)}
                      className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{grupo.canonico}</span>
                        <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">
                          {Math.round(grupo.semelhancaMinima * 100)}% parecido
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {grupo.nomes.filter(n => n !== grupo.canonico).join(", ")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* --------------------------------------------- nome principal */}
            <div className="space-y-2">
              <Label className="text-base font-bold text-primary">1. Nome principal (definitivo)</Label>
              <p className="text-xs text-muted-foreground">
                É o nome que ficará gravado em todos os resultados deste campeonato.
              </p>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o nome oficial..." />
                </SelectTrigger>
                <SelectContent>
                  {nomesOrdenados.map(nome => (
                    <SelectItem key={nome} value={nome}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* --------------------------------------------- nomes a unificar */}
            <div className="space-y-2">
              <Label className="text-base font-bold text-primary">2. Nomes para unificar</Label>
              <p className="text-xs text-muted-foreground">
                Estes nomes deixam de existir e seus pontos vão para o nome principal.
              </p>
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Filtrar nomes..."
                className="h-9"
              />
              <div className="border rounded-md divide-y max-h-[280px] overflow-y-auto bg-muted/5">
                {candidatos.map(nome => {
                  const marcado = origens.includes(nome);
                  return (
                    <div
                      key={nome}
                      className={cn(
                        "flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors",
                        marcado && "bg-primary/5",
                      )}
                      onClick={() => alternar(nome)}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                          marcado ? "bg-primary border-primary text-white" : "bg-transparent border-muted-foreground/30",
                        )}
                      >
                        {marcado && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-sm font-medium">{nome}</span>
                    </div>
                  );
                })}
                {candidatos.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground italic text-sm">
                    Nenhum nome disponível para unificar.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirmando(true)} disabled={!destino || origens.length === 0} className="gap-2">
              <GitMerge className="h-4 w-4" />
              Unificar {origens.length > 0 ? `(${origens.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar unificação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium text-foreground">Você está fundindo:</p>
                <div className="bg-muted/50 p-3 rounded border text-sm flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                  {origens.map(nome => (
                    <span key={nome} className="text-destructive font-bold flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      {nome}
                    </span>
                  ))}
                </div>
                <p className="text-center font-bold">⬇</p>
                <div className="bg-primary/10 p-3 rounded border border-primary/20 text-sm">
                  <span className="text-primary font-bold flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {destino}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Todos os resultados das etapas vinculados aos nomes acima passam a valer para o nome principal. A
                  classificação é reorganizada.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmando(false)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={() =>
                mergeMutation.mutate({ championshipId, targetName: destino, sourceNames: origens })
              }
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar unificação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
