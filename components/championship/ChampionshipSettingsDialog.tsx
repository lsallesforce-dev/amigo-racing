// Configurações do campeonato: identidade visual, regra de descarte e — novidade
// — a TABELA DE PONTOS.
//
// Até aqui a pontuação era a tabela da CBA cravada no código e congelada na
// gravação do resultado: cada campeonato do Amigo usa um regulamento próprio e
// não havia onde dizer isso. Agora o organizador escolhe um preset (ou monta a
// tabela posição por posição) e o cálculo acontece na leitura.
//
// O outro ganho é o `allowDiscardDisqualified`: antes UMA flag governava o
// descarte de quem FALTOU e de quem foi DESCLASSIFICADO. São decisões
// diferentes (faltar não é ser excluído), então viraram dois switches — com
// tooltip explicando a diferença, porque a distinção não é óbvia.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { compressImage } from "@/lib/imageCompression";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, HelpCircle, Loader2, Minus, Plus, Save, Trash2, Upload, X } from "lucide-react";
import {
  PRESETS_PONTUACAO,
  descreverTabela,
  normalizarTabela,
  resolverTabela,
  type IdPreset,
  type TabelaPontos,
} from "@/shared/pontuacaoCampeonato";

export interface ChampionshipSettingsDialogProps {
  championshipId: number;
  /** A linha do campeonato como vem do tRPC. */
  championship: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de excluir o campeonato — a página decide para onde ir. */
  onExcluido?: () => void;
}

interface FormularioConfig {
  name: string;
  discardRule: string;
  allowDiscardMissedStages: boolean;
  allowDiscardDisqualified: boolean;
  pointsPreset: IdPreset;
  pointsTable: TabelaPontos;
  sponsorBannerUrl: string;
  imageUrl: string;
}

/** Quantas posições a tabela custom mostra quando ainda não tem nada. */
const POSICOES_PADRAO = 10;

