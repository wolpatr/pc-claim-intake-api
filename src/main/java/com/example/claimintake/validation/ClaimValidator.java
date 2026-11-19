package com.example.claimintake.validation;

import com.example.claimintake.domain.ClaimSubmission;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public final class ClaimValidator {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern PHONE_PATTERN =
            Pattern.compile("^(?=.*[0-9])[0-9+()\\-\\s]{7,25}$");

    public void validate(ClaimSubmission submission) {
        Objects.requireNonNull(submission, "submission");

        List<String> errors = new ArrayList<>();

        requireText(errors, "claimantName", submission.getClaimantName());
        validateEmail(errors, submission.getClaimantEmail());
        validatePhone(errors, submission.getClaimantPhone());
        requireText(errors, "policyNumber", submission.getPolicyNumber());
        validateIncidentDate(errors, submission.getIncidentDate());

        if (submission.getClaimType() == null) {
            errors.add("claimType is required");
        }

        requireText(errors, "description", submission.getDescription());
        validateAmount(errors, submission.getAmount());

        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
    }

    private void requireText(List<String> errors, String field, String value) {
        if (isBlank(value)) {
            errors.add(field + " is required");
        }
    }

    private void validateEmail(List<String> errors, String email) {
        if (isBlank(email)) {
            errors.add("claimantEmail is required");
        } else if (!EMAIL_PATTERN.matcher(email.trim()).matches()) {
            errors.add("claimantEmail must be a valid email address");
        }
    }

    private void validatePhone(List<String> errors, String phone) {
        if (isBlank(phone)) {
            return;
        }
        if (!PHONE_PATTERN.matcher(phone.trim()).matches()) {
            errors.add("claimantPhone must be a valid phone number");
        }
    }

    private void validateIncidentDate(List<String> errors, LocalDate incidentDate) {
        if (incidentDate == null) {
            errors.add("incidentDate is required");
        } else if (incidentDate.isAfter(LocalDate.now())) {
            errors.add("incidentDate must not be in the future");
        }
    }

    private void validateAmount(List<String> errors, BigDecimal amount) {
        if (amount == null) {
            errors.add("amount is required");
        } else if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            errors.add("amount must be greater than zero");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
