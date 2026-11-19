package com.example.claimintake.validation;

import com.example.claimintake.ClaimTestData;
import com.example.claimintake.domain.ClaimSubmission;
import com.example.claimintake.domain.ClaimType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClaimValidatorTest {

    private final ClaimValidator validator = new ClaimValidator();

    @Test
    void acceptsFullyValidSubmission() {
        assertDoesNotThrow(() -> validator.validate(ClaimTestData.validSubmission()));
    }

    @Test
    void acceptsSubmissionWithoutOptionalPhone() {
        ClaimSubmission submission = submission("ada@example.com", null);

        assertDoesNotThrow(() -> validator.validate(submission));
    }

    @Test
    void rejectsSubmissionWhereEveryRequiredFieldIsMissing() {
        ClaimSubmission submission = new ClaimSubmission(
                null, null, null, null, null, null, null, null);

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        List<String> errors = exception.getErrors();
        assertTrue(errors.contains("claimantName is required"));
        assertTrue(errors.contains("claimantEmail is required"));
        assertTrue(errors.contains("policyNumber is required"));
        assertTrue(errors.contains("incidentDate is required"));
        assertTrue(errors.contains("claimType is required"));
        assertTrue(errors.contains("description is required"));
        assertTrue(errors.contains("amount is required"));
    }

    @Test
    void treatsWhitespaceOnlyTextAsMissing() {
        ClaimSubmission submission = new ClaimSubmission(
                "   ", "  ", " ", " ", LocalDate.of(2024, 5, 20), ClaimType.PROPERTY,
                "\t\n", new BigDecimal("10.00"));

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        assertTrue(exception.getErrors().contains("claimantName is required"));
        assertTrue(exception.getErrors().contains("claimantEmail is required"));
        assertTrue(exception.getErrors().contains("policyNumber is required"));
        assertTrue(exception.getErrors().contains("description is required"));
    }

    @Test
    void reportsEveryProblemInOnePass() {
        ClaimSubmission submission = new ClaimSubmission(
                "Ada", "not-an-email", null, "POL-1", LocalDate.now().plusDays(1),
                ClaimType.AUTO, "Hail damage", BigDecimal.ZERO);

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        assertEquals(List.of(
                "claimantEmail must be a valid email address",
                "incidentDate must not be in the future",
                "amount must be greater than zero"), exception.getErrors());
    }

    @Test
    void rejectsMalformedEmail() {
        ClaimSubmission submission = submission("ada.example.com", "555-0100");

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        assertTrue(exception.getErrors().contains("claimantEmail must be a valid email address"));
    }

    @Test
    void rejectsMalformedPhoneWhenProvided() {
        ClaimSubmission submission = submission("ada@example.com", "call me");

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        assertTrue(exception.getErrors().contains("claimantPhone must be a valid phone number"));
    }

    @Test
    void rejectsFutureIncidentDate() {
        ClaimSubmission submission = new ClaimSubmission(
                "Ada", "ada@example.com", "555-0100", "POL-1", LocalDate.now().plusDays(1),
                ClaimType.AUTO, "Storm damage", new BigDecimal("10.00"));

        ValidationException exception =
                assertThrows(ValidationException.class, () -> validator.validate(submission));

        assertTrue(exception.getErrors().contains("incidentDate must not be in the future"));
    }

    @Test
    void rejectsNonPositiveAmount() {
        ValidationException zero = assertThrows(ValidationException.class,
                () -> validator.validate(withAmount(BigDecimal.ZERO)));
        ValidationException negative = assertThrows(ValidationException.class,
                () -> validator.validate(withAmount(new BigDecimal("-0.01"))));

        assertTrue(zero.getErrors().contains("amount must be greater than zero"));
        assertTrue(negative.getErrors().contains("amount must be greater than zero"));
    }

    @Test
    void rejectsNullSubmission() {
        assertThrows(NullPointerException.class, () -> validator.validate(null));
    }

    private ClaimSubmission submission(String email, String phone) {
        return new ClaimSubmission(
                "Ada Lovelace", email, phone, "POL-12345", LocalDate.of(2024, 5, 20),
                ClaimType.AUTO, "Rear-ended at a light.", new BigDecimal("1500.00"));
    }

    private ClaimSubmission withAmount(BigDecimal amount) {
        return new ClaimSubmission(
                "Ada Lovelace", "ada@example.com", "555-0100", "POL-12345",
                LocalDate.of(2024, 5, 20), ClaimType.AUTO, "Rear-ended at a light.", amount);
    }
}
