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

interface PerformanceChartProps {
    data: any;
    selectedCategory: string;
    selectedRole: "pilot" | "navigator";
    chartRef?: React.RefObject<HTMLDivElement>;
}

export function PerformanceChart({ data, selectedCategory, selectedRole, chartRef }: PerformanceChartProps) {
    const categoryData = data.standings.find((s: any) => s.name === selectedCategory);
    if (!categoryData) return null;

    const competitors = selectedRole === "pilot" ? categoryData.pilots : categoryData.navigators;
    const stages = [...data.stages].sort((a, b) => a.stageNumber - b.stageNumber);

    // Prepare chart data: Each stage is a point on X axis
    // Only top 8 competitors to avoid clutter
    const topCompetitors = competitors.slice(0, 8);

    const chartData = stages.map(st => {
        const point: any = { name: `E${st.stageNumber}` };
        topCompetitors.forEach((comp: any) => {
            const res = comp.stageResults.find((sr: any) => sr.stageId === st.id);
            point[comp.name] = res ? res.points : 0;
        });
        return point;
    });

    const colors = ['#f97316', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

    return (
        <div ref={chartRef} className="w-full h-full bg-[#1a1a1a] rounded-lg">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="name" stroke="#888" fontSize={12} />
                    <YAxis stroke="#888" fontSize={12} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} />
                    {topCompetitors.map((comp: any, idx: number) => (
                        <Line
                            key={comp.name}
                            type="monotone"
                            dataKey={comp.name}
                            stroke={colors[idx % colors.length]}
                            strokeWidth={2}
                            dot={{ r: 4, fill: colors[idx % colors.length] }}
                            activeDot={{ r: 6 }}
                            animationDuration={1500}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
