package com.example.claimintake.validation;

import java.util.List;
import java.util.Objects;

public final class ValidationException extends RuntimeException {

    private final List<String> errors;

    public ValidationException(List<String> errors) {
        super("Claim validation failed: " + String.join("; ", errors));
        this.errors = List.copyOf(Objects.requireNonNull(errors, "errors"));
    }

    public List<String> getErrors() {
        return errors;
    }
}
