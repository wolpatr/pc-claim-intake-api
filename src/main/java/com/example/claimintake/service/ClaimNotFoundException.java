package com.example.claimintake.service;

public final class ClaimNotFoundException extends RuntimeException {

    private final String claimId;

    public ClaimNotFoundException(String claimId) {
        super("No claim found with id '" + claimId + "'");
        this.claimId = claimId;
    }

    public String getClaimId() {
        return claimId;
    }
}
