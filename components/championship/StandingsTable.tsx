// A tabela de classificação — a MESMA no painel do organizador e na vitrine.
//
// Antes eram duas tabelas escritas à mão (ChampionshipDetails e
// ChampionshipShowcase) que já tinham divergido: a vitrine não mostrava
// descarte, o painel não mostrava empate. Aqui é um componente só, e o que muda
// entre os dois é a prop `variante`.
//
// O que a tabela conserta em relação às duas antigas:
//  - a colocação vem do backend (`posicao`), então empate REPETE o número
//    (1, 1, 3) em vez de virar 1, 2, 3 pela ordem do array;
//  - DNS (não largou) deixa de ser igual a DSQ — antes tudo caía no rótulo
//    "NC/DSQ" ou virava um traço mudo;
//  - descarte fica visível (riscado) e o bruto aparece ao lado do líquido, que é
//    como o organizador confere se a regra N-x fez o que ele esperava;
//  - com 15 etapas a tabela não estoura a página: rola na horizontal DENTRO do
//    card, com Pos + Competidor congelados à esquerda.
//
// ⚠️ MUDANÇA DE MODELO: o cabeçalho passou a agrupar por EVENTO. Cada arquivo
// importado é um evento com suas próprias provas (P1, P2, ...) — modelar
// ETAPA-N da planilha como numeração global do campeonato produziu, em
// produção, duas colunas "E1" e duas "E2" (uma por arquivo), com dado de um
// evento caindo nas provas do outro. Agora a linha de cima do cabeçalho é o
// NOME DO EVENTO (colspan sobre as provas dele) e a de baixo é P1, P2... —
// ordenado por `stageNumber` global, que continua sendo a chave estável de
// coluna (o número da prova por si só se repete entre eventos).

import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CategoriaClassificacao, CompetidorClassificado } from "@/shared/classificacaoCampeonato";

/** A etapa como a tabela (e o PDF) precisam dela. */
export interface EtapaStandings {
  id: number;
  stageNumber: number;
  /** Nome de exibição da PROVA (ex.: "P1"), já resolvido pelo chamador. */
  nome: string;
  /** Número da prova dentro do evento (P1, P2...). */
  provaNumber: number;
  /** Nome do evento a que a prova pertence — `null` = prova sem evento (dado legado). */
  eventoNome: string | null;
}

export interface StandingsTableProps {
  categoria: CategoriaClassificacao | undefined;
  etapas: EtapaStandings[];
  papel: "pilot" | "navigator";
  /** "vitrine" enxuga a tabela para o público (sem a coluna de bruto). */
  variante?: "admin" | "vitrine";
  onSelecionarCompetidor?: (nome: string) => void;
}

/** Agrupa etapas (já ordenadas) por evento, preservando a ordem de chegada — é o
 *  que dá o colspan da linha de cima do cabeçalho. */
function agruparPorEvento(etapas: EtapaStandings[]): { eventoNome: string; etapas: EtapaStandings[] }[] {
  const grupos: { eventoNome: string; etapas: EtapaStandings[] }[] = [];
  for (const etapa of etapas) {
    const nome = etapa.eventoNome || "Sem evento";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.eventoNome === nome) ultimo.etapas.push(etapa);
    else grupos.push({ eventoNome: nome, etapas: [etapa] });
  }
  return grupos;
}

const MEDALHAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Faixa colorida à esquerda do pódio — funciona com fundo sólido (coluna fixa). */
const ACENTO_PODIO: Record<number, string> = {
  1: "border-l-2 border-l-yellow-400",
  2: "border-l-2 border-l-slate-400",
  3: "border-l-2 border-l-amber-700",
};

function CelulaEtapa({ competidor, stageId }: { competidor: CompetidorClassificado; stageId: number }) {
  // ⚠️ `stageResults` tem UMA entrada por etapa (DNS inclusive). Ausência de
  // entrada só acontece com dado velho — por isso o fallback é DNS, não "0".
  const res = competidor.stageResults.find(sr => sr.stageId === stageId);

  if (!res || res.isDns) {
    return (
      <span className="text-muted-foreground/40 text-xs" title="Não largou (DNS)">
        DNS
      </span>
    );
  }

  if (res.isDisqualified) {
    return (
      <span
        className="text-[10px] font-bold uppercase text-destructive bg-destructive/10 px-1.5 py-0.5 rounded"
        title="Não classificado / desclassificado"
      >
        NC
      </span>
    );
  }

  if (res.isDiscarded) {
    return (
      <span
        className="relative inline-flex items-center text-sm line-through text-red-500/70 cursor-help"
        title={`${res.points} ponto(s) descartado(s) pela regra de descarte`}
      >
        {res.points}
        <span className="absolute -top-2 -right-2.5 text-[9px] not-italic no-underline text-red-500">d</span>
      </span>
    );
  }

  return <span className={cn("text-sm", res.points > 0 ? "font-medium" : "text-muted-foreground")}>{res.points}</span>;
}

