package com.example.claimintake.repository;

import com.example.claimintake.domain.Claim;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class InMemoryClaimRepository implements ClaimRepository {

    private final Map<String, Claim> claims = new LinkedHashMap<>();

    @Override
    public synchronized Claim save(Claim claim) {
        Objects.requireNonNull(claim, "claim");
        claims.put(claim.getId(), claim);
        return claim;
    }

    @Override
    public synchronized Optional<Claim> findById(String claimId) {
        if (claimId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(claims.get(claimId));
    }

    @Override
    public synchronized List<Claim> findAll() {
        return List.copyOf(claims.values());
    }
}
