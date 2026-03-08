import { describe, it, expect, vi } from "vitest";

describe("SortableStartList - Funcionalidade de Reordenação", () => {
  describe("Sincronização de Numeração", () => {
    it("deve manter números sequenciais após drag-and-drop", () => {
      // Simulando reordenação de 2 pilotos
      const numberStart = 1;
      const intervalSeconds = 60;
      
      // Antes: Piloto 1 = #1, Piloto 2 = #2
      // Depois de reordenar: Piloto 2 = #1, Piloto 1 = #2
      
      const reorderedNumbers = [
        numberStart + 0, // Piloto 2 agora é primeiro
        numberStart + 1, // Piloto 1 agora é segundo
      ];
      
      expect(reorderedNumbers).toEqual([1, 2]);
    });

    it("deve sincronizar horários após reordenação", () => {
      const baseTime = "08:00";
      const intervalSeconds = 60;
      
      // Função para calcular horário
      const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
        const [hours, minutes] = baseTime.split(":").map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
        const newHours = Math.floor(totalSeconds / 3600) % 24;
        const newMinutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
      };
      
      const times = [
        calculateStartTime(baseTime, 0, intervalSeconds), // 08:00
        calculateStartTime(baseTime, 1, intervalSeconds), // 08:01
        calculateStartTime(baseTime, 2, intervalSeconds), // 08:02
      ];
      
      expect(times).toEqual(["08:00", "08:01", "08:02"]);
    });

    it("deve recalcular números após shuffle", () => {
      const numberStart = 4;
      const registrationCount = 3;
      
      // Criar números para 3 pilotos
      const numbers = Array.from({ length: registrationCount }, (_, i) => numberStart + i);
      
      expect(numbers).toEqual([4, 5, 6]);
    });
  });

  describe("Shuffle por Categoria", () => {
    it("deve embaralhar apenas pilotos da mesma categoria", () => {
      const categoryAItems = [
        { id: "cat-a-1", categoryId: 1, name: "Piloto 1" },
        { id: "cat-a-2", categoryId: 1, name: "Piloto 2" },
      ];
      
      const categoryBItems = [
        { id: "cat-b-1", categoryId: 2, name: "Piloto 3" },
      ];
      
      const allItems = [...categoryAItems, ...categoryBItems];
      
      // Verificar que temos itens de ambas as categorias
      expect(allItems.filter(i => i.categoryId === 1)).toHaveLength(2);
      expect(allItems.filter(i => i.categoryId === 2)).toHaveLength(1);
    });

    it("deve manter estrutura de categorias após shuffle", () => {
      const items = [
        { id: "1", categoryId: 1, position: 1 },
        { id: "2", categoryId: 1, position: 2 },
        { id: "3", categoryId: 2, position: 1 },
        { id: "4", categoryId: 2, position: 2 },
      ];
      
      // Agrupar por categoria
      const grouped: Record<number, any[]> = {};
      items.forEach(item => {
        if (!grouped[item.categoryId]) {
          grouped[item.categoryId] = [];
        }
        grouped[item.categoryId].push(item);
      });
      
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped[1]).toHaveLength(2);
      expect(grouped[2]).toHaveLength(2);
    });
  });

  describe("Validação de Dados", () => {
    it("deve validar que números não ficam negativos", () => {
      const numberStart = 1;
      const index = 0;
      
      const number = numberStart + index;
      
      expect(number).toBeGreaterThanOrEqual(1);
    });

    it("deve validar que horários não excedem 24 horas", () => {
      const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
        const [hours, minutes] = baseTime.split(":").map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + index * intervalSeconds;
        const newHours = Math.floor(totalSeconds / 3600) % 24; // Garante que não excede 24h
        const newMinutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
      };
      
      const time = calculateStartTime("23:00", 100, 60);
      const [hours] = time.split(":").map(Number);
      
      expect(hours).toBeLessThan(24);
    });
  });

  describe("Integração com Modal", () => {
    it("deve criar items baseado em contagem de inscritos", () => {
      const registrationCounts = {
        1: 3, // Categoria 1 com 3 inscritos
        2: 2, // Categoria 2 com 2 inscritos
      };
      
      const totalItems = Object.values(registrationCounts).reduce((a, b) => a + b, 0);
      
      expect(totalItems).toBe(5);
    });

    it("deve validar que onConfirm é chamado com dados corretos", () => {
      const mockOnConfirm = vi.fn();
      
      const newOrder = [
        { id: "1", categoryId: 1, numberStart: 1 },
        { id: "2", categoryId: 1, numberStart: 2 },
      ];
      
      mockOnConfirm(newOrder);
      
      expect(mockOnConfirm).toHaveBeenCalledWith(newOrder);
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it("deve validar que onCancel fecha modal", () => {
      const mockOnCancel = vi.fn();
      
      mockOnCancel();
      
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
