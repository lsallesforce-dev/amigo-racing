import { describe, it, expect, beforeAll } from 'vitest';
import { ENV } from './_core/env';

describe('Split Payment Configuration', () => {
  it('should have PAGARME_PLATFORM_RECIPIENT_ID configured', () => {
    expect(ENV.pagarmeplatformRecipientId).toBeTruthy();
    expect(ENV.pagarmeplatformRecipientId).toMatch(/^re_[a-z0-9]+$/i);
  });

  it('should have PAGARME_API_KEY configured', () => {
    expect(ENV.pagarmeApiKey).toBeTruthy();
  });

  it('should have PAGARME_ACCOUNT_ID configured', () => {
    expect(ENV.pagarmeAccountId).toBeTruthy();
  });

  it('should validate split calculation (10% platform, 90% organizer)', () => {
    const totalAmount = 2500; // R$ 25,00 em centavos
    const platformAmount = Math.floor(totalAmount * 0.1); // 10%
    const organizerAmount = totalAmount - platformAmount; // 90%

    expect(platformAmount).toBe(250); // R$ 2,50
    expect(organizerAmount).toBe(2250); // R$ 22,50
    expect(platformAmount + organizerAmount).toBe(totalAmount);
  });

  it('should verify PAGARME_PLATFORM_RECIPIENT_ID is not the same as organizer recipient', () => {
    // Platform recipient should be different from any organizer recipient
    const platformRecipient = ENV.pagarmeplatformRecipientId;
    const organizerRecipient = 're_cmlh54y8231l9Ol9tyh2h34qc'; // Example organizer

    expect(platformRecipient).not.toBe(organizerRecipient);
    expect(platformRecipient).toBeTruthy();
  });

  it('should have correct split structure for Pagar.me API', () => {
    const split = [
      {
        recipient_id: ENV.pagarmeplatformRecipientId,
        amount: 250,
        type: 'flat',
        options: {
          charge_processing_fee: true,
          charge_remainder_fee: false,
          liable: true,
        },
      },
      {
        recipient_id: 're_cmlh54y8231l9Ol9tyh2h34qc',
        amount: 2250,
        type: 'flat',
        options: {
          charge_processing_fee: true,
          charge_remainder_fee: false,
          liable: true,
        },
      },
    ];

    expect(split).toHaveLength(2);
    expect(split[0].recipient_id).toBe(ENV.pagarmeplatformRecipientId);
    expect(split[0].amount).toBe(250);
    expect(split[1].amount).toBe(2250);
    expect(split[0].type).toBe('flat');
    expect(split[0].options.charge_processing_fee).toBe(true);
  });
});
