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
// ⚠️ MUDANÇA DE MODELO (correção do incidente real): cada arquivo
// `Campeonato - <rally>.xlsx` é UM EVENTO, e as colunas ETAPA-1/ETAPA-2 da
// planilha são as PROVAS daquele evento (não etapas de eventos diferentes). O
// wizard antigo perguntava, ETAPA por ETAPA, "isso é etapa de qual evento?" —
// isso deixava o organizador espalhar as duas provas do MESMO arquivo em
// eventos diferentes, e foi exatamente isso que colapsou a tabela em produção
// (duas colunas "E1", duas "E2", dado de um arquivo caindo nas provas do
// outro). Agora se pergunta o EVENTO uma vez só, para o arquivo inteiro, e as
// provas (P1, P2, ...) entram como provas DESSE evento — não existe mais
// mapear prova a prova.
//
// O passo 4 é o pedido explícito do usuário: "carrego o primeiro rally, aquele
// pega o nome dos competidores; quando eu enviar outra planilha aparece um popup
// perguntando se aquele nome é o mesmo desse". Na 2ª planilha real dele são 12
// dúvidas de uma vez — por isso existem os botões de resposta em LOTE. E agora,
// quando o candidato tem o MESMO E-MAIL do competidor já cadastrado, ele vem
// destacado e em primeiro — é o que liga apelido a nome completo (o texto puro
// nunca pega "Benê" -> "Benedito Lopes").
//
// O passo 3 (Evento) também deixa escolher QUAIS provas do arquivo entram —
// pedido real: a planilha já tem a coluna ETAPA-2, mas a prova 2 ainda não
// rodou, e ele quer importar só a P1 agora. Padrão é todas marcadas; a chave
// evento+prova no backend garante que importar a P2 depois não duplica nada.

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
import { Checkbox } from "@/components/ui/checkbox";
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
  Mail,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Aviso, ResumoAba, TipoAviso } from "@/shared/importarPlanilhaCampeonato";

// ------------------------------------------------------------------ contratos
//
// Tipados aqui (e não inferidos do tRPC) porque o wizard guarda a prévia em
// estado por vários passos — o estado precisa de um nome próprio. Espelham o
// contrato novo do backend (mapaEtapas morreu, entra `evento` — um por
// arquivo).

export interface CandidatoConciliacao {
  nome: string;
  similaridade: number;
  /** Mesmo e-mail do cadastro — a dica mais forte que existe, mas NÃO decide sozinha:
   *  nestas planilhas o e-mail é da DUPLA, não da pessoa (piloto e navegador dividem
   *  o mesmo contato). Continua exigindo confirmação humana. */
  mesmoEmail: boolean;
}

export interface DuvidaConciliacao {
  novo: string;
  papel: "pilot" | "navigator" | null;
  candidatos: CandidatoConciliacao[];
}

export interface ProvaPrevia {
  provaNumber: number;
  duplas: number;
  categorias: string[];
}

export interface EventoDoCampeonato {
  chave: string;
  nome: string;
  eventId: number | null;
  provas: { stageId: number; provaNumber: number }[];
}

export interface EventoDaPlataforma {
  id: number;
  name: string;
}

export interface PreviaImportacao {
  eventoSugerido: { nome: string; eventId: number | null };
  provas: ProvaPrevia[];
  abas: ResumoAba[];
  avisos: Aviso[];
  conciliacao: {
    automaticos: { novo: string; canonico: string; motivo: string }[];
    duvidas: DuvidaConciliacao[];
    ineditos: string[];
  };
  eventosDoCampeonato: EventoDoCampeonato[];
  eventosDaPlataforma: EventoDaPlataforma[];
  categoriasExistentes: string[];
}

export interface ImportWizardProps {
  championshipId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de gravar, para a página invalidar o que precisar. */
  onImportado?: () => void;
}

type ModoEvento = "plataforma" | "existente" | "novo";

