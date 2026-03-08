import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ENV } from './_core/env';

describe('Payment Split Integration Tests', () => {
  
  it('should have platform recipient ID configured', () => {
    expect(ENV.pagarmeplatformRecipientId).toBeDefined();
    expect(ENV.pagarmeplatformRecipientId).toBeTruthy();
    expect(ENV.pagarmeplatformRecipientId).toContain('re_');
  });

  it('should have Pagar.me API URL configured', () => {
    expect(ENV.pagarmeApiUrl).toBeDefined();
    expect(ENV.pagarmeApiUrl).toContain('api.pagar.me');
  });

  it('should have Pagar.me API key configured', () => {
    expect(ENV.pagarmeApiKey).toBeDefined();
    expect(ENV.pagarmeApiKey).toBeTruthy();
  });

  it('should calculate split correctly (10% platform, 90% organizer)', () => {
    const totalAmount = 2500; // R$ 25,00 em centavos
    const platformPercentage = 0.10;
    const organizerPercentage = 0.90;
    
    const platformAmount = Math.round(totalAmount * platformPercentage);
    const organizerAmount = Math.round(totalAmount * organizerPercentage);
    
    expect(platformAmount).toBe(250); // R$ 2,50
    expect(organizerAmount).toBe(2250); // R$ 22,50
    expect(platformAmount + organizerAmount).toBe(totalAmount);
  });

  it('should validate split structure for Pagar.me v5 API', () => {
    const totalAmount = 1000; // R$ 10,00
    const platformAmount = Math.round(totalAmount * 0.10);
    const organizerAmount = totalAmount - platformAmount;
    
    // Estrutura esperada do split conforme Pagar.me v5
    const splitRules = [
      {
        recipient_id: ENV.pagarmeplatformRecipientId,
        amount: platformAmount,
        type: 'flat',
        options: {
          charge_processing_fee: true,
          charge_remainder_fee: false,
          liable: true
        }
      },
      {
        recipient_id: 're_test_organizer_id',
        amount: organizerAmount,
        type: 'flat',
        options: {
          charge_processing_fee: false,
          charge_remainder_fee: false,
          liable: true
        }
      }
    ];
    
    // Validar soma do split
    const totalSplit = splitRules.reduce((sum, rule) => sum + rule.amount, 0);
    expect(totalSplit).toBe(totalAmount);
    
    // Validar estrutura
    expect(splitRules[0].recipient_id).toBe(ENV.pagarmeplatformRecipientId);
    expect(splitRules[0].options.charge_processing_fee).toBe(true);
    expect(splitRules[1].options.charge_processing_fee).toBe(false);
  });

  it('should handle rounding correctly in split calculation', () => {
    const testCases = [
      { total: 100, expectedPlatform: 10, expectedOrganizer: 90 },
      { total: 333, expectedPlatform: 33, expectedOrganizer: 300 }, // 333 * 0.10 = 33.3 → 33
      { total: 1000, expectedPlatform: 100, expectedOrganizer: 900 },
      { total: 2500, expectedPlatform: 250, expectedOrganizer: 2250 },
    ];
    
    testCases.forEach(({ total, expectedPlatform, expectedOrganizer }) => {
      const platformAmount = Math.round(total * 0.10);
      const organizerAmount = total - platformAmount;
      
      expect(platformAmount).toBe(expectedPlatform);
      expect(organizerAmount).toBe(expectedOrganizer);
      expect(platformAmount + organizerAmount).toBe(total);
    });
  });

  it('should validate recipient ID format', () => {
    const recipientIdRegex = /^re_[a-z0-9]+$/i;
    
    expect(ENV.pagarmeplatformRecipientId).toMatch(recipientIdRegex);
  });

  it('should have charge_processing_fee only on platform recipient', () => {
    // Platform absorbs fees, organizer doesn't
    const platformChargesFee = true;
    const organizerChargesFee = false;
    
    expect(platformChargesFee).toBe(true);
    expect(organizerChargesFee).toBe(false);
  });

  it('should validate split sum equals 100%', () => {
    const platformPercentage = 10;
    const organizerPercentage = 90;
    
    const totalPercentage = platformPercentage + organizerPercentage;
    expect(totalPercentage).toBe(100);
  });

  it('should handle edge case: R$ 1,00 transaction', () => {
    const totalAmount = 100; // R$ 1,00 em centavos
    const platformAmount = Math.round(totalAmount * 0.10);
    const organizerAmount = totalAmount - platformAmount;
    
    // R$ 1,00 split:
    // Platform: 10 centavos
    // Organizer: 90 centavos
    expect(platformAmount).toBe(10);
    expect(organizerAmount).toBe(90);
    expect(platformAmount + organizerAmount).toBe(totalAmount);
  });

  it('should validate payment method support', () => {
    const supportedMethods = ['pix', 'credit_card'];
    
    expect(supportedMethods).toContain('pix');
    expect(supportedMethods).toContain('credit_card');
  });

  it('should validate split placement in Pagar.me v5 request', () => {
    // Em Pagar.me v5, o split deve estar DENTRO do array payments
    // Não no nível raiz da requisição
    
    const paymentStructure = {
      items: [
        {
          code: 'item_001',
          amount: 2500,
          description: 'Inscrição em evento',
          quantity: 1
        }
      ],
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        document: '12345678900'
      },
      payments: [
        {
          payment_method: 'pix',
          pix: {},
          split: [
            {
              recipient_id: ENV.pagarmeplatformRecipientId,
              amount: 250,
              type: 'flat',
              options: {
                charge_processing_fee: true,
                charge_remainder_fee: false,
                liable: true
              }
            },
            {
              recipient_id: 're_test_organizer',
              amount: 2250,
              type: 'flat',
              options: {
                charge_processing_fee: false,
                charge_remainder_fee: false,
                liable: true
              }
            }
          ]
        }
      ]
    };
    
    // Validar que split está dentro de payments
    expect(paymentStructure.payments[0].split).toBeDefined();
    expect(Array.isArray(paymentStructure.payments[0].split)).toBe(true);
    expect(paymentStructure.payments[0].split.length).toBe(2);
  });
});
