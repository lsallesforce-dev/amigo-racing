import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Mobile Responsiveness', () => {
  it('should have responsive table classes in Registrations.tsx', () => {
    const filePath = path.join(__dirname, '../client/src/pages/Registrations.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for overflow-x-auto for horizontal scrolling
    expect(content).toContain('overflow-x-auto');
    
    // Check for min-w-full on tables
    expect(content).toContain('min-w-full');
    
    // Check for responsive padding on table cells
    expect(content).toContain('px-1 sm:px-2');
    expect(content).toContain('px-2 sm:px-4');
    
    // Check for responsive text sizes
    expect(content).toContain('text-xs sm:text-sm md:text-base');
  });

  it('should have touch-friendly input sizes in index.css', () => {
    const filePath = path.join(__dirname, '../client/src/index.css');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for mobile-friendly input heights
    expect(content).toContain('min-h-10 sm:min-h-9');
    
    // Check for input types covered
    expect(content).toContain('input[type="text"]');
    expect(content).toContain('input[type="email"]');
    expect(content).toContain('input[type="number"]');
    expect(content).toContain('input[type="time"]');
    expect(content).toContain('input[type="date"]');
  });

  it('should have responsive header in Home.tsx', () => {
    const filePath = path.join(__dirname, '../client/src/pages/Home.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive header height
    expect(content).toContain('h-14 md:h-16');
    
    // Check for responsive icon sizes
    expect(content).toContain('h-6 md:h-8');
    
    // Check for responsive text sizes
    expect(content).toContain('text-lg md:text-xl');
  });

  it('should have timeBetweenCategories in StartConfig interface', () => {
    const filePath = path.join(__dirname, '../client/src/pages/SorteoPage.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for timeBetweenCategories in interface
    expect(content).toContain('timeBetweenCategories?: number;');
  });

  it('should have timeBetweenCategories in upsert mutation schema', () => {
    const filePath = path.join(__dirname, '../server/routers.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for timeBetweenCategories in upsert input schema
    expect(content).toContain('timeBetweenCategories: z.number().optional()');
  });

  it('should have responsive image classes', () => {
    const filePath = path.join(__dirname, '../client/src/pages/Home.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for responsive image sizing
    expect(content).toContain('w-full h-full object-contain');
  });

  it('should have negative margin for overflow compensation on mobile tables', () => {
    const filePath = path.join(__dirname, '../client/src/pages/Registrations.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for negative margin to compensate for overflow
    expect(content).toContain('-mx-6 px-6 md:mx-0 md:px-0');
  });
});
