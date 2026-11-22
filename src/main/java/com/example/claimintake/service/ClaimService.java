package com.example.claimintake.service;

import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.domain.ClaimSubmission;

import java.util.List;

public interface ClaimService {

    Claim submit(ClaimSubmission submission);

    Claim getById(String claimId);

    List<Claim> list(ClaimStatus status);

    Claim updateStatus(String claimId, ClaimStatus newStatus);
}
