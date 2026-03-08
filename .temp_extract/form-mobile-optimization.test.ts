import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Form Mobile Optimization', () => {
  it('should have responsive grid layout in EventDetails.tsx', () => {
    const filePath = path.join(__dirname, '../client/src/pages/EventDetails.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive grid (1 column mobile, 2+ columns desktop)
    expect(content).toContain('grid-cols-1 md:grid-cols-2');
    expect(content).toContain('grid-cols-1 md:grid-cols-3');
    expect(content).toContain('grid-cols-1 sm:grid-cols-2 md:grid-cols-3');
  });

  it('should have responsive dialog sizing', () => {
    const filePath = path.join(__dirname, '../client/src/pages/EventDetails.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive dialog width
    expect(content).toContain('max-w-full sm:max-w-3xl');
    expect(content).toContain('max-w-full sm:max-w-4xl');
    
    // Check for responsive padding
    expect(content).toContain('p-4 sm:p-6');
  });

  it('should have responsive text sizing in index.css', () => {
    const filePath = path.join(__dirname, '../client/src/index.css');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive text sizes
    expect(content).toContain('text-base sm:text-sm');
  });

  it('should have reduced spacing on mobile in index.css', () => {
    const filePath = path.join(__dirname, '../client/src/index.css');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for mobile spacing reduction
    expect(content).toContain('space-y-4');
    expect(content).toContain('space-y-3');
    expect(content).toContain('gap-3');
  });

  it('should have responsive grid in registrations summary', () => {
    const filePath = path.join(__dirname, '../client/src/pages/EventDetails.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive grid in registrations dialog
    expect(content).toContain('grid-cols-1 sm:grid-cols-2 md:grid-cols-3');
  });

  it('should have min-height on all inputs and buttons', () => {
    const filePath = path.join(__dirname, '../client/src/index.css');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for min-height on inputs
    expect(content).toContain('min-h-10 sm:min-h-9');
    
    // Check that multiple input types are covered
    expect(content).toContain('input[type="text"]');
    expect(content).toContain('input[type="email"]');
    expect(content).toContain('input[type="number"]');
    expect(content).toContain('input[type="date"]');
    expect(content).toContain('input[type="time"]');
    expect(content).toContain('textarea');
    expect(content).toContain('select');
  });

  it('should have all button types covered', () => {
    const filePath = path.join(__dirname, '../client/src/index.css');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for button selectors
    expect(content).toContain('button');
    expect(content).toContain('[role="button"]');
    expect(content).toContain('[type="button"]');
    expect(content).toContain('[type="submit"]');
    expect(content).toContain('[type="reset"]');
  });
});
