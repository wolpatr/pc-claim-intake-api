package com.example.claimintake.web;

import com.example.claimintake.domain.ClaimType;
import com.example.claimintake.service.ClaimNotFoundException;
import com.example.claimintake.validation.ValidationException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ValidationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleValidation(ValidationException exception) {
        List<ApiFieldError> fieldErrors = exception.getErrors().stream()
                .map(ApiExceptionHandler::toFieldError)
                .toList();
        return new ApiError(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Claim validation failed",
                fieldErrors);
    }

    @ExceptionHandler(ClaimNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handleNotFound(ClaimNotFoundException exception) {
        return new ApiError(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                exception.getMessage(),
                List.of());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleUnreadableBody(HttpMessageNotReadableException exception) {
        return new ApiError(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Malformed JSON request body",
                formatErrors(exception));
    }

    private static List<ApiFieldError> formatErrors(HttpMessageNotReadableException exception) {
        if (exception.getCause() instanceof InvalidFormatException invalidFormat) {
            String field = fieldName(invalidFormat);
            if (field != null) {
                return List.of(new ApiFieldError(field, describe(field, invalidFormat)));
            }
        }
        return List.of();
    }

    private static String fieldName(InvalidFormatException exception) {
        String field = null;
        for (JsonMappingException.Reference reference : exception.getPath()) {
            if (reference.getFieldName() != null) {
                field = reference.getFieldName();
            }
        }
        return field;
    }

    private static String describe(String field, InvalidFormatException exception) {
        Class<?> targetType = exception.getTargetType();
        if (targetType == ClaimType.class) {
            return field + " must be one of "
                    + Arrays.stream(ClaimType.values())
                            .map(Enum::name)
                            .collect(Collectors.joining(", "));
        }
        if (targetType == LocalDate.class) {
            return field + " must be a valid date in yyyy-MM-dd format";
        }
        if (targetType == BigDecimal.class) {
            return field + " must be a decimal number";
        }
        return field + " is invalid";
    }

    private static ApiFieldError toFieldError(String message) {
        int separator = message.indexOf(' ');
        String field = separator > 0 ? message.substring(0, separator) : message;
        return new ApiFieldError(field, message);
    }
}
