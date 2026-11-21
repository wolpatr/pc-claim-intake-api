package com.example.claimintake.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.matchesPattern;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ClaimControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void postValidClaimReturns201WithGeneratedIdAndOpenStatus() throws Exception {
        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validClaim()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", matchesPattern("CLM-[0-9]{6}")))
                .andExpect(jsonPath("$.claimantName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.claimantEmail").value("ada.lovelace@example.com"))
                .andExpect(jsonPath("$.claimantPhone").value("555-0100"))
                .andExpect(jsonPath("$.policyNumber").value("POL-12345"))
                .andExpect(jsonPath("$.incidentDate").value("2024-05-20"))
                .andExpect(jsonPath("$.claimType").value("AUTO"))
                .andExpect(jsonPath("$.description")
                        .value("Rear-ended while stopped at a traffic light."))
                .andExpect(jsonPath("$.amount").value(1500.00))
                .andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void postWithoutOptionalPhoneIsAccepted() throws Exception {
        String body = """
                {
                  "claimantName": "Grace Hopper",
                  "claimantEmail": "grace.hopper@example.com",
                  "policyNumber": "POL-777",
                  "incidentDate": "2023-11-02",
                  "claimType": "PROPERTY",
                  "description": "Fallen tree damaged the roof.",
                  "amount": 4200.50
                }
                """;

        MvcResult result = mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode claim = objectMapper.readTree(result.getResponse().getContentAsString());
        assertTrue(claim.get("claimantPhone").isNull());
    }

    @Test
    void postMissingEveryRequiredFieldReturns400NamingEachField() throws Exception {
        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Claim validation failed"))
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems(
                        "claimantName",
                        "claimantEmail",
                        "policyNumber",
                        "incidentDate",
                        "claimType",
                        "description",
                        "amount")));
    }

    @Test
    void postWhitespaceOnlyTextIsTreatedAsMissing() throws Exception {
        String body = """
                {
                  "claimantName": "   ",
                  "claimantEmail": "  ",
                  "policyNumber": " ",
                  "incidentDate": "2024-05-20",
                  "claimType": "PROPERTY",
                  "description": "\\t\\n",
                  "amount": 10.00
                }
                """;

        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems(
                        "claimantName",
                        "claimantEmail",
                        "policyNumber",
                        "description")));
    }

    @Test
    void postInvalidFieldValuesAreReportedFieldByField() throws Exception {
        String body = """
                {
                  "claimantName": "Ada Lovelace",
                  "claimantEmail": "not-an-email",
                  "claimantPhone": "call me",
                  "policyNumber": "POL-12345",
                  "incidentDate": "%s",
                  "claimType": "AUTO",
                  "description": "Storm damage.",
                  "amount": 0
                }
                """.formatted(LocalDate.now().plusDays(1));

        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems(
                        "claimantEmail",
                        "claimantPhone",
                        "incidentDate",
                        "amount")));
    }

    @Test
    void postUnrecognizedClaimTypeReturns400ForThatField() throws Exception {
        String body = validClaim().replace("\"AUTO\"", "\"BOGUS\"");

        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems("claimType")));
    }

    @Test
    void postMalformedJsonReturns400WithTheSharedErrorShape() throws Exception {
        mockMvc.perform(post("/claims")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Malformed JSON request body"))
                .andExpect(jsonPath("$.fieldErrors").isArray());
    }

    @Test
    void getByIdReturnsTheFullRecord() throws Exception {
        String id = submitClaim(validClaim());

        mockMvc.perform(get("/claims/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.claimantName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.claimantEmail").value("ada.lovelace@example.com"))
                .andExpect(jsonPath("$.claimantPhone").value("555-0100"))
                .andExpect(jsonPath("$.policyNumber").value("POL-12345"))
                .andExpect(jsonPath("$.incidentDate").value("2024-05-20"))
                .andExpect(jsonPath("$.claimType").value("AUTO"))
                .andExpect(jsonPath("$.description")
                        .value("Rear-ended while stopped at a traffic light."))
                .andExpect(jsonPath("$.amount").value(1500.00))
                .andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void getByIdReturnsExactlyTheRequestedClaim() throws Exception {
        String firstId = submitClaim(validClaim());
        String secondBody = validClaim()
                .replace("Ada Lovelace", "Grace Hopper")
                .replace("POL-12345", "POL-777")
                .replace("1500.00", "4200.50");
        String secondId = submitClaim(secondBody);

        assertNotEquals(firstId, secondId, "each accepted claim gets a unique id");

        mockMvc.perform(get("/claims/{id}", secondId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(secondId))
                .andExpect(jsonPath("$.claimantName").value("Grace Hopper"))
                .andExpect(jsonPath("$.policyNumber").value("POL-777"))
                .andExpect(jsonPath("$.amount").value(4200.50));

        mockMvc.perform(get("/claims/{id}", firstId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(firstId))
                .andExpect(jsonPath("$.claimantName").value("Ada Lovelace"));
    }

    @Test
    void getByIdReturnsNotFoundWithTheSharedErrorShapeForUnknownId() throws Exception {
        mockMvc.perform(get("/claims/{id}", "CLM-999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.message").value("No claim found with id 'CLM-999999'"))
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    @Test
    void patchStatusUpdatesOnlyTheStatusAndPersistsIt() throws Exception {
        String id = submitClaim(validClaim());

        mockMvc.perform(patch("/claims/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"IN_REVIEW\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.status").value("IN_REVIEW"))
                .andExpect(jsonPath("$.claimantName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.claimantEmail").value("ada.lovelace@example.com"))
                .andExpect(jsonPath("$.claimantPhone").value("555-0100"))
                .andExpect(jsonPath("$.policyNumber").value("POL-12345"))
                .andExpect(jsonPath("$.incidentDate").value("2024-05-20"))
                .andExpect(jsonPath("$.claimType").value("AUTO"))
                .andExpect(jsonPath("$.description")
                        .value("Rear-ended while stopped at a traffic light."))
                .andExpect(jsonPath("$.amount").value(1500.00));

        mockMvc.perform(get("/claims/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_REVIEW"))
                .andExpect(jsonPath("$.claimantName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.amount").value(1500.00));
    }

    @Test
    void patchStatusAcceptsEveryDefinedStatus() throws Exception {
        String id = submitClaim(validClaim());

        for (String status : new String[]{"OPEN", "IN_REVIEW", "CLOSED"}) {
            mockMvc.perform(patch("/claims/{id}/status", id)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"" + status + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value(status));
        }
    }

    @Test
    void patchStatusRejectsUnrecognizedStatus() throws Exception {
        String id = submitClaim(validClaim());

        mockMvc.perform(patch("/claims/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"LOST\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Claim validation failed"))
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems("status")));

        mockMvc.perform(get("/claims/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void patchStatusRejectsMissingStatus() throws Exception {
        String id = submitClaim(validClaim());

        mockMvc.perform(patch("/claims/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[*].field", hasItems("status")));
    }

    @Test
    void patchStatusReturnsNotFoundForUnknownId() throws Exception {
        mockMvc.perform(patch("/claims/{id}/status", "CLM-999999")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CLOSED\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.message").value("No claim found with id 'CLM-999999'"));
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
