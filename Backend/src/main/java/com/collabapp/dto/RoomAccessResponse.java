package com.collabapp.dto;

import com.collabapp.entity.RoomParticipant;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class RoomAccessResponse {
    private String roomId;
    private String roomName;
    private String username;
    private String requestedBy;
    private RoomParticipant.Role role;
    private RoomParticipant.Status status;
    private LocalDateTime requestedAt;
    private LocalDateTime decidedAt;
}
