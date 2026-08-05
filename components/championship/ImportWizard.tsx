// Importação de planilha de campeonato, em passos.
//
// O que existia era um modal de CSV que lia o arquivo COMO TEXTO no browser,
// exigia uma coluna "POS ETAPA n" e gravava direto. Com as planilhas que o
// organizador usa de verdade (.xlsx, uma aba por categoria, formato longo) ele
// terminava com zero linhas importadas e nenhuma explicação.
//
// Aqui o arquivo vai inteiro (base64) para o servidor, que responde com uma
// PRÉVIA — o `xlsx` não entra no bundle do cliente de propósito: a página já
// carrega 2.18 MB. Nada é gravado até o último passo.
//
// O passo 4 é o pedido explícito do usuário: "carrego o primeiro rally, aquele
// pega o nome dos competidores; quando eu enviar outra planilha aparece um popup
// perguntando se aquele nome é o mesmo desse". Na 2ª planilha real dele são 12
// dúvidas de uma vez — por isso existem os botões de resposta em LOTE.

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Aviso, ResumoAba, TipoAviso } from "@/shared/importarPlanilhaCampeonato";

// ------------------------------------------------------------------ contratos
//
// Tipados aqui (e não inferidos do tRPC) porque o wizard guarda a prévia em
// estado por vários passos — o estado precisa de um nome próprio.

export interface DuvidaConciliacao {
  novo: string;
  candidatos: { nome: string; similaridade: number }[];
}

export interface PreviaImportacao {
  etapas: number[];
  abas: ResumoAba[];
  avisos: Aviso[];
  resumo: { categoria: string; stageNumber: number; duplas: number }[];
  conciliacao: {
    automaticos: { novo: string; canonico: string; motivo: string }[];
    duvidas: DuvidaConciliacao[];
    ineditos: string[];
  };
  etapasExistentes: { id: number; stageNumber: number; nome: string }[];
  categoriasExistentes: string[];
}

export interface ImportWizardProps {
  championshipId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de gravar, para a página invalidar o que precisar. */
  onImportado?: () => void;
}

type ModoEtapa = "existente" | "evento" | "nova";

interface DestinoEtapa {
  modo: ModoEtapa;
  stageId?: number;
  eventId?: number;
  customName: string;
}

/** `null` = "é outra pessoa". String = nome canônico escolhido. Ausente = sem resposta. */
type Respostas = Record<string, string | null>;

// ------------------------------------------------------------------ avisos

/** Aviso que impede a importação de dar certo vs. aviso que só pede conferência. */
const AVISOS_GRAVES: TipoAviso[] = ["layout_desconhecido", "sem_coluna_etapa", "aba_vazia"];
const AVISOS_ATENCAO: TipoAviso[] = [
  "posicao_duplicada",
  "buraco_na_sequencia",
  "divergencia_dupla",
  "categoria_divergente",
  "navegador_sem_piloto",
];

function severidade(aviso: Aviso): "grave" | "atencao" | "info" {
  if (AVISOS_GRAVES.includes(aviso.tipo)) return "grave";
  if (AVISOS_ATENCAO.includes(aviso.tipo)) return "atencao";
  return "info";
}

const ESTILO_AVISO = {
  grave: "border-destructive/30 bg-destructive/5 text-destructive",
  atencao: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  info: "border-border bg-muted/30 text-muted-foreground",
} as const;

// ------------------------------------------------------------------ passos

const TITULOS_PASSO: Record<number, string> = {
  1: "Arquivo",
  2: "Conferência",
  3: "Etapas",
  4: "Nomes",
  5: "Confirmar",
};

