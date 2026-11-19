package com.example.claimintake.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

public final class Claim {

    private final String id;
    private final String claimantName;
    private final String claimantEmail;
    private final String claimantPhone;
    private final String policyNumber;
    private final LocalDate incidentDate;
    private final ClaimType claimType;
    private final String description;
    private final BigDecimal amount;
    private final ClaimStatus status;

    public Claim(String id,
                 String claimantName,
                 String claimantEmail,
                 String claimantPhone,
                 String policyNumber,
                 LocalDate incidentDate,
                 ClaimType claimType,
                 String description,
                 BigDecimal amount,
                 ClaimStatus status) {
        this.id = Objects.requireNonNull(id, "id");
        this.claimantName = Objects.requireNonNull(claimantName, "claimantName");
        this.claimantEmail = Objects.requireNonNull(claimantEmail, "claimantEmail");
        this.claimantPhone = claimantPhone;
        this.policyNumber = Objects.requireNonNull(policyNumber, "policyNumber");
        this.incidentDate = Objects.requireNonNull(incidentDate, "incidentDate");
        this.claimType = Objects.requireNonNull(claimType, "claimType");
        this.description = Objects.requireNonNull(description, "description");
        this.amount = Objects.requireNonNull(amount, "amount");
        this.status = Objects.requireNonNull(status, "status");
    }

    public String getId() {
        return id;
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

    public ClaimStatus getStatus() {
        return status;
    }

    public Claim withStatus(ClaimStatus newStatus) {
        return new Claim(id, claimantName, claimantEmail, claimantPhone, policyNumber,
                incidentDate, claimType, description, amount,
                Objects.requireNonNull(newStatus, "newStatus"));
    }
}
