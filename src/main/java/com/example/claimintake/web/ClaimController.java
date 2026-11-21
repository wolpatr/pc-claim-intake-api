package com.example.claimintake.web;

import com.example.claimintake.domain.Claim;
import com.example.claimintake.domain.ClaimStatus;
import com.example.claimintake.service.ClaimService;
import com.example.claimintake.validation.ValidationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/claims")
public class ClaimController {

    private final ClaimService claimService;

    public ClaimController(ClaimService claimService) {
        this.claimService = claimService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClaimResponse submit(@RequestBody ClaimRequest request) {
        Claim claim = claimService.submit(request.toSubmission());
        return ClaimResponse.from(claim);
    }

    @GetMapping("/{id}")
    public ClaimResponse getById(@PathVariable String id) {
        return ClaimResponse.from(claimService.getById(id));
    }

    @PatchMapping("/{id}/status")
    public ClaimResponse updateStatus(@PathVariable String id,
                                      @RequestBody StatusUpdateRequest request) {
        return ClaimResponse.from(claimService.updateStatus(id, parseStatus(request.status())));
    }

    private ClaimStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            throw new ValidationException(List.of("status is required"));
        }
        try {
            return ClaimStatus.valueOf(status);
        } catch (IllegalArgumentException exception) {
            throw new ValidationException(List.of(
                    "status must be one of OPEN, IN_REVIEW, CLOSED"));
        }
    }
}
