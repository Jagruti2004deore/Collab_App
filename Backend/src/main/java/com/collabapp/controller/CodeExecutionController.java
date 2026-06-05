package com.collabapp.controller;

import com.collabapp.dto.CodeExecutionRequest;
import com.collabapp.dto.CodeExecutionResponse;
import com.collabapp.service.CodeExecutionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rooms/{roomId}/code")
@RequiredArgsConstructor
public class CodeExecutionController {

    private final CodeExecutionService codeExecutionService;

    @PostMapping("/execute")
    public CodeExecutionResponse executeCode(
            @PathVariable String roomId,
            @Valid @RequestBody CodeExecutionRequest request
    ) {
        return codeExecutionService.execute(request);
    }
}
