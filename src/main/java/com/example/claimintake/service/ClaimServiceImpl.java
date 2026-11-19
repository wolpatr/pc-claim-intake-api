package com.example.claimintake.service;

import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.domain.ClaimSubmission;
import com.example.claimintake.repository.ClaimRepository;
import com.example.claimintake.validation.ClaimValidator;
import com.example.claimintake.validation.ValidationException;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

public final class ClaimServiceImpl implements ClaimService {

    private static final String CLAIM_ID_PREFIX = "CLM-";

    private final ClaimRepository repository;
    private final ClaimValidator validator;
    private final AtomicLong idSequence = new AtomicLong();

    public ClaimServiceImpl(ClaimRepository repository, ClaimValidator validator) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.validator = Objects.requireNonNull(validator, "validator");
    }

    @Override
    public Claim submit(ClaimSubmission submission) {
        validator.validate(submission);

        Claim claim = new Claim(
                nextClaimId(),
                submission.getClaimantName(),
                submission.getClaimantEmail(),
                submission.getClaimantPhone(),
                submission.getPolicyNumber(),
                submission.getIncidentDate(),
                submission.getClaimType(),
                submission.getDescription(),
                submission.getAmount(),
                ClaimStatus.OPEN);

        return repository.save(claim);
    }

    @Override
    public Claim getById(String claimId) {
        if (claimId == null || claimId.isBlank()) {
            throw new ValidationException(List.of("claimId is required"));
        }
        return repository.findById(claimId)
                .orElseThrow(() -> new ClaimNotFoundException(claimId));
    }

    @Override
    public Claim updateStatus(String claimId, ClaimStatus newStatus) {
        if (newStatus == null) {
            throw new ValidationException(List.of("status is required"));
        }
        Claim current = getById(claimId);
        return repository.save(current.withStatus(newStatus));
    }

    private String nextClaimId() {
        return CLAIM_ID_PREFIX + String.format("%06d", idSequence.incrementAndGet());
    }
}