export default function ImportWizard({ championshipId, open, onOpenChange, onImportado }: ImportWizardProps) {
  const utils = trpc.useUtils();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [passo, setPasso] = useState(1);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [destinos, setDestinos] = useState<Record<number, DestinoEtapa>>({});
  const [respostas, setRespostas] = useState<Respostas>({});
  const [automaticosAbertos, setAutomaticosAbertos] = useState(false);
  const [criandoEtapas, setCriandoEtapas] = useState(false);

  const { data: meusEventos } = trpc.events.myEvents.useQuery(undefined, { enabled: open });

  const previewMutation = trpc.championships.previewImport.useMutation();
  const importMutation = trpc.championships.importWorkbook.useMutation();
  const addStageMutation = trpc.championships.addStage.useMutation();

  const duvidas = previa?.conciliacao?.duvidas || [];
  const temDuvidas = duvidas.length > 0;

  // Sem dúvida nenhuma o passo 4 não existe — não faz sentido mostrar uma tela
  // vazia só para o usuário clicar "Avançar".
  const passosVisiveis = useMemo(() => (temDuvidas ? [1, 2, 3, 4, 5] : [1, 2, 3, 5]), [temDuvidas]);

  const respondidas = duvidas.filter(d => d.novo in respostas).length;
  const faltamRespostas = duvidas.length - respondidas;

  const resetar = () => {
    setPasso(1);
    setNomeArquivo("");
    setArquivoBase64("");
    setPrevia(null);
    setDestinos({});
    setRespostas({});
    setAutomaticosAbertos(false);
    if (inputArquivo.current) inputArquivo.current.value = "";
  };

  const fechar = (aberto: boolean) => {
    if (!aberto) resetar();
    onOpenChange(aberto);
  };

  // ---------------------------------------------------------------- passo 1

  const processarArquivo = async (arquivo: File) => {
    const extensao = arquivo.name.toLowerCase().split(".").pop() || "";
    if (!["xlsx", "xls", "csv"].includes(extensao)) {
      toast.error("Formato não suportado. Envie .xlsx, .xls ou .csv.");
      return;
    }

    setLendoArquivo(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result || ""));
        leitor.onerror = () => reject(new Error("Não consegui ler o arquivo"));
        leitor.readAsDataURL(arquivo);
      });
      // O servidor quer só o base64; o prefixo "data:...;base64," fica aqui.
      const base64 = dataUri.includes(",") ? dataUri.slice(dataUri.indexOf(",") + 1) : dataUri;

      const resultado = await previewMutation.mutateAsync({
        championshipId,
        arquivoBase64: base64,
        nomeArquivo: arquivo.name,
      });

      // Único ponto de conversão entre o tipo inferido do tRPC e o tipo local do
      // wizard — o resto do componente trabalha com `PreviaImportacao`.
      const prev = resultado as unknown as PreviaImportacao;

      setArquivoBase64(base64);
      setNomeArquivo(arquivo.name);
      setPrevia(prev);
      setRespostas({});

      // Pré-seleção do passo 3: ETAPA-N cai na etapa de mesmo número que já
      // existe no campeonato. É o caso normal — a planilha acumula as etapas.
      const iniciais: Record<number, DestinoEtapa> = {};
      for (const numero of prev.etapas || []) {
        const existente = (prev.etapasExistentes || []).find(e => e.stageNumber === numero);
        iniciais[numero] = existente
          ? { modo: "existente", stageId: existente.id, customName: existente.nome }
          : { modo: "nova", customName: `${numero}ª Etapa` };
      }
      setDestinos(iniciais);
      setPasso(2);
    } catch (erro: any) {
      toast.error(erro?.message || "Não consegui ler a planilha.");
    } finally {
      setLendoArquivo(false);
    }
  };

  // ---------------------------------------------------------------- passo 3

  const atualizarDestino = (numero: number, mudanca: Partial<DestinoEtapa>) => {
    setDestinos(prev => ({ ...prev, [numero]: { ...prev[numero], ...mudanca } }));
  };

  const etapasIncompletas = (previa?.etapas || []).filter(numero => {
    const destino = destinos[numero];
    if (!destino) return true;
    if (destino.modo === "existente") return !destino.stageId;
    if (destino.modo === "evento") return !destino.eventId;
    return !destino.customName.trim();
  });

  // ---------------------------------------------------------------- passo 5

  const confirmar = async () => {
    if (!previa) return;

    try {
      // Etapa "vinculada a um evento da plataforma" não existe no contrato do
      // importWorkbook (que só aceita stageId ou customName). Então a etapa é
      // criada ANTES, com o addStage de sempre, e entra na importação já como id.
      setCriandoEtapas(true);
      const mapaEtapas: { stageNumber: number; stageId?: number; customName?: string }[] = [];
      for (const numero of previa.etapas) {
        const destino = destinos[numero];
        if (destino?.modo === "existente" && destino.stageId) {
          mapaEtapas.push({ stageNumber: numero, stageId: destino.stageId });
        } else if (destino?.modo === "evento" && destino.eventId) {
          const criada = await addStageMutation.mutateAsync({
            championshipId,
            eventId: destino.eventId,
            stageNumber: numero,
          });
          mapaEtapas.push({ stageNumber: numero, stageId: criada.id });
        } else {
          mapaEtapas.push({ stageNumber: numero, customName: destino?.customName?.trim() || `${numero}ª Etapa` });
        }
      }
      setCriandoEtapas(false);

      const decisoes = Object.entries(respostas).map(([novo, canonico]) => ({ novo, canonico }));

      const resultado = await importMutation.mutateAsync({
        championshipId,
        arquivoBase64,
        nomeArquivo,
        decisoes,
        mapaEtapas,
      });

      toast.success(
        `${resultado.resultadosGravados} resultado(s) gravado(s) em ${resultado.categorias.length} categoria(s).` +
          (resultado.etapasCriadas ? ` ${resultado.etapasCriadas} etapa(s) criada(s).` : ""),
      );

      utils.championships.getStages.invalidate({ championshipId });
      utils.championships.getStandings.invalidate({ championshipId });
      onImportado?.();
      fechar(false);
    } catch (erro: any) {
      setCriandoEtapas(false);
      toast.error(erro?.message || "Erro ao importar a planilha.");
    }
  };

  // ---------------------------------------------------------------- navegação

  const indiceAtual = passosVisiveis.indexOf(passo);
  const irPara = (delta: number) => {
    const proximo = passosVisiveis[indiceAtual + delta];
    if (proximo) setPasso(proximo);
  };

  const podeAvancar = () => {
    if (passo === 2) return !!previa && previa.etapas.length > 0;
    if (passo === 3) return etapasIncompletas.length === 0;
    if (passo === 4) return faltamRespostas === 0;
    return true;
  };

  const gravando = importMutation.isPending || criandoEtapas;

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar planilha de resultados
          </DialogTitle>
          <DialogDescription>
            A planilha é lida no servidor e nada é gravado até você confirmar no último passo.
          </DialogDescription>
        </DialogHeader>

        {/* Trilha dos passos */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {passosVisiveis.map((numero, idx) => (
            <div key={numero} className="flex items-center gap-1 shrink-0">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  numero === passo
                    ? "bg-primary text-primary-foreground"
                    : idx < indiceAtual
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {idx < indiceAtual ? <Check className="h-3 w-3" /> : <span>{idx + 1}</span>}
                {TITULOS_PASSO[numero]}
              </div>
              {idx < passosVisiveis.length - 1 && <div className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2 pr-1">
          {/* ------------------------------------------------ passo 1: arquivo */}
          {passo === 1 && (
            <div className="space-y-4">
              <div
                onClick={() => inputArquivo.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => {
                  e.preventDefault();
                  setArrastando(false);
                  const arquivo = e.dataTransfer.files?.[0];
                  if (arquivo) processarArquivo(arquivo);
                }}
                className={cn(
                  "border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
                  arrastando ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <div className="bg-primary/10 p-3 rounded-full">
                  {lendoArquivo ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-medium">
                    {lendoArquivo ? "Lendo a planilha..." : "Arraste a planilha aqui ou clique para escolher"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Aceita .xlsx, .xls e .csv</p>
                </div>
                {nomeArquivo && !lendoArquivo && (
                  <Badge variant="secondary" className="mt-2">
                    {nomeArquivo}
                  </Badge>
                )}
              </div>
              <input
                ref={inputArquivo}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) processarArquivo(arquivo);
                }}
              />
              <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground">O que a planilha precisa ter</p>
                <p>
                  Uma coluna por etapa, com o cabeçalho <strong>ETAPA-1</strong>, <strong>ETAPA-2</strong>… (ou "POS
                  ETAPA 1").
                </p>
                <p>
                  Os competidores em <strong>NOME</strong> + <strong>FUNÇÃO</strong> (Piloto/Navegador), ou em{" "}
                  <strong>NOME PILOTO</strong> + <strong>NOME NAVEGADOR</strong>.
                </p>
                <p>Uma aba por categoria — ou uma coluna CATEGORIA. Os dois formatos funcionam.</p>
              </div>
            </div>
          )}

          {/* -------------------------------------------- passo 2: conferência */}
          {passo === 2 && previa && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Painel titulo="Abas" valor={previa.abas.length} />
                <Painel titulo="Etapas" valor={previa.etapas.length} />
                <Painel
                  titulo="Categorias"
                  valor={new Set(previa.abas.map(a => a.categoria)).size}
                />
                <Painel titulo="Avisos" valor={previa.avisos.length} alerta={previa.avisos.length > 0} />
              </div>

              <div>
                <Label className="text-sm font-bold">Abas detectadas</Label>
                <div className="rounded-md border mt-2 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs">Aba</TableHead>
                        <TableHead className="text-xs">Categoria</TableHead>
                        <TableHead className="text-xs">Formato</TableHead>
                        <TableHead className="text-xs text-center">Duplas</TableHead>
                        <TableHead className="text-xs">Etapas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previa.abas.map(aba => (
                        <TableRow key={aba.nome}>
                          <TableCell className="text-sm font-medium">{aba.nome}</TableCell>
                          <TableCell className="text-sm">{aba.categoria}</TableCell>
                          <TableCell>
                            <Badge
                              variant={aba.layout === "desconhecido" ? "destructive" : "secondary"}
                              className="text-[10px] uppercase"
                            >
                              {aba.layout}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">{aba.duplas}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {aba.etapas.length ? aba.etapas.map(n => `E${n}`).join(", ") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {previa.resumo.length > 0 && (
                <div>
                  <Label className="text-sm font-bold">O que será gravado</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {previa.resumo.map(item => (
                      <Badge key={`${item.categoria}-${item.stageNumber}`} variant="outline" className="text-[11px]">
                        E{item.stageNumber} · {item.categoria} · {item.duplas} dupla(s)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {previa.avisos.length > 0 && (
                <div>
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Avisos da leitura
                  </Label>
                  <div className="space-y-1.5 mt-2 max-h-[240px] overflow-y-auto pr-1">
                    {previa.avisos.map((aviso, idx) => {
                      const nivel = severidade(aviso);
                      return (
                        <div
                          key={idx}
                          className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", ESTILO_AVISO[nivel])}
                        >
                          <div className="flex gap-2">
                            {nivel === "info" ? (
                              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p>{aviso.mensagem}</p>
                              {aviso.sugestao && (
                                <p className="mt-1 opacity-80">
                                  Sugestão: usar <strong>{aviso.sugestao}</strong>.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------- passo 3: etapas */}
          {passo === 3 && previa && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cada coluna <strong>ETAPA-N</strong> da planilha precisa saber onde vai cair no campeonato.
              </p>
              {previa.etapas.map(numero => {
                const destino = destinos[numero] || { modo: "nova" as ModoEtapa, customName: `${numero}ª Etapa` };
                return (
                  <div key={numero} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs">ETAPA-{numero}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {previa.resumo
                          .filter(r => r.stageNumber === numero)
                          .reduce((soma, r) => soma + r.duplas, 0)}{" "}
                        dupla(s) na planilha
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <BotaoModo
                        ativo={destino.modo === "existente"}
                        onClick={() => atualizarDestino(numero, { modo: "existente" })}
                        disabled={previa.etapasExistentes.length === 0}
                      >
                        Etapa existente
                      </BotaoModo>
                      <BotaoModo
                        ativo={destino.modo === "evento"}
                        onClick={() => atualizarDestino(numero, { modo: "evento" })}
                      >
                        Evento da plataforma
                      </BotaoModo>
                      <BotaoModo
                        ativo={destino.modo === "nova"}
                        onClick={() => atualizarDestino(numero, { modo: "nova" })}
                      >
                        Prova externa
                      </BotaoModo>
                    </div>

                    {destino.modo === "existente" && (
                      <Select
                        value={destino.stageId ? String(destino.stageId) : ""}
                        onValueChange={v => atualizarDestino(numero, { stageId: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha a etapa já cadastrada" />
                        </SelectTrigger>
                        <SelectContent>
                          {previa.etapasExistentes.map(etapa => (
                            <SelectItem key={etapa.id} value={String(etapa.id)}>
                              {etapa.stageNumber}ª — {etapa.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {destino.modo === "evento" && (
                      <Select
                        value={destino.eventId ? String(destino.eventId) : ""}
                        onValueChange={v => atualizarDestino(numero, { eventId: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha o evento da plataforma" />
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
                    )}

                    {destino.modo === "nova" && (
                      <Input
                        value={destino.customName}
                        onChange={e => atualizarDestino(numero, { customName: e.target.value })}
                        placeholder="Ex.: 7º Rally do Cavalo"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* -------------------------------------------- passo 4: conciliação */}
          {passo === 4 && previa && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm">
                  Estes nomes da planilha <strong>parecem</strong> com nomes que o campeonato já tem. Se for a mesma
                  pessoa, os pontos vão para o mesmo competidor.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  A resposta fica guardada — na próxima planilha o sistema não pergunta de novo.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs font-medium">
                    {respondidas} de {duvidas.length} respondida(s)
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setRespostas(prev => {
                        const copia = { ...prev };
                        for (const d of duvidas) if (!(d.novo in copia)) copia[d.novo] = d.candidatos[0]?.nome ?? null;
                        return copia;
                      })
                    }
                  >
                    Aceitar o mais parecido nos que faltam
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setRespostas(prev => {
                        const copia = { ...prev };
                        for (const d of duvidas) if (!(d.novo in copia)) copia[d.novo] = null;
                        return copia;
                      })
                    }
                  >
                    São todas pessoas diferentes
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRespostas({})}>
                    Limpar
                  </Button>
                </div>
              </div>

              {duvidas.map(duvida => {
                const resposta = duvida.novo in respostas ? respostas[duvida.novo] : undefined;
                return (
                  <div
                    key={duvida.novo}
                    className={cn(
                      "rounded-lg border p-4 space-y-3 transition-colors",
                      resposta !== undefined && "border-primary/30 bg-primary/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold">{duvida.novo}</span>
                      <span className="text-xs text-muted-foreground">(nome da planilha nova)</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {duvida.candidatos.map(candidato => {
                        const escolhido = resposta === candidato.nome;
                        return (
                          <button
                            key={candidato.nome}
                            type="button"
                            onClick={() => setRespostas(prev => ({ ...prev, [duvida.novo]: candidato.nome }))}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                              escolhido
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-muted/60 border-border",
                            )}
                          >
                            {escolhido ? <CheckCircle2 className="h-4 w-4" /> : <Check className="h-4 w-4 opacity-30" />}
                            <span className="font-medium">É o mesmo: {candidato.nome}</span>
                            <Badge
                              variant={escolhido ? "secondary" : "outline"}
                              className="text-[10px] tabular-nums"
                              title="Semelhança calculada entre os dois nomes"
                            >
                              {Math.round(candidato.similaridade * 100)}%
                            </Badge>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setRespostas(prev => ({ ...prev, [duvida.novo]: null }))}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                          resposta === null
                            ? "border-destructive bg-destructive text-destructive-foreground"
                            : "hover:bg-muted/60 border-border",
                        )}
                      >
                        <X className="h-4 w-4" />É outra pessoa
                      </button>
                    </div>
                  </div>
                );
              })}

              {previa.conciliacao.automaticos.length > 0 && (
                <div className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setAutomaticosAbertos(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/40 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {previa.conciliacao.automaticos.length} nome(s) reconhecido(s) automaticamente
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", automaticosAbertos && "rotate-180")} />
                  </button>
                  {automaticosAbertos && (
                    <div className="border-t px-4 py-3 max-h-[200px] overflow-y-auto text-xs space-y-1">
                      {previa.conciliacao.automaticos.map(item => (
                        <div key={item.novo} className="flex items-center gap-2">
                          <span className="text-muted-foreground">{item.novo}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                          <span className="font-medium">{item.canonico}</span>
                          <Badge variant="outline" className="text-[9px] uppercase">
                            {item.motivo}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {previa.conciliacao.ineditos.length > 0 && (
                <div className="rounded-lg border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    {previa.conciliacao.ineditos.length} competidor(es) novo(s)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{previa.conciliacao.ineditos.join(", ")}</p>
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------- passo 5: confirmar */}
          {passo === 5 && previa && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-bold">Etapas</p>
                {previa.etapas.map(numero => {
                  const destino = destinos[numero];
                  const rotulo =
                    destino?.modo === "existente"
                      ? previa.etapasExistentes.find(e => e.id === destino.stageId)?.nome || "etapa existente"
                      : destino?.modo === "evento"
                        ? (meusEventos || []).find((e: any) => e.id === destino.eventId)?.name || "evento da plataforma"
                        : destino?.customName;
                  return (
                    <div key={numero} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">
                        ETAPA-{numero}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{rotulo}</span>
                      {destino?.modo !== "existente" && (
                        <Badge variant="secondary" className="text-[9px] uppercase">
                          nova
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-bold">Resultados</p>
                <div className="flex flex-wrap gap-2">
                  {previa.resumo.map(item => (
                    <Badge key={`${item.categoria}-${item.stageNumber}`} variant="outline" className="text-[11px]">
                      E{item.stageNumber} · {item.categoria} · {item.duplas}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {previa.resumo.reduce((soma, r) => soma + r.duplas, 0)} dupla(s) em{" "}
                  {new Set(previa.resumo.map(r => r.categoria)).size} categoria(s).
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-1 text-sm">
                <p className="font-bold">Nomes</p>
                <p className="text-muted-foreground text-xs">
                  {previa.conciliacao.automaticos.length} reconhecido(s) automaticamente ·{" "}
                  {Object.values(respostas).filter(v => v !== null).length} unificado(s) por você ·{" "}
                  {previa.conciliacao.ineditos.length + Object.values(respostas).filter(v => v === null).length} novo(s).
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                Os resultados das etapas acima serão <strong>substituídos</strong> pelo conteúdo da planilha e a
                classificação é recalculada na hora. Reimportar o mesmo arquivo é seguro: a etapa de mesmo número é
                reaproveitada, não duplicada.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 pt-4 border-t gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => fechar(false)} disabled={gravando}>
            Cancelar
          </Button>
          <div className="flex items-center gap-2">
            {passo !== 1 && (
              <Button variant="outline" onClick={() => irPara(-1)} disabled={gravando} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )}
            {passo !== 5 ? (
              <Button onClick={() => irPara(1)} disabled={passo === 1 || !podeAvancar()} className="gap-2">
                Avançar
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={confirmar} disabled={gravando} className="gap-2">
                {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {gravando ? "Importando..." : "Importar resultados"}
              </Button>
            )}
          </div>
        </DialogFooter>

        {passo === 3 && etapasIncompletas.length > 0 && (
          <p className="text-xs text-destructive -mt-2">
            Falta escolher o destino da(s) etapa(s) {etapasIncompletas.map(n => `ETAPA-${n}`).join(", ")}.
          </p>
        )}
        {passo === 4 && faltamRespostas > 0 && (
          <p className="text-xs text-destructive -mt-2">
            Falta(m) {faltamRespostas} resposta(s) — use os botões de lote se forem todas iguais.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Painel({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", alerta && "border-amber-500/30 bg-amber-500/5")}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  );
}

function BotaoModo({
  ativo,
  onClick,
  disabled,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        ativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}
