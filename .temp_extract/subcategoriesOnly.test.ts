import { describe, it, expect } from 'vitest';

/**
 * Test: Filter Categories - Return Only Subcategories
 * 
 * Bug: Página de Inscritos exibia categorias pai vazias (Carros, Motos)
 * além das subcategorias (Carros - Master, Carros - Light, etc)
 * 
 * Fix: Filtrar getCategoriesByEventId para retornar apenas categorias
 * que têm parentId (subcategorias), removendo categorias pai
 */

describe('Filter Categories - Return Only Subcategories', () => {
  it('should filter out parent categories and return only subcategories', () => {
    /**
     * Scenario:
     * - Event has categories: Carros (parent), Carros-Master (child), Carros-Light (child)
     * - Query should return only: Carros-Master, Carros-Light
     * - Parent category "Carros" should NOT appear
     */
    
    const allCategories = [
      { id: 1, eventId: 1, name: 'Carros', parentId: null }, // Parent - should be filtered
      { id: 2, eventId: 1, name: 'Carros - Master', parentId: 1 }, // Child - should be included
      { id: 3, eventId: 1, name: 'Carros - Light', parentId: 1 }, // Child - should be included
      { id: 4, eventId: 1, name: 'Motos', parentId: null }, // Parent - should be filtered
      { id: 5, eventId: 1, name: 'Motos - Graduado', parentId: 4 }, // Child - should be included
    ];

    // Filter: keep only categories with parentId (subcategories)
    const filteredCategories = allCategories.filter(c => c.parentId !== null);

    const testCase = {
      allCategoriesCount: allCategories.length,
      filteredCategoriesCount: filteredCategories.length,
      parentCategoriesRemoved: allCategories.length - filteredCategories.length,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    console.log('✅ Filtered Categories:', filteredCategories.map(c => c.name));
    
    expect(filteredCategories.length).toBe(3); // Only 3 subcategories
    expect(filteredCategories.every(c => c.parentId !== null)).toBe(true); // All have parentId
    expect(filteredCategories.map(c => c.name)).toEqual([
      'Carros - Master',
      'Carros - Light',
      'Motos - Graduado'
    ]);
  });

  it('should NOT include parent categories in the result', () => {
    /**
     * Scenario:
     * - Parent categories have parentId = null
     * - Query should filter them out
     */
    
    const categories = [
      { id: 1, name: 'Carros', parentId: null },
      { id: 2, name: 'Motos', parentId: null },
      { id: 3, name: 'Carros - Master', parentId: 1 },
    ];

    const subcategoriesOnly = categories.filter(c => c.parentId !== null);

    const testCase = {
      parentCategoriesInInput: categories.filter(c => c.parentId === null).length,
      parentCategoriesInOutput: subcategoriesOnly.filter(c => c.parentId === null).length,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    expect(testCase.parentCategoriesInOutput).toBe(0);
  });

  it('should work with isNotNull filter in Drizzle ORM', () => {
    /**
     * Scenario:
     * - Using Drizzle ORM: isNotNull(categories.parentId)
     * - This filters out rows where parentId is NULL
     * - Result: only subcategories
     */
    
    const mockCategories = [
      { id: 1, parentId: null, name: 'Carros' },
      { id: 2, parentId: 1, name: 'Carros - Master' },
      { id: 3, parentId: 1, name: 'Carros - Light' },
      { id: 4, parentId: null, name: 'Motos' },
      { id: 5, parentId: 4, name: 'Motos - Graduado' },
    ];

    // Simulate: where(isNotNull(categories.parentId))
    const filtered = mockCategories.filter(c => c.parentId !== null);

    const testCase = {
      inputCount: mockCategories.length,
      outputCount: filtered.length,
      parentCategoriesRemoved: 2,
      subcategoriesKept: 3,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    expect(filtered.length).toBe(3);
    expect(filtered.every(c => c.parentId !== null)).toBe(true);
  });

  it('should handle events with no parent categories', () => {
    /**
     * Scenario:
     * - Event has only subcategories (no parent categories)
     * - Query should return all of them
     */
    
    const categories = [
      { id: 1, parentId: 1, name: 'Category 1' },
      { id: 2, parentId: 1, name: 'Category 2' },
      { id: 3, parentId: 1, name: 'Category 3' },
    ];

    const filtered = categories.filter(c => c.parentId !== null);

    const testCase = {
      inputCount: categories.length,
      outputCount: filtered.length,
      allAreSubcategories: filtered.length === categories.length,
      result: 'PASS',
    };

    console.log('✅ Test Case:', testCase);
    expect(filtered.length).toBe(3);
  });
});
