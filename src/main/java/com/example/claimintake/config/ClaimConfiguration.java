package com.example.claimintake.config;

import com.example.claimintake.repository.ClaimRepository;
import com.example.claimintake.repository.InMemoryClaimRepository;
import com.example.claimintake.service.ClaimService;
import com.example.claimintake.service.ClaimServiceImpl;
import com.example.claimintake.validation.ClaimValidator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClaimConfiguration {

    @Bean
    public ClaimRepository claimRepository() {
        return new InMemoryClaimRepository();
    }

    @Bean
    public ClaimValidator claimValidator() {
        return new ClaimValidator();
    }

    @Bean
    public ClaimService claimService(ClaimRepository repository, ClaimValidator validator) {
        return new ClaimServiceImpl(repository, validator);
    }
}
