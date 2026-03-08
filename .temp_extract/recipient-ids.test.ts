import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("Recipient IDs Configuration", () => {
  it("should have PAGARME_PLATFORM_RECIPIENT_ID configured", () => {
    expect(ENV.pagarmeplatformRecipientId).toBeDefined();
    expect(ENV.pagarmeplatformRecipientId).toBe("re_cmlip76jfhai70l9thzwxtn4g");
  });

  it("should have PAGARME_ORGANIZER_RECIPIENT_ID configured", () => {
    expect(ENV.pagarmeorganizerRecipientId).toBeDefined();
    expect(ENV.pagarmeorganizerRecipientId).toBe("re_cmlh54y8231l90l9tyh2h34qc");
  });

  it("should not use the rejected recipient ID", () => {
    const rejectedId = "re_cmljjzploe95n0l9t81vkz1cj";
    expect(ENV.pagarmeplatformRecipientId).not.toBe(rejectedId);
    expect(ENV.pagarmeorganizerRecipientId).not.toBe(rejectedId);
  });

  it("should have different IDs for platform and organizer", () => {
    expect(ENV.pagarmeplatformRecipientId).not.toBe(ENV.pagarmeorganizerRecipientId);
  });

  it("should have valid recipient ID format", () => {
    const recipientIdPattern = /^re_[a-zA-Z0-9]+$/;
    expect(ENV.pagarmeplatformRecipientId).toMatch(recipientIdPattern);
    expect(ENV.pagarmeorganizerRecipientId).toMatch(recipientIdPattern);
  });
});