export default function StandingsTable({
  categoria,
  etapas,
  papel,
  variante = "admin",
  onSelecionarCompetidor,
}: StandingsTableProps) {
  // `[...etapas]` obrigatório: `etapas` costuma vir direto do cache do React
  // Query, e `.sort()` in-place reordenaria o cache de quem chamou.
  const etapasOrdenadas = useMemo(
    () => [...(etapas || [])].sort((a, b) => a.stageNumber - b.stageNumber || a.id - b.id),
    [etapas],
  );

  // Grupos de evento, na mesma ordem da linha de baixo — o colspan de cada
  // grupo é `etapas.length` dele.
  const gruposEvento = useMemo(() => agruparPorEvento(etapasOrdenadas), [etapasOrdenadas]);

  const lista = useMemo<CompetidorClassificado[]>(() => {
    if (!categoria) return [];
    return (papel === "pilot" ? categoria.pilots : categoria.navigators) || [];
  }, [categoria, papel]);

  const mostrarBruto = variante === "admin";

  if (!categoria) {
    return (
      <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
        Selecione uma categoria para ver a classificação.
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
        Nenhum {papel === "pilot" ? "piloto" : "navegador"} pontuando em {categoria.name}.
      </div>
    );
  }

  const totalColunas = etapasOrdenadas.length + (mostrarBruto ? 4 : 3);

  return (
    <div className="space-y-3">
      {/* O overflow mora AQUI, no container do card: a página nunca ganha barra
          horizontal, mesmo com 15 etapas. */}
      <div className="rounded-md border overflow-x-auto w-full max-w-full">
        <Table className="min-w-max">
          <TableHeader className="bg-muted/50">
            {/* Linha 1: nome do EVENTO, um colspan por grupo. As duas colunas
                congeladas (Pos/Competidor) e Bruto/Pontos ganham rowSpan 2 para
                não duplicar célula vazia embaixo. */}
            <TableRow>
              <TableHead
                rowSpan={2}
                className="w-[64px] text-center font-bold sticky left-0 z-20 bg-muted align-middle"
              >
                Pos
              </TableHead>
              <TableHead
                rowSpan={2}
                className="font-bold sticky left-[64px] z-20 bg-muted min-w-[180px] border-r align-middle"
              >
                Competidor
              </TableHead>
              {gruposEvento.map((grupo, idx) => (
                <TableHead
                  key={`${grupo.eventoNome}-${idx}`}
                  colSpan={grupo.etapas.length}
                  className="text-center text-[10px] font-bold uppercase tracking-wide border-l truncate max-w-0"
                  title={grupo.eventoNome}
                >
                  {grupo.eventoNome}
                </TableHead>
              ))}
              {mostrarBruto && (
                <TableHead
                  rowSpan={2}
                  className="w-[70px] text-center text-[10px] text-muted-foreground align-middle"
                  title="Soma sem descarte"
                >
                  Bruto
                </TableHead>
              )}
              <TableHead rowSpan={2} className="w-[90px] text-center font-bold text-primary align-middle">
                Pontos
              </TableHead>
            </TableRow>
            {/* Linha 2: a prova dentro do evento (P1, P2...). */}
            <TableRow>
              {etapasOrdenadas.map((etapa, idx) => {
                // Borda esquerda marca o início de um novo grupo de evento —
                // reforça visualmente onde um evento termina e o outro começa.
                const inicioDeGrupo = idx === 0 || etapasOrdenadas[idx - 1].eventoNome !== etapa.eventoNome;
                return (
                  <TableHead
                    key={etapa.id}
                    className={cn(
                      "text-center w-[76px] text-[10px] leading-tight px-1",
                      inicioDeGrupo && "border-l",
                    )}
                  >
                    P{etapa.provaNumber}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map(comp => {
              const noPodio = comp.posicao >= 1 && comp.posicao <= 3;
              // Coluna congelada precisa de fundo SÓLIDO (bg-background), senão o
              // conteúdo rolando por baixo aparece através do tom translúcido.
              const fixa = "sticky z-10 bg-background";
              return (
                <TableRow key={`${comp.name}-${comp.category}`} className={cn(noPodio && "bg-primary/[0.04]")}>
                  <TableCell
                    className={cn(fixa, "left-0 text-center font-bold text-lg", noPodio && ACENTO_PODIO[comp.posicao])}
                  >
                    {MEDALHAS[comp.posicao] && <span className="mr-1">{MEDALHAS[comp.posicao]}</span>}
                    {comp.posicao}º
                  </TableCell>
                  <TableCell className={cn(fixa, "left-[64px] font-medium whitespace-nowrap border-r")}>
                    {onSelecionarCompetidor ? (
                      <button
                        type="button"
                        className="hover:text-primary hover:underline text-left"
                        onClick={() => onSelecionarCompetidor(comp.name)}
                      >
                        {comp.name}
                      </button>
                    ) : (
                      comp.name
                    )}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {comp.etapasCorridas} de {etapasOrdenadas.length} etapa(s)
                    </span>
                  </TableCell>
                  {etapasOrdenadas.map((etapa, idx) => {
                    const inicioDeGrupo = idx === 0 || etapasOrdenadas[idx - 1].eventoNome !== etapa.eventoNome;
                    return (
                      <TableCell key={etapa.id} className={cn("text-center p-2", inicioDeGrupo && "border-l")}>
                        <CelulaEtapa competidor={comp} stageId={etapa.id} />
                      </TableCell>
                    );
                  })}
                  {mostrarBruto && (
                    <TableCell className="text-center text-sm text-muted-foreground">{comp.grossPoints}</TableCell>
                  )}
                  <TableCell className="text-center font-bold text-lg text-primary bg-primary/10">
                    {comp.netPoints}
                  </TableCell>
                </TableRow>
              );
            })}
            {lista.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalColunas} className="text-center p-8 text-muted-foreground">
                  Sem competidores.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="line-through text-red-500/70">12</span> descartado pela regra N-x
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
            NC
          </span>
          não classificado / desclassificado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/60">DNS</span> não largou na etapa
        </span>
        {mostrarBruto && <span>Bruto = soma antes do descarte</span>}
      </div>
    </div>
  );
}
