package com.example.claimintake.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ClaimSubmission {

    private final String claimantName;
    private final String claimantEmail;
    private final String claimantPhone;
    private final String policyNumber;
    private final LocalDate incidentDate;
    private final ClaimType claimType;
    private final String description;
    private final BigDecimal amount;

    public ClaimSubmission(String claimantName,
                           String claimantEmail,
                           String claimantPhone,
                           String policyNumber,
                           LocalDate incidentDate,
                           ClaimType claimType,
                           String description,
                           BigDecimal amount) {
        this.claimantName = claimantName;
        this.claimantEmail = claimantEmail;
        this.claimantPhone = claimantPhone;
        this.policyNumber = policyNumber;
        this.incidentDate = incidentDate;
        this.claimType = claimType;
        this.description = description;
        this.amount = amount;
    }

    public String getClaimantName() {
        return claimantName;
    }

    public String getClaimantEmail() {
        return claimantEmail;
    }

    public String getClaimantPhone() {
        return claimantPhone;
    }

    public String getPolicyNumber() {
        return policyNumber;
    }

    public LocalDate getIncidentDate() {
        return incidentDate;
    }

    public ClaimType getClaimType() {
        return claimType;
    }

    public String getDescription() {
        return description;
    }

    public BigDecimal getAmount() {
        return amount;
    }
}
