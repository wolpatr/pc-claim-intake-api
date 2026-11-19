package com.example.claimintake.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ClaimTest {

    private Claim sampleClaim() {
        return new Claim(
                "CLM-000001",
                "Ada Lovelace",
                "ada.lovelace@example.com",
                "555-0100",
                "POL-12345",
                LocalDate.of(2024, 5, 20),
                ClaimType.AUTO,
                "Rear-ended while stopped at a traffic light.",
                new BigDecimal("1500.00"),
                ClaimStatus.OPEN);
    }

    @Test
    void withStatusReturnsNewClaimCarryingEveryOtherDetail() {
        Claim original = sampleClaim();

        Claim updated = original.withStatus(ClaimStatus.IN_REVIEW);

        assertNotSame(original, updated);
        assertEquals(ClaimStatus.IN_REVIEW, updated.getStatus());
        assertEquals(original.getId(), updated.getId());
        assertEquals(original.getClaimantName(), updated.getClaimantName());
        assertEquals(original.getClaimantEmail(), updated.getClaimantEmail());
        assertEquals(original.getClaimantPhone(), updated.getClaimantPhone());
        assertEquals(original.getPolicyNumber(), updated.getPolicyNumber());
        assertEquals(original.getIncidentDate(), updated.getIncidentDate());
        assertEquals(original.getClaimType(), updated.getClaimType());
        assertEquals(original.getDescription(), updated.getDescription());
        assertEquals(original.getAmount(), updated.getAmount());
    }

    @Test
    void withStatusLeavesTheOriginalClaimUnchanged() {
        Claim original = sampleClaim();

        original.withStatus(ClaimStatus.CLOSED);

        assertEquals(ClaimStatus.OPEN, original.getStatus());
    }

    @Test
    void withStatusRejectsNull() {
        Claim original = sampleClaim();

        assertThrows(NullPointerException.class, () -> original.withStatus(null));
    }

    @Test
    void constructorRejectsMissingCoreFields() {
        assertThrows(NullPointerException.class, () -> new Claim(
                null, "Ada", "ada@example.com", null, "POL-1",
                LocalDate.of(2024, 5, 20), ClaimType.AUTO, "Hail damage",
                new BigDecimal("10.00"), ClaimStatus.OPEN));
    }
}
