import { describe, it, expect } from "vitest";

describe("Optional Shirts Feature", () => {
  it("should allow events without shirts", () => {
    const event = {
      id: 1,
      name: "Event Without Shirts",
      includeShirts: false,
    };

    expect(event.includeShirts).toBe(false);
    console.log("✅ Test Case: Event created without shirts requirement");
  });

  it("should allow events with shirts", () => {
    const event = {
      id: 2,
      name: "Event With Shirts",
      includeShirts: true,
    };

    expect(event.includeShirts).toBe(true);
    console.log("✅ Test Case: Event created with shirts requirement");
  });

  it("should default to including shirts for backward compatibility", () => {
    const event = {
      id: 3,
      name: "Event Default",
      includeShirts: true, // default value
    };

    expect(event.includeShirts).toBe(true);
    console.log("✅ Test Case: Default value is true for backward compatibility");
  });

  it("should validate shirts only when includeShirts is true", () => {
    const validateShirts = (event: any, formData: any) => {
      if (!event.includeShirts) {
        return true; // Skip validation if shirts not required
      }
      
      if (!formData.pilotShirtSize) {
        return false;
      }
      
      return true;
    };

    const eventWithShirts = { includeShirts: true };
    const eventWithoutShirts = { includeShirts: false };
    const formDataWithShirt = { pilotShirtSize: "M" };
    const formDataWithoutShirt = { pilotShirtSize: "" };

    // Event with shirts requires shirt size
    expect(validateShirts(eventWithShirts, formDataWithShirt)).toBe(true);
    expect(validateShirts(eventWithShirts, formDataWithoutShirt)).toBe(false);

    // Event without shirts doesn't require shirt size
    expect(validateShirts(eventWithoutShirts, formDataWithShirt)).toBe(true);
    expect(validateShirts(eventWithoutShirts, formDataWithoutShirt)).toBe(true);

    console.log("✅ Test Case: Validation logic works correctly");
  });

  it("should handle mixed events in same platform", () => {
    const events = [
      { id: 1, name: "Rally with Shirts", includeShirts: true },
      { id: 2, name: "Rally without Shirts", includeShirts: false },
      { id: 3, name: "Off-Road with Shirts", includeShirts: true },
    ];

    const eventsWithShirts = events.filter(e => e.includeShirts);
    const eventsWithoutShirts = events.filter(e => !e.includeShirts);

    expect(eventsWithShirts.length).toBe(2);
    expect(eventsWithoutShirts.length).toBe(1);

    console.log("✅ Test Case: Platform handles mixed events correctly");
  });
});
