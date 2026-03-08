import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ShirtsReportProps {
  report: {
    totalShirts: number;
    pilotShirts: Record<string, number>;
    navigatorShirts: Record<string, number>;
    byCategory: Array<{
      category: number;
      pilot: Record<string, number>;
      navigator: Record<string, number>;
    }>;
    shirtSizes: string[];
  };
  categoryNames?: Record<number, string>;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A8E6CF'];
const SHIRT_SIZE_LABELS: Record<string, string> = {
  'pp': 'PP',
  'p': 'P',
  'm': 'M',
  'g': 'G',
  'gg': 'GG',
  'g1': 'G1',
  'g2': 'G2',
  'g3': 'G3',
  'g4': 'G4',
  'infantil': 'Infantil'
};

export function ShirtsReport({ report, categoryNames = {} }: ShirtsReportProps) {
  // Preparar dados para gráfico de barras
  const chartData = useMemo(() => {
    return report.shirtSizes.map(size => ({
      size: SHIRT_SIZE_LABELS[size] || size,
      Piloto: report.pilotShirts[size] || 0,
      Navegador: report.navigatorShirts[size] || 0,
      Total: (report.pilotShirts[size] || 0) + (report.navigatorShirts[size] || 0)
    }));
  }, [report]);

  // Preparar dados para gráfico de pizza
  const pieData = useMemo(() => {
    return report.shirtSizes
      .filter(size => (report.pilotShirts[size] || 0) + (report.navigatorShirts[size] || 0) > 0)
      .map(size => ({
        name: SHIRT_SIZE_LABELS[size] || size,
        value: (report.pilotShirts[size] || 0) + (report.navigatorShirts[size] || 0)
      }));
  }, [report]);

  // Calcular totais
  const totalPilots = Object.values(report.pilotShirts).reduce((a, b) => a + b, 0);
  const totalNavigators = Object.values(report.navigatorShirts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Camisetas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.totalShirts}</div>
            <p className="text-xs text-muted-foreground mt-1">Pilotos + Navegadores</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Camisetas de Piloto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPilots}</div>
            <p className="text-xs text-muted-foreground mt-1">Distribuído por tamanho</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Camisetas de Navegador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNavigators}</div>
            <p className="text-xs text-muted-foreground mt-1">Distribuído por tamanho</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição de Camisetas por Tamanho</CardTitle>
          <CardDescription>Quantidade de camisetas para pilotos e navegadores</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="size" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Piloto" fill="#8884d8" />
              <Bar dataKey="Navegador" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de pizza */}
      <Card>
        <CardHeader>
          <CardTitle>Proporção Total de Camisetas</CardTitle>
          <CardDescription>Visualização da distribuição geral por tamanho</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes por Tamanho</CardTitle>
          <CardDescription>Quantidade exata de cada tamanho de camiseta</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tamanho</TableHead>
                  <TableHead className="text-right">Pilotos</TableHead>
                  <TableHead className="text-right">Navegadores</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.shirtSizes.map(size => {
                  const pilotCount = report.pilotShirts[size] || 0;
                  const navigatorCount = report.navigatorShirts[size] || 0;
                  const total = pilotCount + navigatorCount;

                  return (
                    <TableRow key={size}>
                      <TableCell className="font-medium">{SHIRT_SIZE_LABELS[size] || size}</TableCell>
                      <TableCell className="text-right">{pilotCount}</TableCell>
                      <TableCell className="text-right">{navigatorCount}</TableCell>
                      <TableCell className="text-right font-semibold">{total}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalPilots}</TableCell>
                  <TableCell className="text-right">{totalNavigators}</TableCell>
                  <TableCell className="text-right">{report.totalShirts}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