interface EscolhaEvento {
  modo: ModoEvento;
  /** modo "plataforma": id do evento da plataforma a vincular. */
  eventId?: number;
  /** modo "existente": chave do evento já presente no campeonato (ver eventosDoCampeonato). */
  chaveExistente?: string;
  /** modo "novo": nome livre do evento a criar. */
  nome: string;
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

const ROTULO_PAPEL: Record<"pilot" | "navigator", string> = {
  pilot: "Piloto",
  navigator: "Navegador",
};

// ------------------------------------------------------------------ passos

const TITULOS_PASSO: Record<number, string> = {
  1: "Arquivo",
  2: "Conferência",
  3: "Evento",
  4: "Conciliação",
  5: "Confirmar",
};

export default function ImportWizard({ championshipId, open, onOpenChange, onImportado }: ImportWizardProps) {
  const utils = trpc.useUtils();
  const inputArquivo = useRef<HTMLInputElement>(null);
  // Trava de duplo-submit: a duplicação em produção veio de o botão "Importar"
  // aceitar dois cliques antes do primeiro re-render marcar a mutation como
  // pendente. Um ref é síncrono — o segundo clique é barrado na hora, sem
  // esperar o React processar o `isPending`.
  const enviandoRef = useRef(false);

  const [passo, setPasso] = useState(1);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [escolhaEvento, setEscolhaEvento] = useState<EscolhaEvento>({ modo: "novo", nome: "" });
  // Quais provas do arquivo entram nesta importação. Padrão = todas — o
  // organizador só desmarca quando quer importar parcial (ex.: a prova 2 ainda
  // não rodou).
  const [provasSelecionadas, setProvasSelecionadas] = useState<Set<number>>(new Set());
  const [respostas, setRespostas] = useState<Respostas>({});
  const [automaticosAbertos, setAutomaticosAbertos] = useState(false);

  const previewMutation = trpc.championships.previewImport.useMutation();
  const importMutation = trpc.championships.importWorkbook.useMutation();

  const duvidas = previa?.conciliacao?.duvidas || [];
  const temDuvidas = duvidas.length > 0;

  // Sem dúvida nenhuma o passo de conciliação não existe — não faz sentido
  // mostrar uma tela vazia só para o usuário clicar "Avançar".
  const passosVisiveis = useMemo(() => (temDuvidas ? [1, 2, 3, 4, 5] : [1, 2, 3, 5]), [temDuvidas]);

  const respondidas = duvidas.filter(d => d.novo in respostas).length;
  const faltamRespostas = duvidas.length - respondidas;

  const resetar = () => {
    setPasso(1);
    setNomeArquivo("");
    setArquivoBase64("");
    setPrevia(null);
    setEscolhaEvento({ modo: "novo", nome: "" });
    setProvasSelecionadas(new Set());
    setRespostas({});
    setAutomaticosAbertos(false);
    enviandoRef.current = false;
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
      // Padrão: todas as provas do arquivo marcadas para importar.
      setProvasSelecionadas(new Set((prev.provas || []).map(p => p.provaNumber)));

      // Pré-seleção do passo 3 (Evento): se o backend já sugeriu um evento da
      // plataforma (nome bate com um evento existente), pré-marca "plataforma"
      // com ele; senão cai em "novo" com o nome sugerido — que é o normal para
      // planilha de rally externo.
      if (prev.eventoSugerido.eventId) {
        setEscolhaEvento({ modo: "plataforma", eventId: prev.eventoSugerido.eventId, nome: prev.eventoSugerido.nome });
      } else {
        setEscolhaEvento({ modo: "novo", nome: prev.eventoSugerido.nome });
      }
      setPasso(2);
    } catch (erro: any) {
      toast.error(erro?.message || "Não consegui ler a planilha.");
    } finally {
      setLendoArquivo(false);
    }
  };

  // ---------------------------------------------------------------- passo 3

  const eventoCompleto = useMemo(() => {
    if (escolhaEvento.modo === "plataforma") return !!escolhaEvento.eventId;
    if (escolhaEvento.modo === "existente") return !!escolhaEvento.chaveExistente;
    return !!escolhaEvento.nome.trim();
  }, [escolhaEvento]);

  const eventoExistenteEscolhido = useMemo(
    () => previa?.eventosDoCampeonato.find(e => e.chave === escolhaEvento.chaveExistente),
    [previa, escolhaEvento.chaveExistente],
  );

