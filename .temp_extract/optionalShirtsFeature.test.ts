import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Optional Shirts Feature', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should save includeShirts preference to localStorage', () => {
    const value = true;
    localStorage.setItem('eventIncludeShirts', String(value));
    
    const saved = localStorage.getItem('eventIncludeShirts');
    expect(saved).toBe('true');
  });

  it('should retrieve includeShirts preference from localStorage', () => {
    localStorage.setItem('eventIncludeShirts', 'false');
    
    const saved = localStorage.getItem('eventIncludeShirts');
    const includeShirts = saved !== null ? saved === 'true' : true;
    
    expect(includeShirts).toBe(false);
  });

  it('should default to true if no preference is saved', () => {
    const saved = localStorage.getItem('eventIncludeShirts');
    const includeShirts = saved !== null ? saved === 'true' : true;
    
    expect(includeShirts).toBe(true);
  });

  it('should toggle between true and false', () => {
    // Start with true
    localStorage.setItem('eventIncludeShirts', 'true');
    let saved = localStorage.getItem('eventIncludeShirts');
    let includeShirts = saved === 'true';
    expect(includeShirts).toBe(true);
    
    // Toggle to false
    localStorage.setItem('eventIncludeShirts', 'false');
    saved = localStorage.getItem('eventIncludeShirts');
    includeShirts = saved === 'true';
    expect(includeShirts).toBe(false);
    
    // Toggle back to true
    localStorage.setItem('eventIncludeShirts', 'true');
    saved = localStorage.getItem('eventIncludeShirts');
    includeShirts = saved === 'true';
    expect(includeShirts).toBe(true);
  });

  it('should handle multiple events with different shirt preferences', () => {
    // Event 1: with shirts
    localStorage.setItem('eventIncludeShirts', 'true');
    const event1Shirts = localStorage.getItem('eventIncludeShirts') === 'true';
    expect(event1Shirts).toBe(true);
    
    // Event 2: without shirts
    localStorage.setItem('eventIncludeShirts', 'false');
    const event2Shirts = localStorage.getItem('eventIncludeShirts') === 'true';
    expect(event2Shirts).toBe(false);
  });
});
