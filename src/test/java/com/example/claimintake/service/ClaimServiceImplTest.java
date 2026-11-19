package com.example.claimintake.service;

import com.example.claimintake.ClaimTestData;
import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.domain.ClaimSubmission;
import com.example.claimintake.domain.ClaimType;
import com.example.claimintake.repository.InMemoryClaimRepository;
import com.example.claimintake.validation.ClaimValidator;
import com.example.claimintake.validation.ValidationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClaimServiceImplTest {

    private InMemoryClaimRepository repository;
    private ClaimServiceImpl service;

    @BeforeEach
    void setUp() {
        repository = new InMemoryClaimRepository();
        service = new ClaimServiceImpl(repository, new ClaimValidator());
    }

    @Test
    void submitAssignsAnIdAndStartsTheClaimOpen() {
        Claim claim = service.submit(ClaimTestData.validSubmission());

        assertNotNull(claim.getId());
        assertFalse(claim.getId().isBlank());
        assertEquals(ClaimStatus.OPEN, claim.getStatus());
        assertEquals("Ada Lovelace", claim.getClaimantName());
        assertEquals("POL-12345", claim.getPolicyNumber());
        assertEquals(ClaimType.AUTO, claim.getClaimType());
        assertEquals(new BigDecimal("1500.00"), claim.getAmount());
    }

    @Test
    void submitStoresTheClaimSoItCanBeRetrieved() {
        Claim submitted = service.submit(ClaimTestData.validSubmission());

        Claim retrieved = service.getById(submitted.getId());

        assertEquals(submitted, retrieved);
        assertEquals(1, repository.findAll().size());
    }

    @Test
    void submitGivesEachClaimADistinctId() {
        Claim first = service.submit(ClaimTestData.validSubmission());
        Claim second = service.submit(ClaimTestData.validSubmission());

        assertNotEquals(first.getId(), second.getId());
    }

    @Test
    void submitFormatsIdWithAsciiDigitsRegardlessOfDefaultLocale() {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-EG"));

            Claim claim = service.submit(ClaimTestData.validSubmission());

            assertTrue(claim.getId().matches("CLM-[0-9]{6}"), claim.getId());
        } finally {
            Locale.setDefault(original);
        }
    }

    @Test
    void submitRejectsInvalidInputWithoutStoringAnything() {
        ClaimSubmission invalid = new ClaimSubmission(
                " ", null, null, null, null, null, null, null);

        assertThrows(ValidationException.class, () -> service.submit(invalid));
        assertTrue(repository.findAll().isEmpty());
    }

    @Test
    void getByIdReturnsTheRequestedClaimNotAnotherOne() {
        Claim first = service.submit(ClaimTestData.validSubmission());
        Claim second = service.submit(ClaimTestData.validSubmission());

        assertEquals(second, service.getById(second.getId()));
        assertEquals(first, service.getById(first.getId()));
    }

    @Test
    void getByIdRejectsUnknownId() {
        ClaimNotFoundException exception = assertThrows(ClaimNotFoundException.class,
                () -> service.getById("CLM-999999"));

        assertEquals("CLM-999999", exception.getClaimId());
    }

    @Test
    void getByIdRejectsBlankId() {
        assertThrows(ValidationException.class, () -> service.getById("   "));
        assertThrows(ValidationException.class, () -> service.getById(null));
    }

    @Test
    void updateStatusChangesOnlyTheStatus() {
        Claim original = service.submit(ClaimTestData.validSubmission());

        Claim updated = service.updateStatus(original.getId(), ClaimStatus.IN_REVIEW);

        assertEquals(ClaimStatus.IN_REVIEW, updated.getStatus());
        assertEquals(original.getId(), updated.getId());
        assertEquals(original.getClaimantName(), updated.getClaimantName());
        assertEquals(original.getClaimantEmail(), updated.getClaimantEmail());
        assertEquals(original.getClaimantPhone(), updated.getClaimantPhone());
        assertEquals(original.getPolicyNumber(), updated.getPolicyNumber());
        assertEquals(original.getIncidentDate(), updated.getIncidentDate());
        assertEquals(original.getClaimType(), updated.getClaimType());
        assertEquals(original.getDescription(), updated.getDescription());
        assertEquals(original.getAmount(), updated.getAmount());
    }

    @Test
    void updateStatusPersistsTheNewStatus() {
        Claim original = service.submit(ClaimTestData.validSubmission());

        service.updateStatus(original.getId(), ClaimStatus.CLOSED);

        assertEquals(ClaimStatus.CLOSED, service.getById(original.getId()).getStatus());
    }

    @Test
    void updateStatusAcceptsEveryDefinedStatus() {
        Claim claim = service.submit(ClaimTestData.validSubmission());

        for (ClaimStatus status : ClaimStatus.values()) {
            Claim updated = service.updateStatus(claim.getId(), status);
            assertEquals(status, updated.getStatus());
        }
    }

    @Test
    void updateStatusRejectsMissingStatus() {
        Claim claim = service.submit(ClaimTestData.validSubmission());

        assertThrows(ValidationException.class,
                () -> service.updateStatus(claim.getId(), (ClaimStatus) null));
    }

    @Test
    void updateStatusRejectsUnknownClaimId() {
        assertThrows(ClaimNotFoundException.class,
                () -> service.updateStatus("CLM-999999", ClaimStatus.CLOSED));
    }

    @Test
    void submitKeepsIncidentDateFromTheSubmission() {
        Claim claim = service.submit(new ClaimSubmission(
                "Grace Hopper",
                "grace.hopper@example.com",
                null,
                "POL-777",
                LocalDate.of(2023, 11, 2),
                ClaimType.PROPERTY,
                "Fallen tree damaged the roof.",
                new BigDecimal("4200.50")));

        assertEquals(LocalDate.of(2023, 11, 2), claim.getIncidentDate());
        assertNull(claim.getClaimantPhone());
    }
}
