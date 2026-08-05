// Aba "Geral do campeonato": filtros + tabela de classificação + gráfico.
//
// Bug que morre aqui: o filtro oferecia `<SelectItem value="all">Todas</SelectItem>`
// mas o render fazia `standings.find(s => s.name === selectedCategory)` — escolher
// "Todas" caía em `undefined` e a tela dizia "Categoria sem dados". Agora "Todas"
// funciona de verdade: renderiza uma tabela por categoria, uma abaixo da outra.
//
// Também sumiu daqui o `standings.stages.sort(...)`, que ordenava IN PLACE o
// array do cache do React Query.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PerformanceChart } from "@/components/PerformanceChart";
import StandingsTable from "@/components/championship/StandingsTable";
import MergeCompetitorsDialog from "@/components/championship/MergeCompetitorsDialog";
import { ArrowLeft, GitMerge, Loader2, Trophy } from "lucide-react";
import type { CategoriaClassificacao } from "@/shared/classificacaoCampeonato";

/** Sentinela do filtro. Não pode colidir com nome de categoria de verdade. */
const TODAS = "__todas__";

export interface StandingsTabProps {
  championshipId: number;
  /** Saída de `championships.getStandings`. */
  standingsData: { standings: CategoriaClassificacao[]; stages: any[] } | undefined;
  isLoading: boolean;
  isOwner: boolean;
}

export default function StandingsTab({ championshipId, standingsData, isLoading, isOwner }: StandingsTabProps) {
  const [categoria, setCategoria] = useState<string>("");
  const [papel, setPapel] = useState<"pilot" | "navigator">("pilot");
  const [unificarAberto, setUnificarAberto] = useState(false);

  const categorias = standingsData?.standings || [];

  // A etapa chega com nome em `event.name` (evento da plataforma) ou em
  // `customName` (prova externa) — a tabela e o PDF só querem `nome`.
  const etapas = useMemo(
    () =>
      [...(standingsData?.stages || [])]
        .map(st => ({
          id: st.id,
          stageNumber: st.stageNumber,
          nome: st.nome || st.event?.name || st.customName || "",
        }))
        .sort((a, b) => a.stageNumber - b.stageNumber || a.id - b.id),
    [standingsData?.stages],
  );

  // Era uma IIFE recalculada a cada render, dentro do JSX do modal.
  const nomes = useMemo(
    () =>
      Array.from(
        new Set(
          categorias.flatMap(cat => [...cat.pilots.map(p => p.name), ...cat.navigators.map(n => n.name)]),
        ),
      ),
    [categorias],
  );

  useEffect(() => {
    if (categorias.length > 0 && !categoria) setCategoria(categorias[0].name);
  }, [categorias, categoria]);

  const mostrandoTodas = categoria === TODAS;
  const categoriasVisiveis: CategoriaClassificacao[] = mostrandoTodas
    ? categorias
    : categorias.filter(c => c.name === categoria);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" /> Classificação geral
              </CardTitle>
              <CardDescription>Pódio e pontos acumulados por competidor e categoria.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as categorias</SelectItem>
                  {categorias.map(cat => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="bg-muted p-1 rounded-md flex items-center w-full sm:w-auto">
                <Button
                  variant={papel === "pilot" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPapel("pilot")}
                  className="h-8 px-4 flex-1 sm:flex-none"
                >
                  Pilotos
                </Button>
                <Button
                  variant={papel === "navigator" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPapel("navigator")}
                  className="h-8 px-4 flex-1 sm:flex-none"
                >
                  Navegadores
                </Button>
              </div>

              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/5 w-full sm:w-auto"
                  onClick={() => setUnificarAberto(true)}
                >
                  <GitMerge className="h-4 w-4" />
                  Unificar competidores
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : categorias.length === 0 ? (
            <div className="text-center p-12 border border-dashed rounded-lg bg-muted/20">
              <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-muted-foreground mb-1">Nenhum resultado processado</h3>
              <p className="text-sm text-muted-foreground">
                Importe a planilha de resultados para montar a tabela geral.
              </p>
            </div>
          ) : (
            categoriasVisiveis.map(cat => (
              <div key={cat.name} className="space-y-2">
                {mostrandoTodas && (
                  <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{cat.name}</h3>
                )}
                <StandingsTable categoria={cat} etapas={etapas} papel={papel} variante="admin" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* O gráfico compara competidores de UMA categoria — em "Todas" ele não
          significa nada, então some. */}
      {!isLoading && !mostrandoTodas && categoriasVisiveis.length > 0 && standingsData && (
        <Card className="mt-6 border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowLeft className="h-4 w-4 rotate-180 text-primary" />
              Evolução de performance
            </CardTitle>
            <CardDescription>Constância de pontos ao longo das etapas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full pt-4">
              <PerformanceChart data={standingsData} selectedCategory={categoria} selectedRole={papel} />
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <MergeCompetitorsDialog
          championshipId={championshipId}
          nomes={nomes}
          open={unificarAberto}
          onOpenChange={setUnificarAberto}
        />
      )}
    </>
  );
}
