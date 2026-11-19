package com.example.claimintake;

import com.example.claimintake.domain.ClaimType;
import com.example.claimintake.domain.ClaimSubmission;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ClaimTestData {

    private ClaimTestData() {
    }

    public static ClaimSubmission validSubmission() {
        return new ClaimSubmission(
                "Ada Lovelace",
                "ada.lovelace@example.com",
                "555-0100",
                "POL-12345",
                LocalDate.of(2024, 5, 20),
                ClaimType.AUTO,
                "Rear-ended while stopped at a traffic light.",
                new BigDecimal("1500.00"));
    }
}
