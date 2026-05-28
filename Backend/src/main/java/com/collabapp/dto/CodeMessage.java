package com.collabapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class CodeMessage {

    public enum ActionType {
        UPDATE,
        HISTORY_REQ,
        HISTORY_RES
    }

    private ActionType action;
    private String roomId;
    private String username;
    private String language;
    private String code;
    private LocalDateTime updatedAt;
}
