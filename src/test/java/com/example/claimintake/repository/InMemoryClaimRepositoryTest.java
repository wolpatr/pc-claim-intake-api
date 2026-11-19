package com.example.claimintake.repository;

import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.domain.ClaimType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryClaimRepositoryTest {

    private final InMemoryClaimRepository repository = new InMemoryClaimRepository();

    @Test
    void saveThenFindByIdReturnsTheSameClaim() {
        Claim claim = claim("CLM-000001", ClaimStatus.OPEN);

        repository.save(claim);

        assertEquals(Optional.of(claim), repository.findById("CLM-000001"));
    }

    @Test
    void findByIdReturnsEmptyForUnknownId() {
        assertTrue(repository.findById("CLM-999999").isEmpty());
    }

    @Test
    void findByIdReturnsEmptyForNullId() {
        assertTrue(repository.findById(null).isEmpty());
    }

    @Test
    void saveReplacesAnExistingClaimWithTheSameId() {
        Claim open = claim("CLM-000001", ClaimStatus.OPEN);
        Claim closed = open.withStatus(ClaimStatus.CLOSED);

        repository.save(open);
        repository.save(closed);

        assertEquals(Optional.of(closed), repository.findById("CLM-000001"));
        assertEquals(1, repository.findAll().size());
    }

    @Test
    void findAllReturnsClaimsInInsertionOrder() {
        Claim first = claim("CLM-000001", ClaimStatus.OPEN);
        Claim second = claim("CLM-000002", ClaimStatus.OPEN);

        repository.save(first);
        repository.save(second);

        assertEquals(List.of(first, second), repository.findAll());
    }

    @Test
    void findAllReturnsAnUnmodifiableSnapshot() {
        repository.save(claim("CLM-000001", ClaimStatus.OPEN));

        List<Claim> claims = repository.findAll();

        assertThrows(UnsupportedOperationException.class, () -> claims.remove(0));
    }

    @Test
    void saveRejectsNull() {
        assertThrows(NullPointerException.class, () -> repository.save(null));
    }

    private Claim claim(String id, ClaimStatus status) {
        return new Claim(
                id,
                "Ada Lovelace",
                "ada.lovelace@example.com",
                "555-0100",
                "POL-12345",
                LocalDate.of(2024, 5, 20),
                ClaimType.AUTO,
                "Rear-ended while stopped at a traffic light.",
                new BigDecimal("1500.00"),
                status);
    }
}
