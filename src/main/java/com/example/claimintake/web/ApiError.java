package com.example.claimintake.web;

import java.util.List;

public record ApiError(int status, String error, String message, List<ApiFieldError> fieldErrors) {
}
