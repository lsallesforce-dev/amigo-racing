import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import type { CategoriaClassificacao, ResultadoEtapa } from "@/shared/classificacaoCampeonato";

interface PerformanceChartProps {
    data: any;
    selectedCategory: string;
    selectedRole: "pilot" | "navigator";
    chartRef?: React.RefObject<HTMLDivElement>;
    /**
     * Nome do competidor em foco (ex.: clicado na StandingsTable). Realça a linha dele
     * e apaga as demais. Opcional e aditivo — quem já chama o componente sem esse prop
     * continua funcionando exatamente como antes.
     */
    highlightedName?: string;
}

// Paleta categórica validada (skill dataviz: 8 slots, CVD-safe nos dois modos).
// Cada slot tem um passo de luminosidade PRÓPRIO pra claro/escuro — dark mode não é
// um espelho automático do claro, é selecionado à parte (por isso duas listas, e a
// troca acontece via CSS puro ".dark", mesma convenção do index.css do projeto).
const SERIES_VARS = [
    '--pc-series-1', '--pc-series-2', '--pc-series-3', '--pc-series-4',
    '--pc-series-5', '--pc-series-6', '--pc-series-7', '--pc-series-8',
];

export function PerformanceChart({ data, selectedCategory, selectedRole, chartRef, highlightedName }: PerformanceChartProps) {
    const categoryData = (data?.standings as CategoriaClassificacao[] | undefined)?.find((s) => s.name === selectedCategory);
    if (!categoryData) return null;

    const competitors = selectedRole === "pilot" ? categoryData.pilots : categoryData.navigators;
    const stages = [...(data.stages as { id: number; stageNumber: number }[])].sort((a, b) => a.stageNumber - b.stageNumber);

    // Só o Top 8 pra não poluir o gráfico.
    const topCompetitors = competitors.slice(0, 8);

    const chartData = stages.map(st => {
        const point: Record<string, string | number | null> = { name: `E${st.stageNumber}` };
        topCompetitors.forEach(comp => {
            const res = comp.stageResults.find((sr: ResultadoEtapa) => sr.stageId === st.id);
            // DNS vira `null`, não 0. Zero é um resultado REAL (11º lugar em diante, ou
            // DSQ, ambos pontuam 0 pela tabela) — DNS é ausência. Com `null` + o
            // `connectNulls={false}` da Line, o recharts pula o índice inteiro (sem
            // ponto, sem segmento de linha), o que já basta pra diferenciar visualmente
            // "não correu esta etapa" de "correu e não pontuou".
            point[comp.name] = res && !res.isDns ? res.points : null;
        });
        return point;
    });

    return (
        <div ref={chartRef} className="performance-chart-root w-full h-full bg-card rounded-lg">
            {/* Antes o wrapper e os eixos usavam hex fixo (#1a1a1a / #333 / #888), o que
                quebrava no tema claro (o app suporta claro, só o dark é que fica travado
                no ThemeProvider hoje). Aqui tudo usa as CSS variables do tema — igual ao
                resto do app — e só as cores de SÉRIE (identidade de cada competidor, não
                é "cor de superfície") continuam fixas, com um passo dedicado pro dark. */}
            <style>{`
                .performance-chart-root {
                    --pc-series-1: #2a78d6; --pc-series-2: #eb6834; --pc-series-3: #1baf7a; --pc-series-4: #eda100;
                    --pc-series-5: #e87ba4; --pc-series-6: #008300; --pc-series-7: #4a3aa7; --pc-series-8: #e34948;
                }
                .dark .performance-chart-root {
                    --pc-series-1: #3987e5; --pc-series-2: #d95926; --pc-series-3: #199e70; --pc-series-4: #c98500;
                    --pc-series-5: #d55181; --pc-series-6: #008300; --pc-series-7: #9085e9; --pc-series-8: #e66767;
                }
            `}</style>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ color: 'var(--foreground)' }}
                        formatter={(value: number | null, name: string) => [value === null ? "Não largou" : value, name]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '11px', color: 'var(--muted-foreground)' }} />
                    {topCompetitors.map((comp, idx) => {
                        const cor = `var(${SERIES_VARS[idx % SERIES_VARS.length]})`;
                        const apagado = !!highlightedName && highlightedName !== comp.name;
                        return (
                            <Line
                                key={comp.name}
                                type="monotone"
                                dataKey={comp.name}
                                stroke={cor}
                                strokeWidth={apagado ? 1 : (highlightedName === comp.name ? 3 : 2)}
                                strokeOpacity={apagado ? 0.25 : 1}
                                dot={apagado ? false : { r: 4, fill: cor }}
                                activeDot={{ r: 6 }}
                                connectNulls={false}
                                animationDuration={1500}
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
