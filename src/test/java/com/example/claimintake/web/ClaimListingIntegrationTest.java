package com.example.claimintake.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class ClaimListingIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void emptyStoreReturnsEmptyJsonArray() throws Exception {
        mockMvc.perform(get("/claims"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void listsEveryClaimWithTheFullResponseShape() throws Exception {
        submitClaim(claim("Ada Lovelace", "POL-12345", "1500.00"));
        String newestId = submitClaim(claim("Grace Hopper", "POL-777", "4200.50"));

        mockMvc.perform(get("/claims"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(newestId))
                .andExpect(jsonPath("$[0].claimantName").value("Grace Hopper"))
                .andExpect(jsonPath("$[0].claimantEmail").value("ada.lovelace@example.com"))
                .andExpect(jsonPath("$[0].claimantPhone").value("555-0100"))
                .andExpect(jsonPath("$[0].policyNumber").value("POL-777"))
                .andExpect(jsonPath("$[0].incidentDate").value("2024-05-20"))
                .andExpect(jsonPath("$[0].claimType").value("AUTO"))
                .andExpect(jsonPath("$[0].description")
                        .value("Rear-ended while stopped at a traffic light."))
                .andExpect(jsonPath("$[0].amount").value(4200.50))
                .andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[1].claimantName").value("Ada Lovelace"));
    }

    @Test
    void listsNewestClaimFirst() throws Exception {
        String oldestId = submitClaim(claim("Oldest Claim", "POL-1", "10.00"));
        String middleId = submitClaim(claim("Middle Claim", "POL-2", "20.00"));
        String newestId = submitClaim(claim("Newest Claim", "POL-3", "30.00"));

        mockMvc.perform(get("/claims"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(newestId, middleId, oldestId)));
    }

    @Test
    void statusFilterReturnsOnlyMatchingClaimsNewestFirst() throws Exception {
        String openId = submitClaim(claim("Open Claim", "POL-1", "10.00"));
        String inReviewId = submitClaim(claim("In Review Claim", "POL-2", "20.00"));
        String closedId = submitClaim(claim("Closed Claim", "POL-3", "30.00"));
        updateStatus(openId, "IN_REVIEW");
        updateStatus(inReviewId, "IN_REVIEW");
        updateStatus(closedId, "CLOSED");

        mockMvc.perform(get("/claims").param("status", "IN_REVIEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].id").value(contains(inReviewId, openId)))
                .andExpect(jsonPath("$[*].status").value(contains("IN_REVIEW", "IN_REVIEW")));

        mockMvc.perform(get("/claims").param("status", "CLOSED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(closedId));

        mockMvc.perform(get("/claims").param("status", "OPEN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void missingStatusReturnsEveryClaim() throws Exception {
        submitClaim(claim("Open Claim", "POL-1", "10.00"));
        String closedId = submitClaim(claim("Closed Claim", "POL-2", "20.00"));
        updateStatus(closedId, "CLOSED");

        mockMvc.perform(get("/claims"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void unrecognizedStatusReturns400WithTheSharedErrorShape() throws Exception {
        for (String statusValue : new String[]{"LOST", "open", "in_review", " OPEN ", "OPEN "}) {
            mockMvc.perform(get("/claims").param("status", statusValue))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.error").value("Bad Request"))
                    .andExpect(jsonPath("$.message").value("Claim validation failed"))
                    .andExpect(jsonPath("$.fieldErrors.length()").value(1))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("status"))
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value("status must be one of OPEN, IN_REVIEW, CLOSED"));
        }
    }

    @Test
    void blankStatusReturns400WithTheSharedErrorShape() throws Exception {
        mockMvc.perform(get("/claims").param("status", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));
    }

    private String submitClaim(String body) throws Exception {
        MvcResult result = mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode claim = objectMapper.readTree(result.getResponse().getContentAsString());
        return claim.get("id").asText();
    }

    private void updateStatus(String id, String status) throws Exception {
        mockMvc.perform(patch("/claims/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"" + status + "\"}"))
                .andExpect(status().isOk());
    }

    private String claim(String claimantName, String policyNumber, String amount) {
        return validClaim()
                .replace("Ada Lovelace", claimantName)
                .replace("POL-12345", policyNumber)
                .replace("1500.00", amount);
    }

    private String validClaim() {
        return """
                {
                  "claimantName": "Ada Lovelace",
                  "claimantEmail": "ada.lovelace@example.com",
                  "claimantPhone": "555-0100",
                  "policyNumber": "POL-12345",
                  "incidentDate": "2024-05-20",
                  "claimType": "AUTO",
                  "description": "Rear-ended while stopped at a traffic light.",
                  "amount": 1500.00
                }
                """;
    }
}
