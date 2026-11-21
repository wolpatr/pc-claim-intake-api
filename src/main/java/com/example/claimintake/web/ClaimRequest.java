package com.example.claimintake.web;

import com.example.claimintake.domain.ClaimSubmission;
import com.example.claimintake.domain.ClaimType;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ClaimRequest(
        String claimantName,
        String claimantEmail,
        String claimantPhone,
        String policyNumber,
        LocalDate incidentDate,
        ClaimType claimType,
        String description,
        BigDecimal amount) {

    public ClaimSubmission toSubmission() {
        return new ClaimSubmission(
                claimantName,
                claimantEmail,
                claimantPhone,
                policyNumber,
                incidentDate,
                claimType,
                description,
                amount);
    }
}
