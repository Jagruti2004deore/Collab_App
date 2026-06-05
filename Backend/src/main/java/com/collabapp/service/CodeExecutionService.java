package com.collabapp.service;

import com.collabapp.dto.CodeExecutionRequest;
import com.collabapp.dto.CodeExecutionResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CodeExecutionService {

    private final ObjectMapper objectMapper;

    @Value("${compiler.api-url:https://emkc.org/api/v2/piston}")
    private String compilerApiUrl;

    @Value("${compiler.timeout-ms:8000}")
    private int timeoutMs;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public CodeExecutionResponse execute(CodeExecutionRequest request) {
        LanguageRuntime runtime = resolveRuntime(request.getLanguage());
        long startedAt = System.currentTimeMillis();

        try {
            Map<String, Object> payload = Map.of(
                    "language", runtime.language(),
                    "version", "*",
                    "files", List.of(Map.of(
                            "name", runtime.fileName(),
                            "content", request.getCode()
                    )),
                    "stdin", request.getStdin() == null ? "" : request.getStdin(),
                    "args", List.of(),
                    "compile_timeout", timeoutMs,
                    "run_timeout", timeoutMs,
                    "compile_memory_limit", -1,
                    "run_memory_limit", -1
            );

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(normalizeBaseUrl(compilerApiUrl) + "/execute"))
                    .timeout(Duration.ofMillis(timeoutMs + 4000L))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return serviceError(runtime, startedAt, "Compiler service returned HTTP " + response.statusCode());
            }

            return mapCompilerResponse(runtime, response.body(), startedAt);
        } catch (IllegalArgumentException e) {
            return CodeExecutionResponse.builder()
                    .language(request.getLanguage())
                    .status("Unsupported Language")
                    .stdout("")
                    .stderr(e.getMessage())
                    .compileOutput("")
                    .message(e.getMessage())
                    .timeMs(System.currentTimeMillis() - startedAt)
                    .build();
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return serviceError(runtime, startedAt, "Compiler service is unavailable. Set COMPILER_API_URL to a reachable Piston-compatible runner.");
        }
    }

    private CodeExecutionResponse mapCompilerResponse(LanguageRuntime runtime, String body, long startedAt) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        JsonNode compile = root.path("compile");
        JsonNode run = root.path("run");

        String compileOutput = text(compile, "output");
        if (compileOutput.isBlank()) {
            compileOutput = join(text(compile, "stdout"), text(compile, "stderr"));
        }

        String stdout = text(run, "stdout");
        String stderr = text(run, "stderr");
        String runOutput = text(run, "output");
        int compileCode = compile.path("code").asInt(0);
        int runCode = run.path("code").asInt(0);

        String status = "Accepted";
        String message = "Program finished successfully.";

        if (compileCode != 0 || !compileOutput.isBlank()) {
            status = "Compilation Error";
            message = "Compilation failed.";
        } else if (runCode != 0 || !stderr.isBlank()) {
            status = "Runtime Error";
            message = "Program exited with an error.";
        } else if (runOutput.isBlank() && stdout.isBlank()) {
            message = "Program finished without output.";
        }

        return CodeExecutionResponse.builder()
                .language(runtime.language())
                .status(status)
                .stdout(stdout.isBlank() ? runOutput : stdout)
                .stderr(stderr)
                .compileOutput(compileOutput)
                .message(message)
                .timeMs(System.currentTimeMillis() - startedAt)
                .build();
    }

    private CodeExecutionResponse serviceError(LanguageRuntime runtime, long startedAt, String message) {
        return CodeExecutionResponse.builder()
                .language(runtime.language())
                .status("Execution Service Unavailable")
                .stdout("")
                .stderr(message)
                .compileOutput("")
                .message(message)
                .timeMs(System.currentTimeMillis() - startedAt)
                .build();
    }

    private LanguageRuntime resolveRuntime(String language) {
        String normalized = language == null ? "" : language.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "javascript", "js" -> new LanguageRuntime("javascript", "main.js");
            case "python", "py" -> new LanguageRuntime("python", "main.py");
            case "java" -> new LanguageRuntime("java", "Main.java");
            case "c" -> new LanguageRuntime("c", "main.c");
            case "cpp", "c++" -> new LanguageRuntime("cpp", "main.cpp");
            default -> throw new IllegalArgumentException("Supported languages: JavaScript, Python, Java, C, C++.");
        };
    }

    private String normalizeBaseUrl(String url) {
        String clean = url == null || url.isBlank() ? "https://emkc.org/api/v2/piston" : url.trim();
        return clean.endsWith("/") ? clean.substring(0, clean.length() - 1) : clean;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("");
    }

    private String join(String first, String second) {
        if (first == null || first.isBlank()) return second == null ? "" : second;
        if (second == null || second.isBlank()) return first;
        return first + System.lineSeparator() + second;
    }

    private record LanguageRuntime(String language, String fileName) { }
}
