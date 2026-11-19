package com.example.claimintake.repository;

import com.example.claimintake.domain.Claim;

import java.util.List;
import java.util.Optional;

public interface ClaimRepository {

    Claim save(Claim claim);

    Optional<Claim> findById(String claimId);

    List<Claim> findAll();
}