export default function ChampionshipSettingsDialog({
  championshipId,
  championship,
  open,
  onOpenChange,
  onExcluido,
}: ChampionshipSettingsDialogProps) {
  const utils = trpc.useUtils();
  const inputBanner = useRef<HTMLInputElement>(null);
  const inputLogo = useRef<HTMLInputElement>(null);
  const [subindoBanner, setSubindoBanner] = useState(false);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const [form, setForm] = useState<FormularioConfig>({
    name: "",
    discardRule: "0",
    allowDiscardMissedStages: true,
    allowDiscardDisqualified: false,
    pointsPreset: "regulamento",
    pointsTable: {},
    sponsorBannerUrl: "",
    imageUrl: "",
  });

  // O campeonato chega por query: o formulário só se sincroniza quando a linha
  // muda, senão o que o usuário está digitando é sobrescrito a cada refetch.
  useEffect(() => {
    if (!championship) return;
    const tabela = resolverTabela(championship.pointsPreset, championship.pointsTable);
    // Quem já tinha uma tabela até o 15º reabre o editor com 15 linhas.
    const maiorPosicao = Object.keys(tabela)
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 1)
      .reduce((maior, n) => Math.max(maior, n), 0);
    setQtdPosicoes(maiorPosicao || POSICOES_PADRAO);
    setForm({
      name: championship.name || "",
      discardRule: String(championship.discardRule ?? 0),
      allowDiscardMissedStages: championship.allowDiscardMissedStages ?? true,
      allowDiscardDisqualified: championship.allowDiscardDisqualified ?? false,
      pointsPreset: (championship.pointsPreset as IdPreset) || "regulamento",
      pointsTable: tabela,
      sponsorBannerUrl: championship.sponsorBannerUrl || "",
      imageUrl: championship.imageUrl || "",
    });
  }, [championship]);

  const uploadMutation = trpc.upload.image.useMutation();

  const updateMutation = trpc.championships.updateChampionship.useMutation({
    onSuccess: () => {
      toast.success("Campeonato atualizado!");
      onOpenChange(false);
      utils.championships.getAllByOrganizer.invalidate();
      utils.championships.getStandings.invalidate({ championshipId });
    },
    onError: erro => toast.error(erro.message || "Erro ao atualizar campeonato"),
  });

  const deleteMutation = trpc.championships.deleteChampionship.useMutation({
    onSuccess: () => {
      toast.success("Campeonato excluído permanentemente!");
      onExcluido?.();
    },
    onError: erro => toast.error(erro.message || "Erro ao excluir campeonato"),
  });

  const enviarImagem = async (
    evento: React.ChangeEvent<HTMLInputElement>,
    campo: "imageUrl" | "sponsorBannerUrl",
    prefixo: string,
    setLoading: (v: boolean) => void,
    ref: React.RefObject<HTMLInputElement>,
  ) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setLoading(true);
    try {
      const base64 = await compressImage(arquivo);
      const { url } = await uploadMutation.mutateAsync({
        base64,
        fileName: `${prefixo}_${arquivo.name}`,
        contentType: arquivo.type,
      });
      setForm(prev => ({ ...prev, [campo]: url }));
      toast.success("Imagem carregada!");
    } catch (erro) {
      console.error("Erro no upload:", erro);
      toast.error("Erro ao fazer upload da imagem.");
    } finally {
      setLoading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const presetSelecionado = useMemo(
    () => PRESETS_PONTUACAO.find(p => p.id === form.pointsPreset) || PRESETS_PONTUACAO[0],
    [form.pointsPreset],
  );

  // Quantas linhas o editor mostra. É ESTADO PRÓPRIO, não derivado das chaves da
  // tabela: campo vazio apaga a chave (para virar 0 na normalização), e derivar
  // daí fazia a linha SUMIR no meio da digitação, quando o usuário limpava o
  // campo para trocar o número.
  const [qtdPosicoes, setQtdPosicoes] = useState(POSICOES_PADRAO);

  const posicoesCustom = useMemo(
    () => Array.from({ length: qtdPosicoes }, (_, i) => i + 1),
    [qtdPosicoes],
  );

  const trocarPreset = (id: IdPreset) => {
    const preset = PRESETS_PONTUACAO.find(p => p.id === id);
    // Sair da CBA (15 posições) para "custom" tem que abrir o editor com as 15
    // linhas, não com as 10 do padrão.
    if (id === "custom") {
      const maior = Object.keys(form.pointsTable)
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 1)
        .reduce((m, n) => Math.max(m, n), 0);
      setQtdPosicoes(maior || POSICOES_PADRAO);
    }
    setForm(prev => ({
      ...prev,
      pointsPreset: id,
      // Ao entrar no custom a tabela atual vira o ponto de partida da edição —
      // ninguém quer recomeçar do zero.
      pointsTable: id === "custom" ? { ...prev.pointsTable } : { ...(preset?.tabela || {}) },
    }));
  };

  const definirPontos = (posicao: number, valor: string) => {
    setForm(prev => {
      const tabela = { ...prev.pointsTable };
      const numero = Number(valor);
      if (valor.trim() === "" || !Number.isFinite(numero) || numero < 0) delete tabela[posicao];
      else tabela[posicao] = numero;
      return { ...prev, pointsTable: tabela };
    });
  };

  const mudarQuantidadePosicoes = (delta: number) => {
    setQtdPosicoes(atual => {
      const proximo = Math.max(1, Math.min(40, atual + delta));
      // Encolher também joga fora os pontos das posições removidas, senão elas
      // voltariam a valer na normalização sem aparecer na tela.
      if (proximo < atual) {
        setForm(prev => {
          const tabela = { ...prev.pointsTable };
          for (let p = proximo + 1; p <= atual; p++) delete tabela[p];
          return { ...prev, pointsTable: tabela };
        });
      }
      return proximo;
    });
  };

  const salvar = () => {
    if (!form.name.trim()) {
      toast.error("O nome do campeonato é obrigatório");
      return;
    }
    updateMutation.mutate({
      id: championshipId,
      name: form.name.trim(),
      discardRule: parseInt(form.discardRule, 10),
      allowDiscardMissedStages: form.allowDiscardMissedStages,
      allowDiscardDisqualified: form.allowDiscardDisqualified,
      pointsPreset: form.pointsPreset,
      // `normalizarTabela` filtra o que o input deixou torto (vazio, negativo).
      pointsTable: form.pointsPreset === "custom" ? normalizarTabela(form.pointsTable) : undefined,
      sponsorBannerUrl: form.sponsorBannerUrl,
      imageUrl: form.imageUrl,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Configurações do campeonato</DialogTitle>
            <DialogDescription>Identidade, pontuação e regra de descarte.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 grid gap-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Nome do campeonato</Label>
              <Input
                id="editName"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* ------------------------------------------------ pontuação */}
            <div className="space-y-2">
              <Label htmlFor="preset">Tabela de pontos</Label>
              <Select value={form.pointsPreset} onValueChange={v => trocarPreset(v as IdPreset)}>
                <SelectTrigger id="preset">
                  <SelectValue placeholder="Escolha a pontuação" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS_PONTUACAO.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{presetSelecionado.descricao}</p>

              {form.pointsPreset !== "custom" && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Pontos do 1º em diante: </span>
                  <span className="font-mono">{descreverTabela(presetSelecionado.tabela, 15)}</span>
                </div>
              )}

              {form.pointsPreset === "custom" && (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Pontos por posição</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => mudarQuantidadePosicoes(-1)}
                        title="Remover a última posição"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs w-16 text-center tabular-nums">
                        até {posicoesCustom.length}º
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => mudarQuantidadePosicoes(1)}
                        title="Adicionar mais uma posição"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {posicoesCustom.map(posicao => (
                      <div key={posicao} className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground w-7 shrink-0 text-right">{posicao}º</span>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 px-2 text-sm"
                          value={form.pointsTable[posicao] ?? ""}
                          onChange={e => definirPontos(posicao, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Posição em branco vale 0. A pontuação é aplicada na leitura — mexer aqui recalcula o campeonato
                    inteiro, inclusive o que já estava gravado.
                  </p>
                </div>
              )}
            </div>

            {/* ------------------------------------------------ descarte */}
            <div className="space-y-2">
              <Label htmlFor="editDiscard">Regra de descarte (N-x)</Label>
              <Select
                value={form.discardRule}
                onValueChange={v => setForm(prev => ({ ...prev, discardRule: v }))}
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
            </div>

            <TooltipProvider>
              <div className="space-y-2">
                <ChaveComAjuda
                  id="allowDiscardMissedStages"
                  titulo="Descartar faltas (DNS)"
                  resumo="Quem não largou pode usar esse zero como um dos descartes."
                  ajuda="Ligado: a etapa que o competidor não correu conta como um dos piores resultados e pode ser descartada. Desligado: o descarte precisa cair numa etapa em que ele realmente participou — quem faltou perde a vantagem do descarte."
                  valor={form.allowDiscardMissedStages}
                  onChange={v => setForm(prev => ({ ...prev, allowDiscardMissedStages: v }))}
                />
                <ChaveComAjuda
                  id="allowDiscardDisqualified"
                  titulo="Descartar desclassificações (NC/DSQ)"
                  resumo="Quem foi excluído numa etapa pode descartar esse zero."
                  ajuda="Faltar e ser desclassificado são coisas diferentes. Desligado (padrão), a desclassificação fica marcada na classificação e não pode ser descartada — é a punição do regulamento."
                  valor={form.allowDiscardDisqualified}
                  onChange={v => setForm(prev => ({ ...prev, allowDiscardDisqualified: v }))}
                />
              </div>
            </TooltipProvider>

            {/* ------------------------------------------------ imagens */}
            <div className="space-y-2">
              <Label>Logo do campeonato (topo esquerdo do PDF)</Label>
              <div className="flex items-center gap-4">
                {form.imageUrl ? (
                  <div className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted">
                    <img src={form.imageUrl} alt="Logo do campeonato" className="w-full h-full object-contain" />
                    <button
                      onClick={() => setForm(prev => ({ ...prev, imageUrl: "" }))}
                      className="absolute top-0.5 right-0.5 bg-background/80 hover:bg-destructive hover:text-white text-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remover logo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => inputLogo.current?.click()}
                    className="w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {subindoLogo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-[10px] font-medium">Logo</span>
                  </div>
                )}
                <div className="flex-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Escudo oficial</p>
                  <p>Aparece no cabeçalho do PDF de classificação.</p>
                </div>
                <input
                  ref={inputLogo}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subindoLogo}
                  onChange={e => enviarImagem(e, "imageUrl", "logo", setSubindoLogo, inputLogo)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Banner de patrocinadores (rodapé do PDF)</Label>
              {form.sponsorBannerUrl ? (
                <div className="relative group rounded-lg overflow-hidden border bg-muted aspect-[5/1]">
                  <img
                    src={form.sponsorBannerUrl}
                    alt="Banner de patrocinadores"
                    className="w-full h-full object-contain"
                  />
                  <button
                    onClick={() => setForm(prev => ({ ...prev, sponsorBannerUrl: "" }))}
                    className="absolute top-1 right-1 bg-background/80 hover:bg-destructive hover:text-white text-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remover banner"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => inputBanner.current?.click()}
                  className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="bg-primary/10 p-2 rounded-full">
                    {subindoBanner ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Clique para fazer upload</p>
                    <p className="text-xs text-muted-foreground mt-1">Recomendado: 1920x200px</p>
                  </div>
                </div>
              )}
              <input
                ref={inputBanner}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subindoBanner}
                onChange={e => enviarImagem(e, "sponsorBannerUrl", "banner", setSubindoBanner, inputBanner)}
              />
            </div>

            <div className="pt-4 border-t border-destructive/20">
              <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4" /> Zona de perigo
              </h4>
              <Button variant="destructive" className="w-full gap-2" onClick={() => setConfirmarExclusao(true)}>
                <Trash2 className="h-4 w-4" />
                Excluir campeonato inteiro
              </Button>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campeonato permanentemente?</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive font-bold">
              Isso apaga o campeonato inteiro, todas as etapas e as classificações vinculadas. Não tem volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmarExclusao(false)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: championshipId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Sim, excluir tudo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChaveComAjuda({
  id,
  titulo,
  resumo,
  ajuda,
  valor,
  onChange,
}: {
  id: string;
  titulo: string;
  resumo: string;
  ajuda: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3 border rounded-lg px-4 bg-muted/20")}>
      <div className="flex flex-col space-y-0.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="cursor-pointer">
            {titulo}
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              <p>{ajuda}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-[10px] text-muted-foreground text-balance">{resumo}</p>
      </div>
      <Switch id={id} checked={valor} onCheckedChange={onChange} />
    </div>
  );
}
