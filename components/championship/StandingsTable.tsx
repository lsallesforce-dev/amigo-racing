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

import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CategoriaClassificacao, CompetidorClassificado } from "@/shared/classificacaoCampeonato";

export interface StandingsTableProps {
  categoria: CategoriaClassificacao | undefined;
  etapas: { id: number; stageNumber: number; nome: string }[];
  papel: "pilot" | "navigator";
  /** "vitrine" enxuga a tabela para o público (sem a coluna de bruto). */
  variante?: "admin" | "vitrine";
  onSelecionarCompetidor?: (nome: string) => void;
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
            <TableRow>
              <TableHead className="w-[64px] text-center font-bold sticky left-0 z-20 bg-muted">Pos</TableHead>
              <TableHead className="font-bold sticky left-[64px] z-20 bg-muted min-w-[180px] border-r">
                Competidor
              </TableHead>
              {etapasOrdenadas.map(etapa => (
                <TableHead key={etapa.id} className="text-center w-[76px] text-[10px] leading-tight px-1">
                  E{etapa.stageNumber}
                  {etapa.nome && (
                    <div
                      className="text-[9px] font-normal text-muted-foreground truncate max-w-[70px] mx-auto"
                      title={etapa.nome}
                    >
                      {etapa.nome}
                    </div>
                  )}
                </TableHead>
              ))}
              {mostrarBruto && (
                <TableHead className="w-[70px] text-center text-[10px] text-muted-foreground" title="Soma sem descarte">
                  Bruto
                </TableHead>
              )}
              <TableHead className="w-[90px] text-center font-bold text-primary">Pontos</TableHead>
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
                  {etapasOrdenadas.map(etapa => (
                    <TableCell key={etapa.id} className="text-center p-2">
                      <CelulaEtapa competidor={comp} stageId={etapa.id} />
                    </TableCell>
                  ))}
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