  const alternarProva = (provaNumber: number) => {
    setProvasSelecionadas(prev => {
      const copia = new Set(prev);
      if (copia.has(provaNumber)) copia.delete(provaNumber);
      else copia.add(provaNumber);
      return copia;
    });
  };

  const marcarTodasAsProvas = () => setProvasSelecionadas(new Set((previa?.provas || []).map(p => p.provaNumber)));
  const desmarcarTodasAsProvas = () => setProvasSelecionadas(new Set());

  // ---------------------------------------------------------------- passo 5

  const confirmar = async () => {
    if (!previa || enviandoRef.current) return;
    enviandoRef.current = true;

    try {
      // Monta o `evento` do jeito que o novo contrato espera: OU um eventId
      // (evento da plataforma, seja ele novo vínculo ou já usado no campeonato),
      // OU um nome livre (evento externo, sem cadastro na plataforma).
      const evento =
        escolhaEvento.modo === "plataforma"
          ? { eventId: escolhaEvento.eventId }
          : escolhaEvento.modo === "existente"
            ? eventoExistenteEscolhido?.eventId
              ? { eventId: eventoExistenteEscolhido.eventId }
              : { nome: eventoExistenteEscolhido?.nome }
            : { nome: escolhaEvento.nome.trim() };

      const decisoes = Object.entries(respostas).map(([novo, canonico]) => ({ novo, canonico }));

      // Só as provas marcadas no passo 3 entram na importação. Se o organizador
      // deixou tudo marcado (o padrão), isso equivale a "todas" — mandar a lista
      // completa em vez de omitir o campo não muda o resultado, e evita um `if`
      // a mais aqui.
      const provas = [...provasSelecionadas].sort((a, b) => a - b);

      const resultado = await importMutation.mutateAsync({
        championshipId,
        arquivoBase64,
        nomeArquivo,
        evento,
        decisoes,
        provas,
      });

      const provasImportadas = resultado.provasImportadas?.length
        ? resultado.provasImportadas.map((n: number) => `P${n}`).join(", ")
        : provas.map(n => `P${n}`).join(", ");

      toast.success(
        `${resultado.resultadosGravados} resultado(s) gravado(s) em ${resultado.categorias.length} categoria(s) — ` +
          `evento "${resultado.eventoNome}" (${provasImportadas}). ${resultado.provasCriadas} prova(s) nova(s), ${resultado.provasReaproveitadas} reaproveitada(s).`,
      );

      utils.championships.getStages.invalidate({ championshipId });
      utils.championships.getStandings.invalidate({ championshipId });
      onImportado?.();
      fechar(false);
    } catch (erro: any) {
      toast.error(erro?.message || "Erro ao importar a planilha.");
    } finally {
      enviandoRef.current = false;
    }
  };

  // ---------------------------------------------------------------- navegação

  const indiceAtual = passosVisiveis.indexOf(passo);
  const irPara = (delta: number) => {
    const proximo = passosVisiveis[indiceAtual + delta];
    if (proximo) setPasso(proximo);
  };

  const podeAvancar = () => {
    if (passo === 2) return !!previa && previa.provas.length > 0;
    if (passo === 3) return eventoCompleto && provasSelecionadas.size > 0;
    if (passo === 4) return faltamRespostas === 0;
    return true;
  };

