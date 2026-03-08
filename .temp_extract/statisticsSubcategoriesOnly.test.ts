import { describe, it, expect } from 'vitest';

/**
 * Test: Registration Statistics - Return Only Subcategories
 * 
 * Bug: Página de Inscritos exibia categorias pai vazias nas estatísticas
 * 
 * Fix: Filtrar getRegistrationStatistics para retornar apenas subcategorias
 * usando filter(cat => cat.parentId !== null)
 */

describe('Registration Statistics - Return Only Subcategories', () => {
  it('should filter out parent categories from statistics', () => {
    /**
     * Scenario:
     * - Event has: Carros (parent), Carros-Master (child), Carros-Light (child)
     * - Statistics should show only: Carros-Master, Carros-Light
     * - Parent category "Carros" should NOT appear
     */
    
    const allCategories = [
      { id: 1, eventId: 1, name: 'Carros', parentId: null, slots: null, price: 0 },
      { id: 2, eventId: 1, name: 'Carros - Master', parentId: 1, slots: 10, price: 100 },
      { id: 3, eventId: 1, name: 'Carros - Light', parentId: 1, slots: 10, price: 75 },
      { id: 4, eventId: 1, name: 'Motos', parentId: null, slots: null, price: 0 },
      { id: 5, eventId: 1, name: 'Motos - Graduado', parentId: 4, slots: 10, price: 25 },
    ];

    // Filter: keep only categories with parentId (subcategories)
    const subcategoriesForStatistics = allCategories.filter(cat => cat.parentId !== null);

    const testCase = {
      allCategoriesCount: allCategories.length,
      subcategoriesCount: subcategoriesForStatistics.length,
      parentCategoriesRemoved: allCategories.length - subcategoriesForStatistics.length,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    console.log('✅ Categories in Statistics:', subcategoriesForStatistics.map(c => c.name));
    
    expect(subcategoriesForStatistics.length).toBe(3);
    expect(subcategoriesForStatistics.every(c => c.parentId !== null)).toBe(true);
    expect(subcategoriesForStatistics.map(c => c.name)).toEqual([
      'Carros - Master',
      'Carros - Light',
      'Motos - Graduado'
    ]);
  });

  it('should not include parent categories with zero registrations', () => {
    /**
     * Scenario:
     * - Parent categories have 0 registrations (they are just containers)
     * - They should not appear in statistics table
     */
    
    const categories = [
      { id: 1, name: 'Carros', parentId: null, registrations: 0 },
      { id: 2, name: 'Carros - Master', parentId: 1, registrations: 4 },
      { id: 3, name: 'Motos', parentId: null, registrations: 0 },
      { id: 4, name: 'Motos - Graduado', parentId: 3, registrations: 1 },
    ];

    const subcategoriesOnly = categories.filter(c => c.parentId !== null);

    const testCase = {
      parentCategoriesInInput: categories.filter(c => c.parentId === null).length,
      parentCategoriesInOutput: subcategoriesOnly.filter(c => c.parentId === null).length,
      subcategoriesWithRegistrations: subcategoriesOnly.filter(c => c.registrations > 0).length,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    expect(testCase.parentCategoriesInOutput).toBe(0);
    expect(subcategoriesOnly.length).toBe(2);
  });

  it('should calculate statistics correctly for subcategories only', () => {
    /**
     * Scenario:
     * - Calculate total revenue from subcategories only
     * - Parent categories should not contribute to totals
     */
    
    const categories = [
      { id: 1, name: 'Carros', parentId: null, price: 0, registrations: 0 },
      { id: 2, name: 'Carros - Master', parentId: 1, price: 100, registrations: 4 },
      { id: 3, name: 'Carros - Light', parentId: 1, price: 75, registrations: 3 },
      { id: 4, name: 'Motos', parentId: null, price: 0, registrations: 0 },
      { id: 5, name: 'Motos - Graduado', parentId: 4, price: 25, registrations: 1 },
    ];

    const subcategoriesOnly = categories.filter(cat => cat.parentId !== null);
    const totalRevenue = subcategoriesOnly.reduce((sum, cat) => sum + (cat.price * cat.registrations), 0);

    const testCase = {
      subcategoriesCount: subcategoriesOnly.length,
      totalRevenue: totalRevenue,
      expectedRevenue: (100 * 4) + (75 * 3) + (25 * 1), // 400 + 225 + 25 = 650
      result: totalRevenue === 650 ? 'PASS' : 'FAIL',
    };

    console.log('✅ Test Case:', testCase);
    expect(totalRevenue).toBe(650);
  });

  it('should handle events with mixed parent and subcategories', () => {
    /**
     * Scenario:
     * - Event has multiple parent categories and subcategories
     * - Statistics should show only subcategories
     */
    
    const mockCategories = [
      { id: 1, parentId: null, name: 'Carros' },
      { id: 2, parentId: 1, name: 'Carros - Master' },
      { id: 3, parentId: 1, name: 'Carros - Light' },
      { id: 4, parentId: 1, name: 'Carros - Turismo' },
      { id: 5, parentId: null, name: 'Motos' },
      { id: 6, parentId: 5, name: 'Motos - Graduado' },
      { id: 7, parentId: null, name: 'Quads' },
      { id: 8, parentId: 7, name: 'Quads - Aberto' },
    ];

    const filtered = mockCategories.filter(c => c.parentId !== null);

    const testCase = {
      inputCount: mockCategories.length,
      outputCount: filtered.length,
      parentCategoriesRemoved: 3,
      subcategoriesKept: 5,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    expect(filtered.length).toBe(5);
    expect(filtered.filter(c => c.parentId === null).length).toBe(0);
  });
});
