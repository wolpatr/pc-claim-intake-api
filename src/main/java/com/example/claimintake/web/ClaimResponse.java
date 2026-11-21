package com.example.claimintake.web;

import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.domain.ClaimType;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ClaimResponse(
        String id,
        String claimantName,
        String claimantEmail,
        String claimantPhone,
        String policyNumber,
        LocalDate incidentDate,
        ClaimType claimType,
        String description,
        BigDecimal amount,
        ClaimStatus status) {

    public static ClaimResponse from(Claim claim) {
        return new ClaimResponse(
                claim.getId(),
                claim.getClaimantName(),
                claim.getClaimantEmail(),
                claim.getClaimantPhone(),
                claim.getPolicyNumber(),
                claim.getIncidentDate(),
                claim.getClaimType(),
                claim.getDescription(),
                claim.getAmount(),
                claim.getStatus());
    }
}