  // `enviandoRef` cobre o intervalo síncrono antes do primeiro re-render;
  // `isPending` cobre o resto da requisição. Os dois juntos é que travam o
  // duplo-submit de ponta a ponta.
  const gravando = importMutation.isPending || enviandoRef.current;

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
                  Cada arquivo é <strong>um evento</strong>. Uma coluna por prova daquele evento, com o cabeçalho{" "}
                  <strong>ETAPA-1</strong>, <strong>ETAPA-2</strong>… (ou "POS ETAPA 1").
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
                <Painel titulo="Provas" valor={previa.provas.length} />
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
                        <TableHead className="text-xs">Provas</TableHead>
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
                            {aba.etapas.length ? aba.etapas.map(n => `P${n}`).join(", ") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {previa.provas.length > 0 && (
                <div>
                  <Label className="text-sm font-bold">O que será gravado</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {previa.provas.map(prova => (
                      <Badge key={prova.provaNumber} variant="outline" className="text-[11px]">
                        P{prova.provaNumber} · {prova.duplas} dupla(s)
                        {prova.categorias.length > 0 ? ` · ${prova.categorias.join(", ")}` : ""}
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

          {/* ------------------------------------------------- passo 3: evento */}
          {passo === 3 && previa && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                <p>
                  O arquivo <strong>{nomeArquivo}</strong> é <strong>um evento</strong>. As{" "}
                  <strong>{previa.provas.length}</strong> prova(s) dele entram como provas DESSE evento — não como
                  etapas de eventos diferentes.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {previa.provas.map(prova => (
                    <Badge key={prova.provaNumber} variant="secondary" className="text-[11px]">
                      P{prova.provaNumber} — {prova.duplas} dupla(s)
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-bold">Este arquivo é...</Label>
                <div className="flex flex-wrap gap-2">
                  <BotaoModo
                    ativo={escolhaEvento.modo === "plataforma"}
                    onClick={() => setEscolhaEvento(prev => ({ ...prev, modo: "plataforma" }))}
                    disabled={previa.eventosDaPlataforma.length === 0}
                  >
                    Evento da plataforma
                  </BotaoModo>
                  <BotaoModo
                    ativo={escolhaEvento.modo === "existente"}
                    onClick={() => setEscolhaEvento(prev => ({ ...prev, modo: "existente" }))}
                    disabled={previa.eventosDoCampeonato.length === 0}
                  >
                    Evento já no campeonato
                  </BotaoModo>
                  <BotaoModo
                    ativo={escolhaEvento.modo === "novo"}
                    onClick={() => setEscolhaEvento(prev => ({ ...prev, modo: "novo" }))}
                  >
                    Evento novo
                  </BotaoModo>
                </div>

                {escolhaEvento.modo === "plataforma" && (
                  <Select
                    value={escolhaEvento.eventId ? String(escolhaEvento.eventId) : ""}
                    onValueChange={v => setEscolhaEvento(prev => ({ ...prev, eventId: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o evento da plataforma" />
                    </SelectTrigger>
                    <SelectContent>
                      {previa.eventosDaPlataforma.map(evento => (
                        <SelectItem key={evento.id} value={String(evento.id)}>
                          {evento.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {escolhaEvento.modo === "existente" && (
                  <div className="space-y-2">
                    <Select
                      value={escolhaEvento.chaveExistente || ""}
                      onValueChange={v => setEscolhaEvento(prev => ({ ...prev, chaveExistente: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o evento já no campeonato" />
                      </SelectTrigger>
                      <SelectContent>
                        {previa.eventosDoCampeonato.map(evento => (
                          <SelectItem key={evento.chave} value={evento.chave}>
                            {evento.nome} ({evento.provas.length} prova(s) já gravada(s))
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Isso <strong>substitui</strong> as provas de mesmo número que esse evento já tiver — não soma
                      linhas duplicadas.
                    </p>
                  </div>
                )}

                {escolhaEvento.modo === "novo" && (
                  <Input
                    value={escolhaEvento.nome}
                    onChange={e => setEscolhaEvento(prev => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex.: 7º Rally do Cavalo"
                  />
                )}
              </div>

              {/* Quais provas do arquivo entram nesta importação — pedido real do
                  organizador: a planilha já tem a coluna ETAPA-2, mas a prova 2
                  ainda não rodou, e ele quer importar só a P1 agora. Reimportar
                  depois com a P2 marcada não duplica nada (chave evento+prova). */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold">Quais provas importar</Label>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={marcarTodasAsProvas}>
                      Todas
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={desmarcarTodasAsProvas}>
                      Nenhuma
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Prova que ainda não rodou pode ficar de fora agora e entrar numa importação futura — sem duplicar.
                </p>
                <div className="flex flex-wrap gap-2">
                  {previa.provas.map(prova => {
                    const marcada = provasSelecionadas.has(prova.provaNumber);
                    return (
                      <label
                        key={prova.provaNumber}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                          marcada ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60",
                        )}
                      >
                        <Checkbox checked={marcada} onCheckedChange={() => alternarProva(prova.provaNumber)} />
                        <span className="font-medium">P{prova.provaNumber}</span>
                        <span className="text-xs text-muted-foreground">— {prova.duplas} dupla(s)</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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
                  Mesmo quando o e-mail bate, a confirmação é sua: nestas planilhas o e-mail é da DUPLA, não da
                  pessoa — pode estar em nome do parceiro.
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
                    Aceitar o mais provável nos que faltam
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
                // Candidato com mesmo e-mail primeiro — é a dica mais forte, a
                // semelhança de texto sozinha nunca liga "Victinho" a "Victor Hugo
                // Pizoni Neto".
                const candidatosOrdenados = [...duvida.candidatos].sort((a, b) => {
                  if (a.mesmoEmail !== b.mesmoEmail) return a.mesmoEmail ? -1 : 1;
                  return b.similaridade - a.similaridade;
                });
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
                      {duvida.papel && (
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {ROTULO_PAPEL[duvida.papel]}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {candidatosOrdenados.map(candidato => {
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
                            {candidato.mesmoEmail && (
                              <Badge
                                variant={escolhido ? "secondary" : "outline"}
                                className="text-[10px] gap-1 border-green-500/40 text-green-700 dark:text-green-400"
                                title="O cadastro deste candidato usa o mesmo e-mail da linha nova"
                              >
                                <Mail className="h-2.5 w-2.5" />
                                mesmo e-mail
                              </Badge>
                            )}
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
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-bold">Evento</p>
                <div className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {escolhaEvento.modo === "plataforma"
                      ? previa.eventosDaPlataforma.find(e => e.id === escolhaEvento.eventId)?.name || "evento da plataforma"
                      : escolhaEvento.modo === "existente"
                        ? eventoExistenteEscolhido?.nome || "evento existente"
                        : escolhaEvento.nome}
                  </span>
                  <Badge variant="secondary" className="text-[9px] uppercase">
                    {escolhaEvento.modo === "novo" ? "novo" : escolhaEvento.modo === "plataforma" ? "plataforma" : "já no campeonato"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {previa.provas
                    .filter(p => provasSelecionadas.has(p.provaNumber))
                    .map(prova => (
                      <Badge key={prova.provaNumber} variant="outline" className="text-[11px]">
                        P{prova.provaNumber} · {prova.duplas} dupla(s)
                      </Badge>
                    ))}
                </div>
                {provasSelecionadas.size < previa.provas.length && (
                  <p className="text-xs text-muted-foreground">
                    {previa.provas.length - provasSelecionadas.size} prova(s) do arquivo ficam de fora desta
                    importação — dá pra trazer depois, sem duplicar.
                  </p>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-bold">Resultados</p>
                <div className="flex flex-wrap gap-2">
                  {previa.provas
                    .filter(p => provasSelecionadas.has(p.provaNumber))
                    .map(prova => (
                      <Badge key={prova.provaNumber} variant="outline" className="text-[11px]">
                        P{prova.provaNumber} · {prova.categorias.join(", ") || "Geral"} · {prova.duplas}
                      </Badge>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total:{" "}
                  {previa.provas
                    .filter(p => provasSelecionadas.has(p.provaNumber))
                    .reduce((soma, p) => soma + p.duplas, 0)}{" "}
                  dupla(s) em{" "}
                  {
                    new Set(
                      previa.provas.filter(p => provasSelecionadas.has(p.provaNumber)).flatMap(p => p.categorias),
                    ).size
                  }{" "}
                  categoria(s).
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
                As provas acima serão <strong>substituídas</strong> pelo conteúdo da planilha e a classificação é
                recalculada na hora. Reimportar o mesmo arquivo é seguro: a prova de mesmo número é reaproveitada,
                não duplicada.
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

        {passo === 3 && !eventoCompleto && (
          <p className="text-xs text-destructive -mt-2">Falta escolher o evento deste arquivo.</p>
        )}
        {passo === 3 && eventoCompleto && provasSelecionadas.size === 0 && (
          <p className="text-xs text-destructive -mt-2">Marque ao menos uma prova para importar.</p>
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
